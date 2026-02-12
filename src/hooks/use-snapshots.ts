import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { snapshotsRepo } from '@/db'
import type { FxType } from '@/domain/types'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useAccounts, useInstruments } from '@/hooks/use-instruments'
import { useMovements } from '@/hooks/use-movements'
import {
    SNAPSHOT_AUTO_STORAGE_KEY,
    buildSnapshotFromPortfolioV2,
    isPortfolioReadyForSnapshot,
    readAutoSnapshotsEnabled,
    writeAutoSnapshotsEnabled,
} from '@/features/dashboardV2/snapshot-v2'
import { syncPushSnapshots } from '@/sync/remote-sync'

const AUTO_SNAPSHOTS_EVENT = 'argfolio:auto-snapshots-changed'
const SNAPSHOT_RETRY_BACKOFF_MS = [5000, 15000, 30000, 30000, 30000] as const

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
            const check = isPortfolioReadyForSnapshot(portfolio)
            if (!check.ready) {
                console.warn('[snapshots] manual save blocked', { reason: check.reason })
                throw new Error(
                    check.reason === 'TOTAL_ZERO_WITH_ASSETS'
                        ? 'El portfolio tiene activos pero los totales son $0. Esperá a que cargue completamente.'
                        : check.reason === 'NO_FX'
                            ? 'Las cotizaciones FX no están disponibles aún.'
                            : 'Los datos del portfolio todavía están cargando.'
                )
            }

            const snapshot = buildSnapshotFromPortfolioV2(portfolio!, baseFx)
            const result = await snapshotsRepo.upsertByDate(snapshot)

            // FASE 2: auto-sync to D1 after local persist
            syncPushSnapshots([snapshot]).catch((error) => {
                console.warn('[snapshots] sync push failed (manual save)', error)
            })

            return result
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
    const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
    const { data: movements = [], isLoading: movementsLoading } = useMovements()
    const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments()
    const { autoSnapshotsEnabled } = useAutoSnapshotsSetting()
    const savedForDayRef = useRef<string | null>(null)
    const skipLoggedRef = useRef<string | null>(null)
    const retryAttemptRef = useRef(0)
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [retryTick, setRetryTick] = useState(0)

    const clearRetryTimeout = useCallback(() => {
        if (retryTimeoutRef.current != null) {
            clearTimeout(retryTimeoutRef.current)
            retryTimeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        return () => {
            clearRetryTimeout()
        }
    }, [clearRetryTimeout])

    useEffect(() => {
        if (!autoSnapshotsEnabled) {
            savedForDayRef.current = null
            retryAttemptRef.current = 0
            clearRetryTimeout()
            return
        }

        const dependenciesLoading = accountsLoading || movementsLoading || instrumentsLoading
        const check = dependenciesLoading
            ? { ready: false as const, reason: 'LOADING' as const }
            : isPortfolioReadyForSnapshot(portfolio, {
                accountsCount: accounts.length,
                movementsCount: movements.length,
                instrumentsCount: instruments.length,
            })

        if (!check.ready) {
            if (skipLoggedRef.current !== check.reason) {
                console.log('[snapshots] auto-capture skip: not ready', { reason: check.reason })
                skipLoggedRef.current = check.reason
            }

            if (retryTimeoutRef.current == null && retryAttemptRef.current < SNAPSHOT_RETRY_BACKOFF_MS.length) {
                const attempt = retryAttemptRef.current + 1
                const delayMs = SNAPSHOT_RETRY_BACKOFF_MS[retryAttemptRef.current]
                retryAttemptRef.current += 1

                console.log('[snapshots] auto-capture retry scheduled', {
                    reason: check.reason,
                    attempt,
                    delayMs,
                })

                retryTimeoutRef.current = setTimeout(() => {
                    retryTimeoutRef.current = null
                    setRetryTick((current) => current + 1)
                }, delayMs)
            }

            return
        }

        clearRetryTimeout()
        retryAttemptRef.current = 0
        skipLoggedRef.current = null

        const snapshot = buildSnapshotFromPortfolioV2(portfolio!, 'MEP')

        let cancelled = false
        const persistSnapshot = async () => {
            const existing = await snapshotsRepo.getByDate(snapshot.dateLocal)
            const shouldRepairZero = Boolean(existing && existing.totalARS === 0 && snapshot.totalARS > 0)

            if (savedForDayRef.current === snapshot.dateLocal && !shouldRepairZero) {
                return
            }

            if (existing && !shouldRepairZero) {
                const sameTotals = existing.totalARS === snapshot.totalARS && existing.totalUSD === snapshot.totalUSD
                if (sameTotals) {
                    savedForDayRef.current = snapshot.dateLocal
                    return
                }
            }

            await snapshotsRepo.upsertByDate(snapshot)

            if (cancelled) return
            savedForDayRef.current = snapshot.dateLocal

            if (shouldRepairZero) {
                console.log('[snapshots] auto-capture repaired zero snapshot', {
                    date: snapshot.dateLocal,
                    previousTotalARS: existing?.totalARS ?? 0,
                    newTotalARS: snapshot.totalARS,
                })
            } else {
                console.log('[snapshots] auto-capture saved', {
                    date: snapshot.dateLocal,
                    totalARS: snapshot.totalARS,
                    totalUSD: snapshot.totalUSD,
                })
            }

            queryClient.invalidateQueries({ queryKey: ['snapshots'] })

            syncPushSnapshots([snapshot]).catch((error) => {
                console.warn('[snapshots] sync push failed (auto-capture)', error)
            })
        }

        persistSnapshot()
            .then(() => {
                retryAttemptRef.current = 0
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
        accounts.length,
        movements.length,
        instruments.length,
        accountsLoading,
        movementsLoading,
        instrumentsLoading,
        clearRetryTimeout,
        queryClient,
        retryTick,
    ])
}
