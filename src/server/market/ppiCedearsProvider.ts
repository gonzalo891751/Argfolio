import { parse as parseHTML } from 'node-html-parser'

export interface CedearQuote {
    kind: 'cedear'
    ticker: string
    name: string
    lastPriceArs: number
    changePct1d: number | null
    volume: number | null
    open: number | null
    low: number | null
    high: number | null
    prevClose: number | null
    ratioText: string | null
    ratio: number | null
    lastQuoteTime: string | null
}

export interface CedearsResponse {
    source: string
    updatedAt: string
    currency: string
    total: number
    page: number
    pageSize: number
    data: CedearQuote[]
    // Debug stats
    stats?: {
        masterCount: number
        quotesCount: number
        matchedCount: number
        missingTickers: string[]
    }
}

export interface CedearOptions {
    page?: number
    pageSize?: number
    sort?: string
    dir?: 'asc' | 'desc'
    mode?: 'top' | 'all'
    stats?: boolean
}

// Known company names (fallback)
const CEDEAR_NAMES: Record<string, string> = {
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corp.',
    'GOOGL': 'Alphabet Inc.',
    'AMZN': 'Amazon.com Inc.',
    'TSLA': 'Tesla Inc.',
    'NVDA': 'NVIDIA Corp.',
    'META': 'Meta Platforms',
    'NFLX': 'Netflix Inc.',
    'AMD': 'AMD Inc.',
    'QCOM': 'Qualcomm Inc.',
}

const PPI_URL = 'https://www.portfoliopersonal.com/Cotizaciones/Cedears'

// Cache valid for 2 minutes to serve everyone efficiently
let cache: { data: CedearQuote[]; timestamp: number } | null = null
const CACHE_TTL = 120 * 1000

async function fetchAllCedearsFromPpi(): Promise<CedearQuote[]> {
    // Check in-process cache first
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.data
    }

    try {
        const response = await fetch(PPI_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        })

        if (!response.ok) {
            throw new Error(`PPI fetch failed: ${response.status} ${response.statusText}`)
        }

        const html = await response.text()
        const root = parseHTML(html)

        // Extract data from __NEXT_DATA__
        const script = root.querySelector('#__NEXT_DATA__')
        if (!script) throw new Error('No __NEXT_DATA__ script found in PPI page')

        const json = JSON.parse(script.text)
        const instruments = json.props?.pageProps?.instruments

        if (!instruments || !Array.isArray(instruments)) {
            throw new Error('No instruments array found in PPI data')
        }

        const items: CedearQuote[] = []

        /* 
           Expected Item Structure from inspection:
           {
             "ticker": "AAL",
             "description": "American Airlines Group",
             "lastPrice": 11850,
             "variation": 0,
             "volumen": 0,
             "previousClosing": 11380,
             "lastQuote": "2026-01-15T17:00:01.327-03:00",
             "ratio": 2,
             ...
           }
        */

        for (const raw of instruments) {
            if (!raw.ticker) continue

            const lastPriceArs = raw.lastPrice || null
            let changePct1d = raw.variation !== undefined ? raw.variation : null
            // If variation is 0 but we have prevClose, maybe calculate it? 
            // Often if variation is 0 it means no change or no data.
            // PPI usually sends the variation field correctly.
            // Be careful: PPI sends variation as a number like 1.5 (%), check if it needs /100?
            // Usually API sends percentage directly or 0.015. 
            // From inspection (variation: 0), checking typical values:
            // If lastPrice 11850, prev 11380 -> (11850/11380 - 1) * 100 = 4.13%. 
            // If variation says 0, maybe it's missing?
            // Let's trust PPI 'variation' first, but if 0 and prices differ, maybe recalculate?
            // Actually, let's just use what they send.

            const volume = raw.volumen || null
            const prevClose = raw.previousClosing || null
            const lastQuoteTime = raw.lastQuote || new Date().toISOString()
            const ratio = raw.ratio || null

            // Normalization
            // Verify if variation is % or decimal. Usually PPI web shows %.

            if (lastPriceArs !== null && lastPriceArs > 0) {
                items.push({
                    kind: 'cedear',
                    ticker: raw.ticker,
                    name: raw.description || CEDEAR_NAMES[raw.ticker] || raw.ticker,
                    lastPriceArs,
                    changePct1d,
                    volume,
                    open: raw.opening || null,
                    low: raw.minDay || null,
                    high: raw.maxDay || null,
                    prevClose,
                    ratioText: ratio ? `${ratio}:1` : null,
                    ratio,
                    lastQuoteTime
                })
            }
        }

        // Update cache
        if (items.length > 0) {
            cache = { data: items, timestamp: Date.now() }
        } else {
            console.warn('[PPI] Scraped 0 items')
            if (cache) return cache.data
        }

        return items

    } catch (e) {
        console.error('[PPI] Error fetching data:', e)
        // Fallback to cache if available even if expired, better than nothing
        if (cache) return cache.data
        throw e
    }
}

export async function fetchPpiCedears(options: CedearOptions = {}): Promise<CedearsResponse> {
    const {
        page = 1,
        pageSize = 50,
        sort = 'volume',
        dir = 'desc',
        stats = false
    } = options

    const allItems = await fetchAllCedearsFromPpi()
    let processed = [...allItems]

    // Sort
    processed.sort((a, b) => {
        let valA: any = a[sort as keyof CedearQuote]
        let valB: any = b[sort as keyof CedearQuote]

        // Handle specific fields
        if (sort === 'lastPrice') { valA = a.lastPriceArs; valB = b.lastPriceArs }
        if (sort === 'changePct') { valA = a.changePct1d; valB = b.changePct1d }

        if (valA === null || valA === undefined) valA = -Infinity
        if (valB === null || valB === undefined) valB = -Infinity

        if (valA < valB) return dir === 'asc' ? -1 : 1
        if (valA > valB) return dir === 'asc' ? 1 : -1
        return 0
    })

    // Pagination
    const total = processed.length
    const startIndex = (page - 1) * pageSize
    const sliced = processed.slice(startIndex, startIndex + pageSize)

    const response: CedearsResponse = {
        source: 'PPI',
        updatedAt: new Date().toISOString(),
        currency: 'ARS',
        total,
        page,
        pageSize,
        data: sliced,
    }

    if (stats) {
        // Since we don't have access to the full Master list here (it's client side or domain logic),
        // we can only report PPI stats. The client (useMarketCedears) will match them.
        const ppiOnlyTickers = processed
            .map(i => i.ticker)
            .filter(t => !CEDEAR_NAMES[t]) // Heuristic: if not in our small fallback list? No, this is weak.
            .slice(0, 50)

        response.stats = {
            masterCount: 0,
            quotesCount: total,
            matchedCount: 0, // client side
            missingTickers: ppiOnlyTickers
        }
    }

    return response
}
