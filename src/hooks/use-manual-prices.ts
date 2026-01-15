import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { manualPricesRepo } from '@/db'

export function useManualPrices() {
    const queryClient = useQueryClient()

    const { data: prices = [], isLoading } = useQuery({
        queryKey: ['manual-prices'],
        queryFn: () => manualPricesRepo.list(),
    })

    const priceMap = new Map<string, number>()
    prices.forEach(p => priceMap.set(p.instrumentId, p.price))

    const setPriceMutation = useMutation({
        mutationFn: async ({ instrumentId, price }: { instrumentId: string; price: number }) => {
            await manualPricesRepo.set({
                instrumentId,
                price,
                updatedAtISO: new Date().toISOString(),
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['manual-prices'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        },
    })

    const deletePriceMutation = useMutation({
        mutationFn: async (instrumentId: string) => {
            await manualPricesRepo.delete(instrumentId)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['manual-prices'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        },
    })

    return {
        prices,
        priceMap,
        setPrice: (instrumentId: string, price: number) => setPriceMutation.mutate({ instrumentId, price }),
        deletePrice: (instrumentId: string) => deletePriceMutation.mutate(instrumentId),
        isLoading,
    }
}

