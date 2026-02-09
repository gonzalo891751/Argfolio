import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { snapshotsRepo } from '@/db'
import type { FxType } from '@/domain/types'
import { usePortfolioV2 } from '@/features/portfolioV2'
import {
    SNAPSHOT_AUTO_STORAGE_KEY,
    buildSnapshotFromPortfolioV2,
    readAutoSnapshotsEnabled,
    writeAutoSnapshotsEnabled,
} from '@/features/dashboardV2/snapshot-v2'

const AUTO_SNAPSHOTS_EVENT = 'argfolio:auto-snapshots-changed'

function emitAutoSnapshotsChange(enabled: boolean) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<boolean>(AUTO_SNAPSHOTS_EVENT, { detail: enabled }))
}

export function useSnapshots() {
    return useQuery({
        queryKey: ['snapshots'],
        queryFn: () => snapshotsRepo.list(),
    })
}

export function useSaveSnapshot() {
    const queryClient = useQueryClient()
    const portfolio = usePortfolioV2()

    return useMutation({
        mutationFn: async (baseFx: FxType = 'MEP') => {
            if (!portfolio || portfolio.isLoading) {
                throw new Error('PortfolioV2 data not available')
            }

            const snapshot = buildSnapshotFromPortfolioV2(portfolio, baseFx)
            return snapshotsRepo.upsertByDate(snapshot)
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

export function useClearSnapshots() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () => snapshotsRepo.clearAll(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['snapshots'] })
        },
    })
}

export function useAutoSnapshotsSetting() {
    const [enabled, setEnabled] = useState<boolean>(() => readAutoSnapshotsEnabled())

    useEffect(() => {
        if (typeof window === 'undefined') return

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== SNAPSHOT_AUTO_STORAGE_KEY) return
            setEnabled(readAutoSnapshotsEnabled())
        }

        const handleCustomEvent = (event: Event) => {
            const custom = event as CustomEvent<boolean>
            setEnabled(Boolean(custom.detail))
        }

        window.addEventListener('storage', handleStorage)
        window.addEventListener(AUTO_SNAPSHOTS_EVENT, handleCustomEvent as EventListener)
        return () => {
            window.removeEventListener('storage', handleStorage)
            window.removeEventListener(AUTO_SNAPSHOTS_EVENT, handleCustomEvent as EventListener)
        }
    }, [])

    const setAutoSnapshotsEnabled = useCallback((value: boolean) => {
        writeAutoSnapshotsEnabled(value)
        setEnabled(value)
        emitAutoSnapshotsChange(value)
    }, [])

    return { autoSnapshotsEnabled: enabled, setAutoSnapshotsEnabled }
}

export function useAutoDailySnapshotCapture() {
    const queryClient = useQueryClient()
    const portfolio = usePortfolioV2()
    const { autoSnapshotsEnabled } = useAutoSnapshotsSetting()
    const savedForDayRef = useRef<string | null>(null)

    useEffect(() => {
        if (!autoSnapshotsEnabled) {
            savedForDayRef.current = null
            return
        }
        if (!portfolio || portfolio.isLoading) return

        const snapshot = buildSnapshotFromPortfolioV2(portfolio, 'MEP')
        if (savedForDayRef.current === snapshot.dateLocal) return

        let cancelled = false
        snapshotsRepo.upsertByDate(snapshot)
            .then(() => {
                if (cancelled) return
                savedForDayRef.current = snapshot.dateLocal
                queryClient.invalidateQueries({ queryKey: ['snapshots'] })
            })
            .catch((error) => {
                if (cancelled) return
                console.error('[snapshots] auto-capture failed', error)
            })

        return () => {
            cancelled = true
        }
    }, [
        autoSnapshotsEnabled,
        portfolio,
        queryClient,
    ])
}
