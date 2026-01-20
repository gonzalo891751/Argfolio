
import { useEffect, useRef, useState } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { derivePFPositions } from '@/domain/pf/processor'
import { db } from '@/db'
import { useToast } from '@/components/ui/toast'
import type { Movement } from '@/domain/types'
import { v4 as uuidv4 } from 'uuid'
import { formatMoneyARS } from '@/lib/format'

export function usePFSettlement() {
    const { data: movements } = useMovements()
    const { data: fxRates } = useFxRates()
    const { toast } = useToast()

    // Interval to force re-check (every 5 minutes)
    const [tick, setTick] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    // Ref to prevent double-firing strict mode or rapid re-renders
    const isProcessing = useRef(false)

    useEffect(() => {
        const runSettlement = async () => {
            if (!movements || !fxRates || isProcessing.current) return

            // Derive state locally to be sure we have the latest "now"
            // Note: derivePFPositions internally uses `new Date()` if not passed current time, 
            // verifying processor.ts source showed it uses `const now = new Date()`.
            // So re-running this function is sufficient to catch time updates.
            const state = derivePFPositions(movements, fxRates)

            const maturedToSettle = state.matured

            if (maturedToSettle.length === 0) return

            isProcessing.current = true

            try {
                const newMovements: Movement[] = []
                let totalSettledAmount = 0
                const settledBanks = new Set<string>()

                for (const pf of maturedToSettle) {
                    // Double check idempotency logic from processor.ts:
                    // processor.ts checks `isRedeemed(m)`. 
                    // If we are here, `isRedeemed` returned false.
                    // So we are safe to settle.

                    const settlementDate = new Date().toISOString()
                    const settlementAmount = pf.expectedTotalARS

                    // 1. SETTLE Movement (Close PF)
                    // We link to the original PF ID via metadata.
                    // 1. SETTLE Movement (Close PF)
                    // We link to the original PF ID via metadata.
                    const pfGroupId = pf.pfGroupId // Propagated from processor
                    const pfCode = pf.pfCode || 'PF-AUTO'

                    const settleMov: Movement = {
                        id: uuidv4(),
                        assetClass: 'pf',
                        instrumentId: 'pf-instrument', // Canonical PF
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

                        // Strict Metadata
                        meta: {
                            pfGroupId: pfGroupId,
                            pfCode: pfCode,
                            fixedDeposit: {
                                pfGroupId: pfGroupId,
                                pfCode: pfCode,
                                period: 'settlement', // Custom marker? Or just reuse structure
                                settlementMode: 'auto',
                                redeemedAt: settlementDate,
                                // Snapshotting final values
                                principalARS: pf.principalARS,
                                interestARS: pf.expectedInterestARS,
                                totalARS: settlementAmount,
                                tna: pf.tna,
                                termDays: pf.termDays,
                                startDate: pf.startTs,
                                maturityDate: pf.maturityTs
                            } as any, // Cast if strictness varies
                            isAutoSettlement: true,
                            idempotencyKey: `PF_SETTLE:${pf.id}`
                        },

                        // Legacy
                        pf: {
                            kind: 'redeem',
                            pfId: pf.id, // Original Movement ID
                            action: 'SETTLE',
                        },
                    }

                    // 2. DEPOSIT Movement (Cash)
                    const depositMov: Movement = {
                        id: uuidv4(),
                        type: 'DEPOSIT',
                        instrumentId: 'ars-cash', // Canonical Cash
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
                            // Copy fixed deposit info? Or just reference? 
                            // Usually cash movement doesn't needed full metadata, but good for trace.
                            fixedDeposit: {
                                pfGroupId: pfGroupId,
                                pfCode: pfCode,
                                settlementMode: 'auto',
                                totalARS: settlementAmount
                            } as any,

                            source: 'PF_SETTLEMENT',
                            sourceFixedDepositId: pf.id,
                            isAutoSettlement: true,
                            idempotencyKey: `PF_SETTLE:${pf.id}:CREDIT`
                        }
                    }

                    newMovements.push(settleMov, depositMov)
                    totalSettledAmount += settlementAmount
                    settledBanks.add(pf.bank || 'Desconocido')
                }

                if (newMovements.length > 0) {
                    await db.movements.bulkAdd(newMovements)

                    const banksStr = Array.from(settledBanks).join(', ')
                    toast({
                        title: 'Liquidación Automática de PF',
                        description: `Se liquidaron PFs vencidos por ${formatMoneyARS(totalSettledAmount)} en ${banksStr}.`,
                        variant: 'default', // success
                    })
                }

            } catch (error) {
                console.error('Error executing PF settlement:', error)
            } finally {
                isProcessing.current = false
            }
        }

        runSettlement()
    }, [movements, fxRates, tick, toast])
}
