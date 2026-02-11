/**
 * FCI Provider - IOL Cash Management (IOLCAMA)
 *
 * Server-side scraper for the IOL public page.
 * The client never calls IOL directly, so there are no CORS issues.
 */

import type { FciFund } from '../types'

const IOL_URL =
    'https://iol.invertironline.com/titulo/cotizacion/BCBA/IOLCAMA/IOL-CASH-MANAGEMENT/'
const FETCH_TIMEOUT_MS = 8_000

export interface IolCamaQuote {
    price: number
    changePct: number | null
    asOfISO: string
}

export function parseIolCamaQuote(html: string): IolCamaQuote | null {
    const text = normalizeHtmlToText(html)
    const price = extractPrice(text)

    if (price == null || !Number.isFinite(price) || price <= 0) {
        return null
    }

    return {
        price,
        changePct: extractChangePct(text),
        asOfISO: new Date().toISOString(),
    }
}

/**
 * Fetches and parses IOLCAMA. Failures return null to avoid breaking the main FCI feed.
 */
export async function buildIolCamaFund(): Promise<FciFund | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
        const res = await fetch(IOL_URL, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'argfolio-bot/1.0',
                Accept: 'text/html',
            },
        })

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
            manager: 'InvertirOnline',
            category: 'Money Market',
            currency: 'ARS',
            vcp: quote.price,
            vcpPer1000: undefined,
            date: new Date().toISOString().split('T')[0],
            variation1d: quote.changePct == null ? null : quote.changePct / 100,
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
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Parses Argentine number formats:
 * "10,446" -> 10.446
 * "1.234,56" -> 1234.56
 */
export function parseArgNumber(raw: string): number | null {
    const cleaned = raw
        .replace(/\s+/g, '')
        .replace(/[$\u00a0]/g, '')
        .replace(/[^0-9,.\-+]/g, '')

    if (!cleaned) return null

    const normalized = cleaned.replace(/\./g, '').replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeHtmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
}

function stripDiacritics(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Layered extraction:
 * 1) "Ultimo Operado ... $ X"
 * 2) "IOL Cash Management ... $ X"
 */
function extractPrice(text: string): number | null {
    const plain = stripDiacritics(text)
    const primary = /Ultimo\s+Operado[\s\S]{0,200}?\$\s*([0-9.,]+)/i.exec(plain)
    if (primary?.[1]) {
        const parsed = parseArgNumber(primary[1])
        if (parsed != null && parsed > 0) return parsed
    }

    const fallback = /IOL\s*Cash\s*Management[\s\S]{0,400}?\$\s*([0-9.,]+)/i.exec(plain)
    if (fallback?.[1]) {
        const parsed = parseArgNumber(fallback[1])
        if (parsed != null && parsed > 0) return parsed
    }

    return null
}

function extractChangePct(text: string): number | null {
    const plain = stripDiacritics(text)

    const withAmount =
        /Variacion\s+diaria[\s\S]{0,200}?\$\s*([0-9.,-]+)\s*\(\s*([0-9.,-]+)\s*%\s*\)/i.exec(plain)
    if (withAmount?.[2]) {
        return parseArgNumber(withAmount[2])
    }

    const pctOnly = /Variacion\s+diaria[\s\S]{0,200}?\(\s*([0-9.,-]+)\s*%\s*\)/i.exec(plain)
    if (pctOnly?.[1]) {
        return parseArgNumber(pctOnly[1])
    }

    return null
}
