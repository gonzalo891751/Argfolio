import type { PriceQuote } from '@/domain/types'

// Map internal symbols to CoinGecko IDs
// Add more as needed. Ideally this comes from a backend or configurable list.
const COINGECKO_MAP: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    ADA: 'cardano',
    DOT: 'polkadot',
    MATIC: 'matic-network',
    LINK: 'chainlink',
    UNI: 'uniswap',
    AAVE: 'aave',
    // Stablecoins (usually overridden, but good to have map)
    USDT: 'tether',
    USDC: 'usd-coin',
    DAI: 'dai',
}

export async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
    // 0. Filter unique and map to IDs
    const uniqueSymbols = Array.from(new Set(symbols.map(s => s.toUpperCase())))
    const idsToFetch: string[] = []
    const symbolToIdMap: Record<string, string> = {}

    for (const sym of uniqueSymbols) {
        const id = COINGECKO_MAP[sym]
        if (id) {
            idsToFetch.push(id)
            symbolToIdMap[sym] = id
        }
    }

    if (idsToFetch.length === 0) {
        return {}
    }

    // 1. Fetch from CoinGecko
    try {
        // Rate limit protection: wait a bit if needed (naive)
        // CoinGecko public API: 10-30 req/min depending on load. Be gentle.
        const idsParam = idsToFetch.join(',')
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsParam}&vs_currencies=usd`

        const response = await fetch(url)

        if (!response.ok) {
            // Handle rate limits explicitly
            if (response.status === 429) {
                console.warn('CoinGecko rate limit hit')
                throw new Error('Rate limit')
            }
            throw new Error(`CoinGecko error: ${response.statusText}`)
        }

        const data = await response.json()

        // 2. Map back to symbols
        const result: Record<string, number> = {}
        for (const sym of uniqueSymbols) {
            const id = symbolToIdMap[sym]
            if (id && data[id] && typeof data[id].usd === 'number') {
                result[sym] = data[id].usd
            }
        }

        return result

    } catch (error) {
        console.error('Failed to fetch crypto prices', error)
        throw error
    }
}
