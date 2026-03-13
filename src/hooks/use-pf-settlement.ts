
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { derivePFPositions } from '@/domain/pf/processor'
import { db } from '@/db'
import { syncMovementsBatch } from '@/sync/remote-sync'
import { useToast } from '@/components/ui/toast'
import { useAutoSettleFixedTerms } from '@/hooks/use-preferences'
import { useQueryClient } from '@tanstack/react-query'
import type { Movement } from '@/domain/types'
import { formatMoneyARS } from '@/lib/format'

// ══════════════════════════════════════════════════════════════════════════════
// KILL SWITCH — Emergency disable for PF auto-settlement.
// Set to `true` to prevent ANY settlement from running (auto or manual).
// Context: Production duplicates detected 2026-03-12 (PF ~682k ARS inflated
// Banco del Sol to ~2.7M ARS). Keep ON until root cause fix is validated.
// To re-enable: set to `false` and verify with diagnoseDuplicates().
// ══════════════════════════════════════════════════════════════════════════════
const PF_SETTLEMENT_KILL_SWITCH = true

// ── Deterministic settlement key ──
// Generates stable, unique IDs for each settlement event based on the
// BUY movement's ID. Two tabs / retries / re-renders will produce the
// exact same IDs, so IndexedDB's primary key constraint is the ultimate
// guard against duplicates.
export function settlementSellId(buyMovementId: string): string {
    return `pf-settle-sell:${buyMovementId}`
}
export function settlementDepositId(buyMovementId: string): string {
    return `pf-settle-dep:${buyMovementId}`
}

// Module-level lock: prevents concurrent executeSettlement in the same tab.
// NOTE: This is per-tab only. Cross-tab protection comes from the atomic
// Dexie transaction (IndexedDB readwrite transactions are serialized).
let globalSettlementLock = false

export interface PFSettlementResult {
    settledCount: number
    totalAmount: number
}

export interface UsePFSettlementReturn {
    /** Manually trigger PF settlement (ignores preference check) */
    runSettlementNow: () => Promise<PFSettlementResult>
    /** Whether settlement is currently running */
    isRunning: boolean
    /** Get list of matured but unsettled PFs */
    getPendingMatured: () => Promise<{ id: string; bank: string; amount: number }[]>
}

/**
 * Settles a single matured PF inside an atomic Dexie transaction.
 *
 * Transaction guarantees:
 * - Store: `db.movements` (single store, readwrite)
 * - Read: checks if settlement SELL already exists (by deterministic ID AND by legacy metadata)
 * - Write: adds SELL + DEPOSIT only if no prior settlement found
 * - Why this prevents TOCTOU: IndexedDB readwrite transactions on the same
 *   store are serialized even across tabs. While one transaction holds the
 *   store, any other readwrite transaction on `db.movements` WAITS.
 *   So two tabs cannot both read count=0 and both write.
 *
 * Returns the created movements (empty array if already settled).
 */
async function settleOnePF(pf: {
    id: string
    accountId: string
    bank: string
    expectedTotalARS: number
    principalARS: number
    expectedInterestARS: number
    tna: number
    termDays: number
    startTs: string
    maturityTs: string
    pfGroupId?: string
    pfCode?: string
}): Promise<Movement[]> {
    const sellId = settlementSellId(pf.id)
    const depId = settlementDepositId(pf.id)

    const created: Movement[] = []

    await db.transaction('rw', db.movements, async () => {
        // ── Guard 1: deterministic ID (fast, indexed primary key lookup) ──
        const existingById = await db.movements.get(sellId)
        if (existingById) {
            console.info(`[pf-settlement] PF ${pf.id} already settled (deterministic ID found)`)
            return // Transaction commits with no writes → no-op
        }

        // ── Guard 2: legacy SELLs (pre-fix movements without deterministic IDs) ──
        // Searches by pf.pfId linkage, pfGroupId, or bank+amount heuristic
        const legacyCount = await db.movements
            .filter(m => {
                if (m.assetClass !== 'pf' || m.type !== 'SELL') return false
                // Exact linkage (post-fix movements)
                if (m.pf?.pfId === pf.id) return true
                // pfGroupId match (if set)
                if (pf.pfGroupId && (
                    m.meta?.pfGroupId === pf.pfGroupId ||
                    m.meta?.fixedDeposit?.pfGroupId === pf.pfGroupId
                )) return true
                // Heuristic: same bank + same amount + auto flag
                if (m.isAuto && m.bank === pf.bank &&
                    Math.abs(m.totalAmount - pf.expectedTotalARS) < 0.01) return true
                return false
            })
            .count()

        if (legacyCount > 0) {
            console.info(`[pf-settlement] PF ${pf.id} already settled (${legacyCount} legacy SELL found)`)
            return
        }

        // ── No prior settlement found → create SELL + DEPOSIT ──
        const settlementDate = new Date().toISOString()
        const settlementAmount = pf.expectedTotalARS
        const pfGroupId = pf.pfGroupId
        const pfCode = pf.pfCode || 'PF-AUTO'

        const settleMov: Movement = {
            id: sellId, // Deterministic!
            assetClass: 'pf',
            instrumentId: 'pf-instrument',
            assetName: 'Plazo Fijo',
            type: 'SELL',
            accountId: pf.accountId,
            bank: pf.bank,
            datetimeISO: settlementDate,
            quantity: 1,
            unitPrice: settlementAmount,
            tradeCurrency: 'ARS',
            totalAmount: settlementAmount,
            notes: `Vencimiento PF (Auto-Liquidación) ${pfCode}`,
            isAuto: true,
            meta: {
                pfGroupId: pfGroupId,
                pfCode: pfCode,
                fixedDeposit: {
                    pfGroupId: pfGroupId,
                    pfCode: pfCode,
                    settlementMode: 'auto',
                    redeemedAt: settlementDate,
                    principalARS: pf.principalARS,
                    interestARS: pf.expectedInterestARS || 0,
                    totalARS: settlementAmount,
                    tna: pf.tna,
                    termDays: pf.termDays,
                    startAtISO: pf.startTs,
                    maturityDate: pf.maturityTs
                } as any
            },
            pf: {
                kind: 'redeem',
                pfId: pf.id,
                action: 'SETTLE',
            },
        }

        const depositMov: Movement = {
            id: depId, // Deterministic!
            type: 'DEPOSIT',
            instrumentId: 'ars-cash',
            assetName: 'Pesos Argentinos',
            accountId: pf.accountId,
            tradeCurrency: 'ARS',
            bank: pf.bank,
            datetimeISO: settlementDate,
            quantity: settlementAmount,
            unitPrice: 1,
            totalAmount: settlementAmount,
            ticker: 'ARS',
            notes: `Acreditación PF vencido (Auto): ${pfCode}`,
            isAuto: true,
            meta: {
                pfGroupId: pfGroupId,
                pfCode: pfCode,
                fixedDeposit: {
                    pfGroupId: pfGroupId,
                    pfCode: pfCode,
                    settlementMode: 'auto',
                    totalARS: settlementAmount
                } as any,
            } as any,
        }

        await db.movements.bulkAdd([settleMov, depositMov])
        created.push(settleMov, depositMov)
    })

    return created
}

export function usePFSettlement(options?: { autoEffect?: boolean }): UsePFSettlementReturn {
    const enableAutoEffect = options?.autoEffect ?? true
    const { data: movements } = useMovements()
    const { data: fxRates } = useFxRates()
    const { toast } = useToast()
    const { autoSettleEnabled } = useAutoSettleFixedTerms()
    const queryClient = useQueryClient()

    // State for manual trigger
    const [isRunning, setIsRunning] = useState(false)

    // Interval to force re-check (every 5 minutes) — only when auto-effect is active
    const [tick, setTick] = useState(0)
    useEffect(() => {
        if (!enableAutoEffect) return
        const interval = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [enableAutoEffect])

    // Ref to prevent double-firing strict mode or rapid re-renders
    const isProcessing = useRef(false)

    // Store latest movements/fxRates in refs so executeSettlement doesn't
    // need them in its dependency array (breaks the invalidation feedback loop).
    const movementsRef = useRef(movements)
    const fxRatesRef = useRef(fxRates)
    useEffect(() => { movementsRef.current = movements }, [movements])
    useEffect(() => { fxRatesRef.current = fxRates }, [fxRates])

    // Core settlement logic — reads from refs, NOT from closure.
    // This means executeSettlement is stable (doesn't change on every render).
    const executeSettlement = useCallback(async (showToast: boolean): Promise<PFSettlementResult> => {
        // KILL SWITCH: block all settlement while investigating production duplicates
        if (PF_SETTLEMENT_KILL_SWITCH) {
            console.warn('[pf-settlement] KILL SWITCH active — settlement blocked. See use-pf-settlement.ts')
            return { settledCount: 0, totalAmount: 0 }
        }

        const currentMovements = movementsRef.current
        const currentFxRates = fxRatesRef.current

        if (!currentMovements || !currentFxRates) {
            return { settledCount: 0, totalAmount: 0 }
        }

        // Global lock: prevent concurrent runs within same tab
        if (globalSettlementLock) {
            console.info('[pf-settlement] Skipping: another settlement is already in progress')
            return { settledCount: 0, totalAmount: 0 }
        }
        globalSettlementLock = true

        try {
            const state = derivePFPositions(currentMovements, currentFxRates)
            const maturedToSettle = state.matured

            if (maturedToSettle.length === 0) {
                return { settledCount: 0, totalAmount: 0 }
            }

            const allCreated: Movement[] = []
            let totalSettledAmount = 0
            const settledBanks = new Set<string>()

            for (const pf of maturedToSettle) {
                // Each PF is settled in its own atomic transaction
                const created = await settleOnePF(pf)
                if (created.length > 0) {
                    allCreated.push(...created)
                    totalSettledAmount += pf.expectedTotalARS
                    settledBanks.add(pf.bank || 'Desconocido')
                }
            }

            if (allCreated.length > 0) {
                // Invalidate react-query cache so UI and subsequent runs see new data
                queryClient.invalidateQueries({ queryKey: ['movements'] })
                queryClient.invalidateQueries({ queryKey: ['portfolio'] })

                // Sync to D1 (non-blocking)
                syncMovementsBatch(allCreated).then(({ ok }) => {
                    if (!ok) {
                        console.warn('[pf-settlement] D1 sync failed for', allCreated.length, 'movements')
                    }
                })

                if (showToast) {
                    const banksStr = Array.from(settledBanks).join(', ')
                    toast({
                        title: 'Liquidación Automática de PF',
                        description: `Se liquidaron PFs vencidos por ${formatMoneyARS(totalSettledAmount)} en ${banksStr}.`,
                        variant: 'default',
                    })
                }
            }

            return { settledCount: allCreated.length / 2, totalAmount: totalSettledAmount }
        } finally {
            globalSettlementLock = false
        }
    // executeSettlement is stable — depends only on refs + queryClient + toast
    }, [toast, queryClient])

    // Manual trigger function
    const runSettlementNow = useCallback(async (): Promise<PFSettlementResult> => {
        if (isRunning) return { settledCount: 0, totalAmount: 0 }

        setIsRunning(true)
        try {
            return await executeSettlement(false)
        } catch (err) {
            console.error('[PFSettlement] Error running manual settlement:', err)
            return { settledCount: 0, totalAmount: 0 }
        } finally {
            setIsRunning(false)
        }
    }, [executeSettlement, isRunning])

    // Get pending matured PFs (for UI display)
    const getPendingMatured = useCallback(async () => {
        if (!movements || !fxRates) return []
        const state = derivePFPositions(movements, fxRates)
        return state.matured.map(pf => ({
            id: pf.id,
            bank: pf.bank || 'Desconocido',
            amount: pf.expectedTotalARS
        }))
    }, [movements, fxRates])

    // Auto-run effect (respects preference + enableAutoEffect flag)
    // NOTE: executeSettlement is NOT in deps — it's stable (ref-based).
    // Effect re-fires on: movements change, fxRates change, tick, preference toggle.
    useEffect(() => {
        if (!enableAutoEffect) return

        const runSettlement = async () => {
            if (!movements || !fxRates || isProcessing.current) return
            if (!autoSettleEnabled) return

            isProcessing.current = true
            try {
                await executeSettlement(true)
            } catch (error) {
                console.error('Error executing PF settlement:', error)
            } finally {
                isProcessing.current = false
            }
        }

        runSettlement()
    }, [enableAutoEffect, movements, fxRates, tick, autoSettleEnabled, executeSettlement])

    return { runSettlementNow, isRunning, getPendingMatured }
}
