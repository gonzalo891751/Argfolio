/**
 * useAccountSettings Hook
 * 
 * CRUD operations for account settings (display names, rubro overrides, TNA overrides).
 * Used to customize account display and classification in V2 portfolio views.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db, type AccountSettings, type RubroOverride } from '@/db'
import { useCallback } from 'react'

export interface AccountSettingsInput {
    displayNameOverride?: string
    rubroOverride?: RubroOverride
    tnaOverride?: number
    hidden?: boolean
}

// Query key for account settings
const QUERY_KEY = ['accountSettings']

/**
 * Hook to manage account settings (display names, rubro overrides)
 */
export function useAccountSettings() {
    const queryClient = useQueryClient()

    // Fetch all settings
    const { data: settings = [], isLoading } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: () => db.accountSettings.toArray(),
    })

    // Save settings mutation
    const saveMutation = useMutation({
        mutationFn: async ({ accountId, input }: { accountId: string; input: AccountSettingsInput }) => {
            const existing = await db.accountSettings.get(accountId)
            const record: AccountSettings = {
                id: accountId,
                displayNameOverride: input.displayNameOverride ?? existing?.displayNameOverride,
                rubroOverride: input.rubroOverride ?? existing?.rubroOverride,
                tnaOverride: input.tnaOverride ?? existing?.tnaOverride,
                hidden: input.hidden ?? existing?.hidden,
                updatedAt: new Date().toISOString(),
            }
            await db.accountSettings.put(record)
            return record
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        },
    })

    // Delete settings mutation
    const deleteMutation = useMutation({
        mutationFn: async (accountId: string) => {
            await db.accountSettings.delete(accountId)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEY })
        },
    })

    // Get settings for specific account
    const getSettings = useCallback(
        (accountId: string): AccountSettings | undefined => {
            return settings.find(s => s.id === accountId)
        },
        [settings]
    )

    // Get display name for account (with fallback logic)
    const getDisplayName = useCallback(
        (accountId: string, accountName: string | undefined): string => {
            // 1. Check for override
            const override = settings.find(s => s.id === accountId)?.displayNameOverride
            if (override?.trim()) return override.trim()

            // 2. Check account name
            const name = accountName?.trim()
            if (name && name !== 'Account' && name !== 'account' && name.length > 0) {
                return name
            }

            // 3. Humanize account ID (e.g., "binance" -> "Binance", "iol" -> "IOL")
            const humanized = accountId
                .split(/[-_]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')

            // If ID looks like a UUID or hash, use generic fallback
            if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
                return 'Cuenta sin nombre'
            }

            return humanized
        },
        [settings]
    )

    // Get rubro override for account
    const getRubroOverride = useCallback(
        (accountId: string): RubroOverride | undefined => {
            return settings.find(s => s.id === accountId)?.rubroOverride
        },
        [settings]
    )

    // Check if account is hidden
    const isHidden = useCallback(
        (accountId: string): boolean => {
            return settings.find(s => s.id === accountId)?.hidden ?? false
        },
        [settings]
    )

    // Get TNA override
    const getTnaOverride = useCallback(
        (accountId: string): number | undefined => {
            return settings.find(s => s.id === accountId)?.tnaOverride
        },
        [settings]
    )

    // Save settings wrapper
    const saveSettings = useCallback(
        async (accountId: string, input: AccountSettingsInput): Promise<void> => {
            await saveMutation.mutateAsync({ accountId, input })
        },
        [saveMutation]
    )

    // Delete settings wrapper
    const deleteSettings = useCallback(
        async (accountId: string): Promise<void> => {
            await deleteMutation.mutateAsync(accountId)
        },
        [deleteMutation]
    )

    // Create a settings map for easy lookup (used by builder)
    const settingsMap = useCallback(
        (): Map<string, AccountSettings> => {
            const map = new Map<string, AccountSettings>()
            settings.forEach(s => map.set(s.id, s))
            return map
        },
        [settings]
    )

    return {
        settings,
        settingsMap,
        isLoading,
        getSettings,
        getDisplayName,
        getRubroOverride,
        getTnaOverride,
        isHidden,
        saveSettings,
        deleteSettings,
        isSaving: saveMutation.isPending,
        isDeleting: deleteMutation.isPending,
    }
}

/**
 * Standalone function to get display name (for use in builder without hook)
 */
export function resolveDisplayName(
    accountId: string,
    accountName: string | undefined,
    settingsMap: Map<string, AccountSettings>
): string {
    // 1. Check for override
    const override = settingsMap.get(accountId)?.displayNameOverride
    if (override?.trim()) return override.trim()

    // 2. Check account name
    const name = accountName?.trim()
    if (name && name !== 'Account' && name !== 'account' && name.length > 0) {
        return name
    }

    // 3. Humanize account ID
    const humanized = accountId
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')

    // If ID looks like a UUID or hash, use generic fallback
    if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
        return 'Cuenta sin nombre'
    }

    return humanized
}
