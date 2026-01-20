/**
 * useMarketFci Hook
 * 
 * Fetches FCI (Fondos Comunes de Inversión) data from /api/fci/latest
 * Following the pattern of useMarketCedears.
 */

import { useQuery } from '@tanstack/react-query'
import type { FciFund, FciFundResponse } from '@/domain/fci/types'

export type { FciFund, FciFundResponse }

export interface UseMarketFciOptions {
    enabled?: boolean
    refetchInterval?: number | false
}

async function fetchFciData(): Promise<FciFundResponse> {
    const response = await fetch('/api/fci/latest')

    if (!response.ok) {
        throw new Error(`FCI fetch failed: ${response.status}`)
    }

    return response.json()
}

export function useMarketFci(options: UseMarketFciOptions = {}) {
    const { enabled = true, refetchInterval = false } = options

    const query = useQuery<FciFundResponse, Error>({
        queryKey: ['market', 'fci'],
        queryFn: fetchFciData,
        enabled,
        refetchInterval,
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 15 * 60 * 1000, // 15 minutes (formerly cacheTime)
    })

    return {
        data: query.data,
        items: query.data?.items ?? [],
        asOf: query.data?.asOf ?? null,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    }
}
