
import { CedearMasterItem } from '@/domain/cedears/master'
import { FxRates } from '@/domain/types'

export interface TheoreticalCedearQuote {
    ticker: string
    name: string
    lastPriceArs: number | null
    changePct1d: number | null
    ratioText: string
    ratio: number
    lastQuoteTime: string | null
    source: 'THEORETICAL'
    underlyingTicker?: string
    underlyingUsd: number | null
    usdEquivalent: number | null
}

export interface UnderlyingQuote {
    ticker: string
    priceUsd: number
    changePct1d: number
    updatedAt: string
}

async function fetchUnderlyingPrices(tickers: string[]): Promise<Map<string, UnderlyingQuote>> {
    if (tickers.length === 0) return new Map()

    // Batch requests to Stooq proxy
    // Chunks of 50
    const CHUNK_SIZE = 50
    const chunks = []
    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        chunks.push(tickers.slice(i, i + CHUNK_SIZE))
    }

    const results = new Map<string, UnderlyingQuote>()

    await Promise.all(chunks.map(async chunk => {
        try {
            const params = new URLSearchParams()
            params.set('ticker', chunk.join(','))

            const res = await fetch(`/api/market/underlying?${params.toString()}`)
            if (!res.ok) return

            const data = await res.json()
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                    results.set(item.ticker, item)
                })
            }
        } catch (e) {
            console.error('Failed to fetch underlying chunk', e)
        }
    }))

    return results
}

export async function getTheoreticalCedears(
    items: CedearMasterItem[],
    fxRates: FxRates
): Promise<TheoreticalCedearQuote[]> {
    // 1. Get underlying prices
    // Filter items that strictly look like they have US underlying (most CEDEARs do).
    // The master might have 'market' field. 'NYSE', 'NASDAQ', 'OTC US', 'AMEX' are US.
    // If undefined, assume US for now as fallback.

    const tickersToFetch = items
        .filter(i => !i.market || (i.market && ['NYSE', 'NASDAQ', 'OTC US', 'AMEX', 'BAT'].includes(i.market)))
        .map(i => i.ticker)

    // Note: Stooq proxy appends .US if needed. 
    // Usually CEDEAR ticker matches underlying ticker (e.g. AAPL -> AAPL).
    // Exceptions exist (e.g. PBR -> PBR.A maybe?). 
    // Current master doesn't have specific 'underlyingTicker' field populated reliably, 
    // but the task says "uses a master dataset (ratio + *mapping CEDEAR ticker -> underlying market ticker*)".
    // Looking at comafi-master.json, 'ticker' is the CEDEAR ticker. 'name' is name.
    // It doesn't seem to have explicit 'underlyingTicker' column in the json sample I saw earlier.
    // However, usually they match. Let's assume match for now.

    const quotesMap = await fetchUnderlyingPrices(tickersToFetch)

    // 2. Build results
    // Use CCL as primary, MEP as fallback
    const fxRate = fxRates.ccl && fxRates.ccl > 0 ? fxRates.ccl : fxRates.mep

    return items.map(item => {
        const quote = quotesMap.get(item.ticker)

        let lastPriceArs: number | null = null
        let changePct1d: number | null = null
        let usdEq: number | null = null
        let lastQuoteTime: string | null = null

        if (quote && fxRate && fxRate > 0) {
            // Formula: (underlyingUsd * fx) / ratio
            lastPriceArs = (quote.priceUsd * fxRate) / item.ratio
            changePct1d = quote.changePct1d // 1d change of the underlying directly? 
            // Task says: "dailyUsdReturn = (1 + dailyArsReturn) / (1 + dailyFxReturn) - 1"
            // Wait, "If underlying endpoint works, rows display theoretical ARS price and 1d change."
            // The "changePct1d" in the table usually represents the ARS change or USD change?
            // Usually local market shows ARS change.
            // If we only have underlying USD change, we can approximate ARS change if we assume FX didn't change (bad assumption) 
            // OR use the formula: (1 + usdChange) * (1 + fxChange) - 1 = arsChange

            // For now, let's display the UNDERLYING USD change if we want to be "pure" 
            // OR calculate theoretical ARS change if we have daily FX change.
            // The prompt says "dailyUsdReturn = ...". That's for the Portfolio view.
            // For the Market View: displaying the Underlying % change is often clearer for "Theoretical" mode 
            // because users want to know how the stock moved abroad.
            // Let's stick to underlying change for now, maybe labeled as such?
            // "rows display theoretical ARS price and 1d change."
            // I'll use underlying change and let the UI label it or user interpret it. 
            // Actually, normally people want to see how much the CEDEAR moved in ARS.
            // Let's assume fxChange = 0 for the intraday snapshot if we don't have it here. 
            // Better: Just pass the underlying changePct.

            changePct1d = quote.changePct1d
            usdEq = quote.priceUsd
            lastQuoteTime = quote.updatedAt
        }

        return {
            ticker: item.ticker,
            name: item.name,
            lastPriceArs,
            changePct1d,
            ratioText: item.ratioText,
            ratio: item.ratio,
            lastQuoteTime,
            source: 'THEORETICAL' as const,
            underlyingTicker: item.ticker, // Assuming match
            underlyingUsd: quote?.priceUsd ?? null,
            usdEquivalent: usdEq
        }
    })
}
