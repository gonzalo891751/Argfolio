import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { debtsRepo } from '@/db'
import type { Debt } from '@/domain/types'

export function useDebts() {
    return useQuery({
        queryKey: ['debts'],
        queryFn: () => debtsRepo.listActive(),
    })
}

export function useAllDebts() {
    return useQuery({
        queryKey: ['debts', 'all'],
        queryFn: () => debtsRepo.list(),
    })
}

export function useNextDueDebt() {
    return useQuery({
        queryKey: ['debts', 'nextDue'],
        queryFn: () => debtsRepo.getNextDue(),
    })
}

export function useCreateDebt() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (debt: Debt) => debtsRepo.create(debt),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] })
        },
    })
}

export function useUpdateDebt() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, updates }: { id: string; updates: Partial<Debt> }) =>
            debtsRepo.update(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] })
        },
    })
}

export function usePayDebt() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ id, amount }: { id: string; amount: number }) =>
            debtsRepo.applyPayment(id, amount),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] })
        },
    })
}

export function useDeleteDebt() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (id: string) => debtsRepo.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] })
        },
    })
}
