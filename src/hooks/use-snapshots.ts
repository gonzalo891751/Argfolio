import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { snapshotsRepo } from '@/db'
import type { Snapshot, FxType } from '@/domain/types'
import { useComputedPortfolio } from './use-computed-portfolio'
import { useFxRates } from './use-fx-rates'

export function useSnapshots() {
    return useQuery({
        queryKey: ['snapshots'],
        queryFn: () => snapshotsRepo.list(),
    })
}

export function useSaveSnapshot() {
    const queryClient = useQueryClient()
    const { data: portfolio } = useComputedPortfolio()
    const { data: fxRates } = useFxRates()

    return useMutation({
        mutationFn: async (baseFx: FxType = 'MEP') => {
            if (!portfolio || !fxRates) {
                throw new Error('Portfolio data not available')
            }

            const today = new Date().toISOString().split('T')[0]

            // Check if snapshot already exists for today
            const existing = await snapshotsRepo.getByDate(today)
            if (existing) {
                throw new Error('Ya existe un snapshot para hoy')
            }

            const snapshot: Snapshot = {
                id: `snapshot-${Date.now()}`,
                dateLocal: today,
                totalARS: portfolio.totalARS,
                totalUSD: portfolio.totalUSD,
                fxUsed: {
                    usdArs: fxRates.mep,
                    type: baseFx,
                },
                createdAtISO: new Date().toISOString(),
            }

            return snapshotsRepo.create(snapshot)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        },
    })
}

export function useDeleteSnapshot() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => snapshotsRepo.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        },
    })
}
