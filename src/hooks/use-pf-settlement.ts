
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { derivePFPositions } from '@/domain/pf/processor'
import { db } from '@/db'
import { useToast } from '@/components/ui/toast'
import { useAutoSettleFixedTerms } from '@/hooks/use-preferences'
import type { Movement } from '@/domain/types'
import { v4 as uuidv4 } from 'uuid'
import { formatMoneyARS } from '@/lib/format'

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

export function usePFSettlement(): UsePFSettlementReturn {
    const { data: movements } = useMovements()
    const { data: fxRates } = useFxRates()
    const { toast } = useToast()
    const { autoSettleEnabled } = useAutoSettleFixedTerms()

    // State for manual trigger
    const [isRunning, setIsRunning] = useState(false)

    // Interval to force re-check (every 5 minutes)
    const [tick, setTick] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    // Ref to prevent double-firing strict mode or rapid re-renders
    const isProcessing = useRef(false)

    // Core settlement logic (reusable)
    const executeSettlement = useCallback(async (showToast: boolean): Promise<PFSettlementResult> => {
        if (!movements || !fxRates) {
            return { settledCount: 0, totalAmount: 0 }
        }

        const state = derivePFPositions(movements, fxRates)
        const maturedToSettle = state.matured

        if (maturedToSettle.length === 0) {
            return { settledCount: 0, totalAmount: 0 }
        }

        const newMovements: Movement[] = []
        let totalSettledAmount = 0
        const settledBanks = new Set<string>()

        for (const pf of maturedToSettle) {
            const settlementDate = new Date().toISOString()
            const settlementAmount = pf.expectedTotalARS

            const pfGroupId = pf.pfGroupId
            const pfCode = pf.pfCode || 'PF-AUTO'

            const settleMov: Movement = {
                id: uuidv4(),
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
                id: uuidv4(),
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

            newMovements.push(settleMov, depositMov)
            totalSettledAmount += settlementAmount
            settledBanks.add(pf.bank || 'Desconocido')
        }

        if (newMovements.length > 0) {
            await db.movements.bulkAdd(newMovements)

            if (showToast) {
                const banksStr = Array.from(settledBanks).join(', ')
                toast({
                    title: 'Liquidación Automática de PF',
                    description: `Se liquidaron PFs vencidos por ${formatMoneyARS(totalSettledAmount)} en ${banksStr}.`,
                    variant: 'default',
                })
            }
        }

        return { settledCount: maturedToSettle.length, totalAmount: totalSettledAmount }
    }, [movements, fxRates, toast])

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

    // Auto-run effect (respects preference)
    useEffect(() => {
        const runSettlement = async () => {
            if (!movements || !fxRates || isProcessing.current) return
            if (!autoSettleEnabled) return // Respect user preference

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
    }, [movements, fxRates, tick, autoSettleEnabled, executeSettlement])

    return { runSettlementNow, isRunning, getPendingMatured }
}
