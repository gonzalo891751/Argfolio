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
}

export interface CedearOptions {
    page?: number
    pageSize?: number
    sort?: string
    dir?: 'asc' | 'desc'
    mode?: 'top' | 'all'
}

// Known CEDEAR ratios (backup if not parsed from table)
const CEDEAR_RATIOS: Record<string, { text: string; value: number }> = {
    'AAPL': { text: '10:1', value: 10 },
    'MSFT': { text: '3:1', value: 3 },
    'GOOGL': { text: '18:1', value: 18 },
    'GOOG': { text: '18:1', value: 18 },
    'AMZN': { text: '72:1', value: 72 },
    'META': { text: '5:1', value: 5 },
    'NVDA': { text: '4:1', value: 4 },
    'TSLA': { text: '15:1', value: 15 },
    'AMD': { text: '1:1', value: 1 },
    'NFLX': { text: '5:1', value: 5 },
    'DIS': { text: '1:1', value: 1 },
    'KO': { text: '2:1', value: 2 },
    'WMT': { text: '5:1', value: 5 },
    'JPM': { text: '3:1', value: 3 },
    'V': { text: '3:1', value: 3 },
    'MA': { text: '4:1', value: 4 },
    'BAC': { text: '1:1', value: 1 },
    'XOM': { text: '1:1', value: 1 },
    'PFE': { text: '2:1', value: 2 },
    'JNJ': { text: '2:1', value: 2 },
    'BABA': { text: '3:1', value: 3 },
    'MELI': { text: '60:1', value: 60 },
    'GLOB': { text: '10:1', value: 10 },
    'VIST': { text: '3:1', value: 3 },
    'YPF': { text: '1:1', value: 1 },
    'GOLD': { text: '1:1', value: 1 },
    'VALE': { text: '1:1', value: 1 },
    'BBD': { text: '1:1', value: 1 },
    'DESP': { text: '6:1', value: 6 },
    'INTC': { text: '1:1', value: 1 },
    'PYPL': { text: '5:1', value: 5 },
    'UBER': { text: '5:1', value: 5 },
    'SHOP': { text: '10:1', value: 10 },
    'SQ': { text: '3:1', value: 3 },
    'COIN': { text: '4:1', value: 4 },
    'SNOW': { text: '5:1', value: 5 },
    'CRM': { text: '3:1', value: 3 },
    'ADBE': { text: '5:1', value: 5 },
    'ORCL': { text: '1:1', value: 1 },
    'IBM': { text: '2:1', value: 2 },
    'CSCO': { text: '1:1', value: 1 },
}

// Known company names
const CEDEAR_NAMES: Record<string, string> = {
    'AAPL': 'Apple Inc.',
    'MSFT': 'Microsoft Corp.',
    'GOOGL': 'Alphabet Inc.',
    'GOOG': 'Alphabet Inc.',
    'AMZN': 'Amazon.com Inc.',
    'META': 'Meta Platforms',
    'NVDA': 'NVIDIA Corp.',
    'TSLA': 'Tesla Inc.',
    'AMD': 'AMD Inc.',
    'NFLX': 'Netflix Inc.',
    'DIS': 'Walt Disney Co.',
    'KO': 'Coca-Cola Co.',
    'WMT': 'Walmart Inc.',
    'JPM': 'JPMorgan Chase',
    'V': 'Visa Inc.',
    'MA': 'Mastercard Inc.',
    'BAC': 'Bank of America',
    'XOM': 'ExxonMobil',
    'PFE': 'Pfizer Inc.',
    'JNJ': 'Johnson & Johnson',
    'BABA': 'Alibaba Group',
    'MELI': 'MercadoLibre',
    'GLOB': 'Globant S.A.',
    'VIST': 'Vista Energy',
    'YPF': 'YPF S.A.',
    'GOLD': 'Barrick Gold',
    'VALE': 'Vale S.A.',
    'BBD': 'Banco Bradesco',
    'DESP': 'Despegar.com',
    'INTC': 'Intel Corp.',
    'PYPL': 'PayPal Holdings',
    'UBER': 'Uber Technologies',
    'SHOP': 'Shopify Inc.',
    'SQ': 'Block Inc.',
    'COIN': 'Coinbase Global',
    'SNOW': 'Snowflake Inc.',
    'CRM': 'Salesforce Inc.',
    'ADBE': 'Adobe Inc.',
    'ORCL': 'Oracle Corp.',
    'IBM': 'IBM Corp.',
    'CSCO': 'Cisco Systems',
}

function parseARNumber(text: string): number | null {
    if (!text) return null
    const cleaned = text.trim().replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
}

function parseARPercent(text: string): number | null {
    if (!text) return null
    const cleaned = text.trim().replace('%', '').replace(',', '.')
    const num = parseFloat(cleaned)
    return isNaN(num) ? null : num
}

function parseRatio(text: string): { text: string; value: number } | null {
    if (!text) return null
    const match = text.trim().match(/^(\d+):(\d+)$/)
    if (match) {
        const numerator = parseInt(match[1], 10)
        const denominator = parseInt(match[2], 10)
        if (denominator > 0) {
            return { text: text.trim(), value: numerator / denominator }
        }
    }
    return null
}

const PPI_URL = 'https://www.portfoliopersonal.com/Cotizaciones/Cedears'

// Cache valid for 5 minutes
let cache: { data: CedearQuote[]; timestamp: number } | null = null
const CACHE_TTL = 300 * 1000

async function scrapeAllCedears(): Promise<CedearQuote[]> {
    // Check in-process cache first
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.data
    }

    // Attempt to fetch ALL data using a large length parameter.
    // This is a common pattern for DataTables or simple paginated lists.
    const response = await fetch(`${PPI_URL}?length=1000`, {
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
    const tables = root.querySelectorAll('table')
    if (tables.length === 0) throw new Error('No tables found in PPI page')

    const items: CedearQuote[] = []

    // Parse ALL rows found
    for (const table of tables) {
        const rows = table.querySelectorAll('tr')
        for (const row of rows) {
            const cells = row.querySelectorAll('td')
            if (cells.length < 3) continue

            const firstCellText = cells[0].text.trim()
            const firstCellLink = cells[0].querySelector('a')

            let ticker = ''
            if (firstCellLink) {
                ticker = firstCellLink.text.trim()
            } else {
                const words = firstCellText.split(/\s+/)
                if (words[0] && /^[A-Z]{1,5}$/.test(words[0])) ticker = words[0]
            }

            if (!ticker || ticker === 'SYMBOL' || ticker === 'TICKER' || ticker === 'Especie') continue

            let lastPriceArs: number | null = null
            let changePct1d: number | null = null
            let volume: number | null = null
            let ratioFromTable: { text: string; value: number } | null = null

            for (let i = 1; i < cells.length; i++) {
                const cellText = cells[i].text.trim()
                if (!cellText || cellText === '-' || cellText === '--') continue

                if (lastPriceArs === null && /^[0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}$/.test(cellText)) {
                    lastPriceArs = parseARNumber(cellText)
                    continue
                }
                if (lastPriceArs === null && /^[0-9]+,[0-9]{2}$/.test(cellText)) {
                    lastPriceArs = parseARNumber(cellText)
                    continue
                }
                if (changePct1d === null && /^[+-]?[0-9]+,[0-9]+%?$/.test(cellText)) {
                    changePct1d = parseARPercent(cellText)
                    continue
                }
                if (volume === null && /^[0-9]{1,3}(?:\.[0-9]{3})+$/.test(cellText)) {
                    volume = parseARNumber(cellText)
                    continue
                }
                if (!ratioFromTable && /^\d+:\d+$/.test(cellText)) {
                    ratioFromTable = parseRatio(cellText)
                    continue
                }
            }

            if (lastPriceArs !== null && lastPriceArs > 0) {
                const ratio = ratioFromTable || CEDEAR_RATIOS[ticker] || null
                const name = CEDEAR_NAMES[ticker] || ticker

                items.push({
                    kind: 'cedear',
                    ticker,
                    name,
                    lastPriceArs,
                    changePct1d,
                    volume,
                    open: null,
                    low: null,
                    high: null,
                    prevClose: null,
                    ratioText: ratio?.text ?? null,
                    ratio: ratio?.value ?? null,
                    lastQuoteTime: null,
                })
            }
        }
    }

    // Update cache if we got data
    if (items.length > 0) {
        cache = { data: items, timestamp: Date.now() }
    } else {
        if (cache) return cache.data
    }

    return items
}

export async function fetchPpiCedears(options: CedearOptions = {}): Promise<CedearsResponse> {
    const {
        page = 1,
        pageSize = 50,
        sort = 'volume',
        dir = 'desc'
    } = options

    const allItems = await scrapeAllCedears()
    let processed = [...allItems]

    // Sort
    processed.sort((a, b) => {
        let valA: any = a[sort as keyof CedearQuote]
        let valB: any = b[sort as keyof CedearQuote]

        // Handle specific fields
        if (sort === 'lastPrice') valA = a.lastPriceArs; valB = b.lastPriceArs
        if (sort === 'changePct') valA = a.changePct1d; valB = b.changePct1d

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

    return {
        source: 'PPI',
        updatedAt: new Date().toISOString(),
        currency: 'ARS',
        total,
        page,
        pageSize,
        data: sliced,
    }
}
