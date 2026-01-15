import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface MarketCedearItem {
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

export interface MarketCedearsResponse {
    source: string
    updatedAt: string
    currency: string
    total: number
    page: number
    pageSize: number
    data: MarketCedearItem[]
    warning?: string
}

export interface UseMarketCedearsOptions {
    page?: number
    pageSize?: number
    sort?: string
    dir?: 'asc' | 'desc'
    mode?: 'top' | 'all'
}

const STORAGE_KEY = 'argfolio.marketCedears.v1'

// Helper to manage cache manually if needed, though react-query handles it well.
// We keep this specific localStorage cache for potential offline start or initialData
// but now that it's paginated, caching page 1 is most important.
function getCachedData(): MarketCedearsResponse | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return null
        return JSON.parse(stored)
    } catch {
        return null
    }
}

function setCachedData(data: MarketCedearsResponse) {
    // Only cache the default view (Top 50) to avoid filling storage
    if (data.page === 1 && data.pageSize === 50 && (!data.total || data.total > 0)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
}

async function fetchCedears(options: UseMarketCedearsOptions = {}): Promise<MarketCedearsResponse> {
    const params = new URLSearchParams()
    if (options.page) params.set('page', options.page.toString())
    if (options.pageSize) params.set('pageSize', options.pageSize.toString())
    if (options.sort) params.set('sort', options.sort)
    if (options.dir) params.set('dir', options.dir)
    if (options.mode) params.set('mode', options.mode)

    const response = await fetch(`/api/market/cedears?${params.toString()}`, {
        headers: {
            'Accept': 'application/json'
        }
    })

    if (!response.ok) {
        throw new Error(`Market API error: ${response.statusText}`)
    }

    return response.json()
}

export function useMarketCedears(options: UseMarketCedearsOptions = {}) {
    const { page = 1, pageSize = 50, sort = 'volume', dir = 'desc', mode = 'top' } = options
    const queryClient = useQueryClient()

    // Only use initialData for the default view
    const isDefaultView = page === 1 && pageSize === 50 && sort === 'volume' && dir === 'desc' && mode === 'top'
    const cached = isDefaultView ? getCachedData() : undefined

    const query = useQuery({
        queryKey: ['market', 'cedears', { page, pageSize, sort, dir, mode }],
        queryFn: async () => {
            try {
                const data = await fetchCedears(options)
                if (isDefaultView) {
                    setCachedData(data)
                }
                return data
            } catch (error) {
                console.warn('CEDEAR fetch failed, trying cache', error)
                if (isDefaultView) {
                    const cachedData = getCachedData()
                    if (cachedData) return cachedData
                }
                throw error
            }
        },
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 5 * 60 * 1000, // 5 minutes
        initialData: cached ?? undefined,
        placeholderData: (previousData) => previousData, // Keep data while fetching new page
    })

    const refetch = () => {
        if (isDefaultView) {
            localStorage.removeItem(STORAGE_KEY)
        }
        queryClient.invalidateQueries({ queryKey: ['market', 'cedears'] })
    }

    // Extract data with safe defaults
    const data = query.data
    const rows = Array.isArray(data?.data) ? data.data : []
    const total = data?.total ?? 0
    const currentPage = data?.page ?? page
    const pageSizeResult = data?.pageSize ?? pageSize

    return {
        rows,
        total,
        page: currentPage,
        pageSize: pageSizeResult,
        isLoading: query.isLoading,
        error: query.error,
        dataUpdatedAt: query.dataUpdatedAt,
        refetch,
    }
}
