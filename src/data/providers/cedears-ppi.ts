export interface CedearQuote {
    ticker: string
    lastPriceArs: number
    changePct?: number
}

export interface CedearApiResponse {
    source: string
    updatedAt: string
    items: CedearQuote[]
}

interface NewPpiResponse {
    source: string
    updatedAt: string
    data: Array<{
        ticker: string
        lastPriceArs: number
        changePct1d: number | null
    }>
}

export async function fetchCedearPrices(): Promise<CedearApiResponse> {
    // Use the new server-side robust endpoint
    const response = await fetch('/api/market/cedears?pageSize=1000&mode=all')

    if (!response.ok) {
        throw new Error(`Failed to fetch CEDEAR prices: ${response.statusText}`)
    }

    const json: NewPpiResponse = await response.json()

    // Adapt to legacy response format for compatibility
    return {
        source: json.source,
        updatedAt: json.updatedAt,
        items: json.data.map(item => ({
            ticker: item.ticker,
            lastPriceArs: item.lastPriceArs,
            changePct: item.changePct1d ?? undefined
        }))
    }
}
