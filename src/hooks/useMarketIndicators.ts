import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { IndicatorsResponse } from '@/server/market/indicatorsProvider'

const STORAGE_KEY = 'argfolio.marketIndicators.v1'
const TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CachedData {
    timestamp: number
    data: IndicatorsResponse
}

function getCachedData(): CachedData | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return null
        return JSON.parse(stored)
    } catch {
        return null
    }
}

function setCachedData(data: IndicatorsResponse) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data
    }))
}

async function fetchMarketIndicators(): Promise<IndicatorsResponse> {
    const response = await fetch('/api/market/indicators')

    if (!response.ok) {
        throw new Error(`Failed to fetch indicators: ${response.statusText}`)
    }

    const data = await response.json()
    setCachedData(data)
    return data
}

export function useMarketIndicators() {
    const queryClient = useQueryClient()

    const cached = getCachedData()
    const isStale = cached ? Date.now() - cached.timestamp > TTL_MS : true

    const query = useQuery({
        queryKey: ['market', 'indicators'],
        queryFn: fetchMarketIndicators,
        staleTime: 60 * 1000, // 1 minute
        refetchInterval: 5 * 60 * 1000, // 5 minutes auto-refresh
        initialData: cached?.data,
        initialDataUpdatedAt: cached?.timestamp,
    })

    const refetch = () => {
        localStorage.removeItem(STORAGE_KEY)
        queryClient.invalidateQueries({ queryKey: ['market', 'indicators'] })
    }

    return {
        ...query,
        isStale: isStale && !query.isFetching,
        refetch,
    }
}
