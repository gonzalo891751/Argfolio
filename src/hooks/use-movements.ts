import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { movementsRepo } from '@/db'
import type { Movement } from '@/domain/types'

export function useMovements() {
    return useQuery({
        queryKey: ['movements'],
        queryFn: () => movementsRepo.list(),
    })
}

export function useMovementsByInstrument(instrumentId: string) {
    return useQuery({
        queryKey: ['movements', 'instrument', instrumentId],
        queryFn: () => movementsRepo.listByInstrument(instrumentId),
        enabled: !!instrumentId,
    })
}

export function useCreateMovement() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (movement: Movement) => movementsRepo.create(movement),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        },
    })
}

export function useUpdateMovement() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Movement> }) =>
            movementsRepo.update(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        },
    })
}

export function useDeleteMovement() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => movementsRepo.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        },
    })
}
