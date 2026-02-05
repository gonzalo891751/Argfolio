import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchFxRates } from '@/data/providers/dolar-api'
import { useAutoRefresh } from './use-auto-refresh'
import type { FxRates } from '@/domain/types'

const FX_STORAGE_KEY = 'argfolio_fx_rates_cache'

function getStoredFxRates(): FxRates | null {
    try {
        const stored = localStorage.getItem(FX_STORAGE_KEY)
        return stored ? JSON.parse(stored) : null
    } catch (e) {
        return null
    }
}

export function useFxRates() {
    const { refreshInterval, setLastRefreshTime } = useAutoRefresh()

    return useQuery({
        queryKey: ['fxRates'],
        queryFn: async () => {
            // Dev tool to simulate failure
            if ((window as any).SIMULATE_FX_FAILURE) {
                throw new Error('Simulated FX API Failure')
            }

            try {
                const data = await fetchFxRates()

                // Cache successful response
                localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(data))
                setLastRefreshTime(new Date())

                // Update Daily Snapshot
                import('@/lib/daily-snapshot').then(({ updateFxSnapshot }) => {
                    updateFxSnapshot(data)
                }).catch(err => console.error('Failed to update FX snapshot', err))

                return data
            } catch (error) {
                console.warn('FX API failed, attempting fallback...', error)
                const cached = getStoredFxRates()
                if (cached) {
                    return cached
                }
                throw error
            }
        },
        refetchInterval: refreshInterval, // 0 when auto-refresh disabled
        staleTime: 60000, // 1 minute
        retry: 2
    })
}

export function useRefreshFxRates() {
    const queryClient = useQueryClient()

    return () => {
        queryClient.invalidateQueries({ queryKey: ['fxRates'] })
    }
}
