import { useQuery } from '@tanstack/react-query'
import { fetchCryptoPrices } from '@/data/providers/crypto-coingecko'
import { useAutoRefresh } from './use-auto-refresh'

const CRYPTO_STORAGE_KEY = 'argfolio_crypto_prices_v1'

// Symbols that are always pinned to 1.0 USD
const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])

// Helper to get cached prices
function getStoredPrices(): Record<string, number> {
    try {
        const stored = localStorage.getItem(CRYPTO_STORAGE_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch {
        return {}
    }
}

export function useCryptoPrices(symbols: string[]) {
    const { refreshInterval, setLastRefreshTime } = useAutoRefresh()

    // Filter relevant symbols (exclude stablecoins from fetching if we want consistent 1.0)
    // Actually we fetch everything that isn't stablecoin.
    const symbolsToFetch = symbols
        .filter(s => !STABLECOINS.has(s.toUpperCase()))
        .filter(s => s !== 'USD' && s !== 'ARS') // Basic currencies

    const queryKey = ['cryptoPrices', symbolsToFetch.sort().join(',')]

    return useQuery({
        queryKey,
        queryFn: async () => {
            // Dev simulation
            if ((window as any).SIMULATE_CRYPTO_FAILURE) {
                throw new Error('Simulated Crypto API Failure')
            }

            try {
                // Fetch real prices
                const fetched = await fetchCryptoPrices(symbolsToFetch)

                // Merge with stablecoins
                const result: Record<string, number> = { ...fetched }

                // Add stablecoins fixed price
                for (const s of symbols) {
                    if (STABLECOINS.has(s.toUpperCase())) {
                        result[s.toUpperCase()] = 1.0
                    }
                }

                // Cache it (merge with existing cache to preserve other symbols if needed, or overwrite?)
                // Overwriting is cleaner for now to avoid stale ghosts, but merging is better for partial failures.
                // Let's merge with existing cache for robustness.
                const currentCache = getStoredPrices()
                const newCache = { ...currentCache, ...result }
                localStorage.setItem(CRYPTO_STORAGE_KEY, JSON.stringify(newCache))

                setLastRefreshTime(new Date())
                return result
            } catch (error) {
                console.warn('Crypto API failed, using cache', error)
                // Fallback to cache for ALL requested symbols
                const cache = getStoredPrices()
                // Return what we have, even if stale
                return cache
            }
        },
        refetchInterval: refreshInterval ?? 5 * 60 * 1000, // Def 5 mins
        staleTime: 60000,
        enabled: symbols.length > 0
    })
}
