/**
 * FCI Provider — IOL Cash Management (IOLCAMA)
 *
 * Server-side scraper for the IOL Cash Management fund (IOLCAMA).
 * Fetches the public IOL page, parses the VCP from the HTML,
 * and returns a single FciFund record.
 *
 * This runs ONLY on Cloudflare Workers/Pages Functions (server-side).
 * The client never calls IOL directly (no CORS issues).
 */

import type { FciFund } from '../types'

const IOL_URL =
    'https://iol.invertironline.com/titulo/cotizacion/BCBA/IOLCAMA/IOL-CASH-MANAGEMENT/'

/** Timeout for the IOL fetch (ms) */
const FETCH_TIMEOUT_MS = 8_000

// ─── Public interface ────────────────────────────────────────────────

export interface IolCamaQuote {
    price: number
    changePct: number | null
    asOfISO: string
}

/**
 * Parse the IOLCAMA VCP from the raw HTML of the IOL page.
 *
 * IOL renders the price inside `<strong>` tags like:
 *   <strong>$ 10,446</strong>
 *
 * Number format is es-AR: comma = decimal separator, period = thousands.
 * Possible shapes: "10,446"  |  "1.234,56"  |  "10446"
 */
export function parseIolCamaQuote(html: string): IolCamaQuote | null {
    const price = extractPrice(html)
    if (price == null || !Number.isFinite(price) || price <= 0) return null

    const changePct = extractChangePct(html)

    return {
        price,
        changePct,
        asOfISO: new Date().toISOString(),
    }
}

/**
 * Fetch the IOL page server-side and build an FciFund.
 * Returns null on any failure (network, parse, timeout).
 */
export async function buildIolCamaFund(): Promise<FciFund | null> {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const res = await fetch(IOL_URL, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Argfolio/1.0',
                Accept: 'text/html',
            },
        })
        clearTimeout(timer)

        if (!res.ok) {
            console.warn(`[IolCama] HTTP ${res.status} from IOL`)
            return null
        }

        const html = await res.text()
        const quote = parseIolCamaQuote(html)

        if (!quote) {
            console.warn('[IolCama] Could not parse price from IOL HTML')
            return null
        }

        return {
            id: 'custom-iolcama',
            name: 'IOL Cash Management (IOLCAMA)',
            manager: 'IOL',
            category: 'Money Market',
            currency: 'ARS',
            vcp: quote.price,
            vcpPer1000: undefined,
            date: new Date().toISOString().split('T')[0],
            variation1d: quote.changePct != null ? quote.changePct / 100 : null,
            term: 'T+0',
            techSheetUrl: IOL_URL,
        }
    } catch (err: unknown) {
        const e = err as Error | undefined
        if (e?.name === 'AbortError') {
            console.warn('[IolCama] Fetch timed out')
        } else {
            console.error('[IolCama] Fetch error:', e?.message ?? err)
        }
        return null
    }
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Parse an Argentine-formatted number string to a JS number.
 *   "10,446"     → 10.446
 *   "1.234,56"   → 1234.56
 *   "10446"      → 10446
 *   "$ 10,446"   → 10.446
 */
export function parseArgNumber(raw: string): number | null {
    // Strip currency symbols, spaces, non-breaking spaces
    let s = raw.replace(/[$\s\u00a0]/g, '').trim()
    if (!s) return null

    // If the string has both period and comma, the comma is the decimal separator
    // e.g. "1.234,56" → remove periods → "1234,56" → replace comma → "1234.56"
    if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.')
    } else if (s.includes(',')) {
        // Only comma → it's the decimal separator: "10,446" → "10.446"
        s = s.replace(',', '.')
    }
    // If only periods → could be thousands (e.g. "10.446") or decimal
    // Heuristic: if exactly 3 digits after the last period, it's thousands
    else if (s.includes('.')) {
        const parts = s.split('.')
        const lastPart = parts[parts.length - 1]
        if (lastPart.length === 3 && parts.length === 2) {
            // Ambiguous: "10.446" could be 10446 (thousands) or 10.446 (decimal)
            // For a Money Market FCI VCP, values < 100 are very unlikely;
            // values in thousands are common → treat as thousands separator
            s = s.replace(/\./g, '')
        }
        // Otherwise keep as-is (e.g. "1.5" → 1.5)
    }

    const num = Number(s)
    return Number.isFinite(num) ? num : null
}

/**
 * Extract the main price from the IOL HTML.
 *
 * Strategies (in order of preference):
 *  1. Look for the first <strong> containing "$ <number>" pattern
 *  2. Look for any element with text matching "Último" near a price
 */
function extractPrice(html: string): number | null {
    // Strategy 1: first <strong> with "$ <number>" — this is typically the main price
    const strongPriceRe = /<strong[^>]*>\s*\$\s*([\d.,]+)\s*<\/strong>/gi
    let match: RegExpExecArray | null

    while ((match = strongPriceRe.exec(html)) !== null) {
        const parsed = parseArgNumber(match[1])
        if (parsed != null && parsed > 0) return parsed
    }

    // Strategy 2: broader — look for "$ <number>" near "ltimo" (Último)
    const ultimoRe = /[Úú]ltimo[^<]{0,40}\$\s*([\d.,]+)/gi
    match = ultimoRe.exec(html)
    if (match) {
        const parsed = parseArgNumber(match[1])
        if (parsed != null && parsed > 0) return parsed
    }

    return null
}

/**
 * Extract the daily variation percentage from the IOL HTML.
 *
 * IOL shows something like: "$ 0,00 (0,00 %)" or "$ -0,12 (-1,15 %)"
 */
function extractChangePct(html: string): number | null {
    // Look for pattern "(  <number> %)" inside <strong> or near the price area
    const pctRe = /\(\s*([+-]?\s*[\d.,]+)\s*%\s*\)/g
    const match = pctRe.exec(html)
    if (!match) return null

    const raw = match[1].replace(/\s/g, '')
    const parsed = parseArgNumber(raw)
    return parsed
}
