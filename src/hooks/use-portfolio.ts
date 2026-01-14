import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mockProvider } from '@/data/providers/mock'
import { useAutoRefresh } from './use-auto-refresh'
// TimeRange no longer needed since useTimeseries was removed

export function usePortfolio() {
    const { refreshInterval, setLastRefreshTime } = useAutoRefresh()

    return useQuery({
        queryKey: ['portfolio'],
        queryFn: async () => {
            const data = await mockProvider.getPortfolioSnapshot()
            setLastRefreshTime(new Date())
            return data
        },
        refetchInterval: refreshInterval,
        staleTime: 60000, // 1 minute
    })
}

// Note: useTimeseries moved to use-snapshots.ts (now uses snapshots as timeseries)
// Note: useDebts moved to use-debts.ts (now uses Dexie persistence)

export function useRefreshAll() {
    const queryClient = useQueryClient()
    const { setLastRefreshTime } = useAutoRefresh()

    return async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
            queryClient.invalidateQueries({ queryKey: ['fxRates'] }),
            queryClient.invalidateQueries({ queryKey: ['marketTape'] }),
            queryClient.invalidateQueries({ queryKey: ['debts'] }),
        ])
        setLastRefreshTime(new Date())
    }
}
