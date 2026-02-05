/**
 * Combined Automation Trigger Hook
 *
 * Provides a single function to manually trigger all automations:
 * - Wallet interest accrual
 * - Fixed term settlement
 *
 * Used by the "Actualizar ahora" button in Mis Activos V2.
 */

import { useCallback, useState } from 'react'
import { useAccrualScheduler, type AccrualResult } from '@/features/yield'
import { usePFSettlement, type PFSettlementResult } from '@/hooks/use-pf-settlement'
import { useToast } from '@/components/ui/toast'
import { useQueryClient } from '@tanstack/react-query'
import { formatMoneyARS } from '@/lib/format'

export interface AutomationResult {
    accrual: AccrualResult
    pfSettlement: PFSettlementResult
}

export interface UseAutomationTriggerReturn {
    /** Run all automations manually */
    runAutomationsNow: () => Promise<AutomationResult>
    /** Whether automations are currently running */
    isRunning: boolean
    /** Last result */
    lastResult: AutomationResult | null
}

export function useAutomationTrigger(): UseAutomationTriggerReturn {
    const { runAccrualNow, isRunning: isAccrualRunning } = useAccrualScheduler()
    const { runSettlementNow, isRunning: isPFRunning } = usePFSettlement()
    const { toast } = useToast()
    const queryClient = useQueryClient()

    const [isRunning, setIsRunning] = useState(false)
    const [lastResult, setLastResult] = useState<AutomationResult | null>(null)

    const runAutomationsNow = useCallback(async (): Promise<AutomationResult> => {
        if (isRunning || isAccrualRunning || isPFRunning) {
            return {
                accrual: { movementsCreated: 0, accountsUpdated: 0 },
                pfSettlement: { settledCount: 0, totalAmount: 0 }
            }
        }

        setIsRunning(true)

        try {
            // Run both automations in parallel
            const [accrualResult, pfResult] = await Promise.all([
                runAccrualNow(),
                runSettlementNow()
            ])

            const result: AutomationResult = {
                accrual: accrualResult,
                pfSettlement: pfResult
            }

            setLastResult(result)

            // Show consolidated toast
            const hasAccrual = accrualResult.movementsCreated > 0
            const hasPF = pfResult.settledCount > 0

            if (hasAccrual || hasPF) {
                const parts: string[] = []
                if (hasAccrual) {
                    parts.push(`Intereses: ${accrualResult.movementsCreated} mov.`)
                }
                if (hasPF) {
                    parts.push(`PF liquidados: ${formatMoneyARS(pfResult.totalAmount)}`)
                }

                toast({
                    title: 'Automatizaciones Ejecutadas',
                    description: parts.join(' | '),
                })
            } else {
                toast({
                    title: 'Todo al día',
                    description: 'No hay intereses pendientes ni PFs vencidos.',
                    variant: 'info',
                })
            }

            // Invalidate queries to refresh UI
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })

            return result
        } catch (err) {
            console.error('[AutomationTrigger] Error:', err)
            toast({
                title: 'Error',
                description: 'Ocurrió un error al ejecutar las automatizaciones.',
                variant: 'error',
            })
            return {
                accrual: { movementsCreated: 0, accountsUpdated: 0 },
                pfSettlement: { settledCount: 0, totalAmount: 0 }
            }
        } finally {
            setIsRunning(false)
        }
    }, [isRunning, isAccrualRunning, isPFRunning, runAccrualNow, runSettlementNow, toast, queryClient])

    return { runAutomationsNow, isRunning, lastResult }
}
