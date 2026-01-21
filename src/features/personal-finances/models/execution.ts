// =============================================================================
// Execution Helpers
// =============================================================================

import type { PFIncome, PFFixedExpense } from '@/db/schema'

export function buildIncomeExecutionUpdate(params: {
    effectiveDate: string
    accountId?: string
    movementId?: string
}): Pick<PFIncome, 'status' | 'effectiveDate' | 'accountId' | 'movementId'> {
    return {
        status: 'received',
        effectiveDate: params.effectiveDate,
        accountId: params.accountId,
        movementId: params.movementId,
    }
}

export function buildFixedExpenseExecutions(
    expense: PFFixedExpense,
    params: {
        yearMonth: string
        effectiveDate: string
        amount: number
        accountId?: string
        movementId?: string
    }
): NonNullable<PFFixedExpense['executions']> {
    const existing = expense.executions || []
    return [
        ...existing.filter((entry) => entry.yearMonth !== params.yearMonth),
        {
            yearMonth: params.yearMonth,
            effectiveDate: params.effectiveDate,
            amount: params.amount,
            accountId: params.accountId,
            movementId: params.movementId,
        },
    ]
}
