import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface CryptoMarketItem {
    kind: 'crypto'
    id: string
    ticker: string
    name: string
    priceUsd: number
    changePct24h: number | null
    marketCap: number | null
    volume24h: number | null
    image: string | null
}

export interface UseMarketCryptoOptions {
    mode?: 'my' | 'top100' | 'top250'
    page?: number
    pageSize?: number
    sort?: string // Client-side sort mainly
    dir?: 'asc' | 'desc'
}

interface CoinGeckoMarketItem {
    id: string
    symbol: string
    name: string
    image: string
    current_price: number
    market_cap: number
    total_volume: number
    price_change_percentage_24h: number
}

const STORAGE_KEY = 'argfolio.marketCrypto.v1'

function getCachedData(mode: string): CryptoMarketItem[] | null {
    try {
        const key = `${STORAGE_KEY}.${mode}`
        const stored = localStorage.getItem(key)
        if (!stored) return null
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

function setCachedData(mode: string, data: CryptoMarketItem[]) {
    const key = `${STORAGE_KEY}.${mode}`
    localStorage.setItem(key, JSON.stringify(data))
}

// Symbols for "Mis criptos" mode - common held assets
const MY_CRYPTO_IDS = [
    'bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot',
    'chainlink', 'uniswap', 'aave', 'matic-network',
    'tether', 'usd-coin', 'dai'
]

async function fetchCryptoMarkets(mode: 'my' | 'top100' | 'top250'): Promise<CryptoMarketItem[]> {
    let url = ''

    if (mode === 'my') {
        url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MY_CRYPTO_IDS.join(',')}&order=market_cap_desc&per_page=50&page=1`
    } else if (mode === 'top100') {
        url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1`
    } else { // top250
        // Max per_page is 250
        url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1`
    }

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json'
        }
    })

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('CoinGecko rate limit - try again in a minute')
        }
        throw new Error(`CoinGecko error: ${response.statusText}`)
    }

    const data: CoinGeckoMarketItem[] = await response.json()

    return data.map(item => ({
        kind: 'crypto' as const,
        id: item.id,
        ticker: item.symbol.toUpperCase(),
        name: item.name,
        priceUsd: item.current_price,
        changePct24h: item.price_change_percentage_24h,
        marketCap: item.market_cap,
        volume24h: item.total_volume,
        image: item.image
    }))
}

export function useMarketCrypto(options: UseMarketCryptoOptions = {}) {
    const { mode = 'my', page = 1, pageSize = 50, sort = 'marketCap', dir = 'desc' } = options
    const queryClient = useQueryClient()

    const cached = getCachedData(mode)

    const query = useQuery({
        queryKey: ['market', 'crypto', mode],
        queryFn: async () => {
            try {
                const data = await fetchCryptoMarkets(mode)
                setCachedData(mode, data)
                return data
            } catch (error) {
                console.warn('Crypto fetch failed, using cache', error)
                const cachedData = getCachedData(mode)
                if (cachedData) return cachedData
                throw error
            }
        },
        staleTime: 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
        initialData: cached ?? undefined,
        placeholderData: (prev) => prev
    })

    const refetch = () => {
        localStorage.removeItem(`${STORAGE_KEY}.${mode}`)
        queryClient.invalidateQueries({ queryKey: ['market', 'crypto', mode] })
    }

    // Client-side pagination & sorting
    // We treat the "data" as the full dataset for that mode
    const allRows = Array.isArray(query.data) ? query.data : []
    const total = allRows.length

    // Sort
    const sorted = [...allRows].sort((a, b) => {
        let valA: any = a[sort as keyof CryptoMarketItem]
        let valB: any = b[sort as keyof CryptoMarketItem]

        if (sort === 'marketCap') { valA = a.marketCap; valB = b.marketCap }
        if (sort === 'volume') { valA = a.volume24h; valB = b.volume24h }
        if (sort === 'changePct') { valA = a.changePct24h; valB = b.changePct24h }
        if (sort === 'lastPrice') { valA = a.priceUsd; valB = b.priceUsd }

        if (valA == null) valA = -Infinity
        if (valB == null) valB = -Infinity

        if (valA < valB) return dir === 'asc' ? -1 : 1
        if (valA > valB) return dir === 'asc' ? 1 : -1
        return 0
    })

    // Paginate
    const startIndex = (page - 1) * pageSize
    const rows = sorted.slice(startIndex, startIndex + pageSize)

    return {
        rows,
        total,
        page,
        pageSize,
        isLoading: query.isLoading,
        error: query.error,
        refetch,
    }
}
