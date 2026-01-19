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
        mutationFn: async (account: Account) => {
            // Idempotency check
            const all = await accountsRepo.list()
            const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
            const target = normalize(account.name)

            const existing = all.find(a => normalize(a.name) === target)
            if (existing) return existing

            await accountsRepo.create(account)
            return account
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
        },
    })
}
