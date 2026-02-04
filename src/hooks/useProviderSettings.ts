/**
 * useProviderSettings Hook
 * 
 * CRUD operations for provider commission settings.
 * Used to calculate VNR (Valor Neto de Realización) in asset detail views.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db, type ProviderSettings } from '@/db'
import { useCallback } from 'react'

export interface CommissionInput {
    buyPct: number
    sellPct: number
    fixedArs?: number
    fixedUsd?: number
}

// Query key for provider settings
const QUERY_KEY = ['providerSettings']

/**
 * Hook to manage provider commission settings
 */
export function useProviderSettings() {
    const queryClient = useQueryClient()

    // Fetch all settings
    const { data: settings = [], isLoading } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => db.providerSettings.toArray(),
    })

    // Save settings mutation
    const saveMutation = useMutation({
        mutationFn: async ({ providerId, input }: { providerId: string; input: CommissionInput }) => {
            const record: ProviderSettings = {
                id: providerId,
                buyPct: input.buyPct,
                sellPct: input.sellPct,
                fixedArs: input.fixedArs,
                fixedUsd: input.fixedUsd,
                updatedAt: new Date().toISOString(),
            }
            await db.providerSettings.put(record)
            return record
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        },
    })

    // Delete settings mutation
    const deleteMutation = useMutation({
        mutationFn: async (providerId: string) => {
            await db.providerSettings.delete(providerId)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        },
    })

    // Get settings for specific provider
    const getSettings = useCallback(
        (providerId: string): ProviderSettings | undefined => {
            return settings.find(s => s.id === providerId)
        },
        [settings]
    )

    // Check if provider has custom settings
    const hasSettings = useCallback(
        (providerId: string): boolean => {
            return settings.some(s => s.id === providerId)
        },
        [settings]
    )

    // Save settings wrapper
    const saveSettings = useCallback(
        async (providerId: string, input: CommissionInput): Promise<void> => {
            await saveMutation.mutateAsync({ providerId, input })
        },
        [saveMutation]
    )

    // Delete settings wrapper
    const deleteSettings = useCallback(
        async (providerId: string): Promise<void> => {
            await deleteMutation.mutateAsync(providerId)
        },
        [deleteMutation]
    )

    // Calculate VNR (Net Realizable Value)
    const calculateVNR = useCallback(
        (providerId: string, valueArs: number, side: 'buy' | 'sell'): number => {
            const providerSettings = settings.find(s => s.id === providerId)

            if (!providerSettings) {
                // No commission configured, return full value
                return valueArs
            }

            const pct = side === 'sell'
                ? providerSettings.sellPct
                : providerSettings.buyPct

            const fixedArs = providerSettings.fixedArs ?? 0

            // VNR = Value - (Value * pct/100) - Fixed
            const percentageDeduction = valueArs * (pct / 100)
            const vnr = valueArs - percentageDeduction - fixedArs

            return Math.max(0, vnr)
        },
        [settings]
    )

    return {
        settings,
        isLoading,
        getSettings,
        saveSettings,
        deleteSettings,
        hasSettings,
        calculateVNR,
        isSaving: saveMutation.isPending,
        isDeleting: deleteMutation.isPending,
    }
}

/**
 * Calculate VNR for a USD value (standalone function)
 */
export function calculateVNRUsd(
    settings: ProviderSettings | undefined,
    valueUsd: number,
    side: 'buy' | 'sell'
): number {
    if (!settings) return valueUsd

    const pct = side === 'sell' ? settings.sellPct : settings.buyPct
    const fixedUsd = settings.fixedUsd ?? 0

    const percentageDeduction = valueUsd * (pct / 100)
    return Math.max(0, valueUsd - percentageDeduction - fixedUsd)
}
