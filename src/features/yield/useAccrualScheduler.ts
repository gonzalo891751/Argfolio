/**
 * Global Accrual Scheduler Hook
 * 
 * Runs yield accrual logic ONCE per day at app startup, preventing the
 * render-loop flickering caused by running accrual in page-level useEffect.
 * 
 * The scheduler:
 * 1. Checks localStorage for last run date
 * 2. If date !== today, runs generateAccrualMovements for all eligible accounts
 * 3. Updates localStorage after completion
 * 4. Shows a toast notification on success
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useAccounts } from '@/hooks/use-instruments'
import { useMovements } from '@/hooks/use-movements'
import { generateAccrualMovements } from '@/domain/yield/accrual'
import { db } from '@/db'
import { useToast } from '@/components/ui/toast'
import { useAutoAccrueWalletInterest } from '@/hooks/use-preferences'
import type { Movement } from '@/domain/types'

const ACCRUAL_STORAGE_KEY = 'argfolio.lastAccrualRun'

interface UseAccrualSchedulerOptions {
    /** Whether the scheduler is enabled (e.g., after DB is ready) */
    enabled?: boolean
}

export interface AccrualResult {
    movementsCreated: number
    accountsUpdated: number
}

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
function getTodayDateStr(): string {
    const now = new Date()
    return now.toISOString().slice(0, 10)
}

/**
 * Check if accrual has already run today
 */
function hasRunToday(): boolean {
    try {
        const lastRun = localStorage.getItem(ACCRUAL_STORAGE_KEY)
        return lastRun === getTodayDateStr()
    } catch {
        return false
    }
}

/**
 * Mark accrual as run for today
 */
function markAsRun(): void {
    try {
        localStorage.setItem(ACCRUAL_STORAGE_KEY, getTodayDateStr())
    } catch {
        // Ignore storage errors
    }
}

/**
 * Compute cash balance for an account from movements
 */
function computeCashBalanceForAccount(movements: Movement[], accountId: string): number {
    let balance = 0

    for (const mov of movements) {
        if (mov.accountId !== accountId) continue

        // Only count ARS cash-affecting movements
        if (mov.tradeCurrency !== 'ARS') continue

        switch (mov.type) {
            case 'DEPOSIT':
            case 'TRANSFER_IN':
            case 'INTEREST':
            case 'DIVIDEND':
                balance += mov.totalAmount ?? 0
                break
            case 'WITHDRAW':
            case 'TRANSFER_OUT':
            case 'FEE':
                balance -= mov.totalAmount ?? 0
                break
            case 'BUY':
                // Buying reduces cash
                balance -= (mov.netAmount ?? mov.totalAmount ?? 0)
                break
            case 'SELL':
                // Selling increases cash
                balance += (mov.netAmount ?? mov.totalAmount ?? 0)
                break
            default:
                break
        }
    }

    return balance
}

export interface UseAccrualSchedulerReturn {
    /** Manually trigger accrual (ignores hasRunToday check) */
    runAccrualNow: () => Promise<AccrualResult>
    /** Whether accrual is currently running */
    isRunning: boolean
    /** Last result from accrual run */
    lastResult: AccrualResult | null
}

export function useAccrualScheduler(options: UseAccrualSchedulerOptions = {}): UseAccrualSchedulerReturn {
    const { enabled = true } = options

    const { data: accounts } = useAccounts()
    const { data: movements } = useMovements()
    const { toast } = useToast()
    const { autoAccrueEnabled } = useAutoAccrueWalletInterest()

    // State for manual trigger
    const [isRunning, setIsRunning] = useState(false)
    const [lastResult, setLastResult] = useState<AccrualResult | null>(null)

    // Prevent multiple runs
    const hasRun = useRef(false)

    // Core accrual logic (reusable for both auto and manual)
    const executeAccrual = useCallback(async (showToast: boolean): Promise<AccrualResult> => {
        if (!accounts || accounts.length === 0) {
            return { movementsCreated: 0, accountsUpdated: 0 }
        }
        if (!movements || movements.length === 0) {
            return { movementsCreated: 0, accountsUpdated: 0 }
        }

        const todayStr = getTodayDateStr()
        const allMovs: Movement[] = []
        let updatedAccounts = 0

        for (const acc of accounts) {
            if (!acc.cashYield?.enabled) continue

            // Calculate cash balance for this account from movements
            const cashBalance = computeCashBalanceForAccount(movements, acc.id)
            if (cashBalance <= 0) continue

            const { movements: newMovs, newLastAccrued } = generateAccrualMovements(
                acc,
                cashBalance,
                todayStr
            )

            if (newMovs.length > 0) {
                allMovs.push(...newMovs)

                // Update account's lastAccruedDate
                await db.accounts.update(acc.id, {
                    cashYield: {
                        ...acc.cashYield,
                        lastAccruedDate: newLastAccrued
                    }
                })

                updatedAccounts++
            }
        }

        // Bulk insert all movements
        if (allMovs.length > 0) {
            await db.movements.bulkPut(allMovs)

            if (showToast) {
                toast({
                    title: 'Rendimiento Acreditado',
                    description: `Se generaron ${allMovs.length} movimientos de interés en ${updatedAccounts} cuenta${updatedAccounts > 1 ? 's' : ''}.`,
                })
            }
        }

        // Mark as run for today to prevent re-runs
        markAsRun()

        return { movementsCreated: allMovs.length, accountsUpdated: updatedAccounts }
    }, [accounts, movements, toast])

    // Manual trigger function
    const runAccrualNow = useCallback(async (): Promise<AccrualResult> => {
        if (isRunning) return { movementsCreated: 0, accountsUpdated: 0 }

        setIsRunning(true)
        try {
            const result = await executeAccrual(false) // Don't show toast, caller will handle
            setLastResult(result)
            return result
        } catch (err) {
            console.error('[AccrualScheduler] Error running manual accrual:', err)
            return { movementsCreated: 0, accountsUpdated: 0 }
        } finally {
            setIsRunning(false)
        }
    }, [executeAccrual, isRunning])

    // Auto-run effect (respects preference)
    useEffect(() => {
        // Guards
        if (!enabled) return
        if (!autoAccrueEnabled) return // Respect user preference
        if (hasRun.current) return
        if (hasRunToday()) {
            hasRun.current = true
            return
        }
        if (!accounts || accounts.length === 0) return
        if (!movements || movements.length === 0) return

        // Run accrual
        hasRun.current = true
        executeAccrual(true).catch(err => {
            console.error('[AccrualScheduler] Error running accrual:', err)
            // Still mark as run to prevent error loops
            markAsRun()
        })
    }, [enabled, autoAccrueEnabled, accounts, movements, executeAccrual])

    return { runAccrualNow, isRunning, lastResult }
}
