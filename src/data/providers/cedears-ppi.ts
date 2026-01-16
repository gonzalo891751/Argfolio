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

export async function fetchCedearPrices(): Promise<CedearApiResponse> {
    const response = await fetch('/api/cedears/prices')

    if (!response.ok) {
        throw new Error(`Failed to fetch CEDEAR prices: ${response.statusText}`)
    }

    return response.json()
}
