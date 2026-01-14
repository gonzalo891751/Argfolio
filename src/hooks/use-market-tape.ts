import { useQuery } from '@tanstack/react-query'
import { mockProvider } from '@/data/providers/mock'
import { useAutoRefresh } from './use-auto-refresh'

export function useMarketTape() {
    const { refreshInterval } = useAutoRefresh()

    return useQuery({
        queryKey: ['marketTape'],
        queryFn: () => mockProvider.getMarketTape(),
        refetchInterval: refreshInterval,
        staleTime: 30000, // 30 seconds
    })
}
