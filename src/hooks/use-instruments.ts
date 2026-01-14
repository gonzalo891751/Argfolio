import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instrumentsRepo, accountsRepo } from '@/db'
import type { Instrument, Account } from '@/domain/types'

export function useInstruments() {
    return useQuery({
        queryKey: ['instruments'],
        queryFn: () => instrumentsRepo.list(),
    })
}

export function useAccounts() {
    return useQuery({
        queryKey: ['accounts'],
        queryFn: () => accountsRepo.list(),
    })
}

export function useCreateInstrument() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (instrument: Instrument) => instrumentsRepo.create(instrument),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['instruments'] })
        },
    })
}

export function useCreateAccount() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (account: Account) => accountsRepo.create(account),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
        },
    })
}
