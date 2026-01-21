import { describe, expect, it } from 'vitest'
import { buildIncomeExecutionUpdate, buildFixedExpenseExecutions } from './execution'
import type { PFFixedExpense } from '@/db/schema'

describe('execution helpers', () => {
    it('builds an income execution update payload', () => {
        const payload = buildIncomeExecutionUpdate({
            effectiveDate: '2026-02-15',
            accountId: 'acc-1',
            movementId: 'mov-1',
        })

        expect(payload).toEqual({
            status: 'received',
            effectiveDate: '2026-02-15',
            accountId: 'acc-1',
            movementId: 'mov-1',
        })
    })

    it('merges fixed expense executions by yearMonth', () => {
        const expense: PFFixedExpense = {
            id: 'exp-1',
            title: 'Internet',
            amount: 300,
            dueDay: 10,
            category: 'service',
            recurrence: 'MONTHLY',
            startYearMonth: '2025-01',
            status: 'active',
            autoDebit: false,
            executions: [
                {
                    yearMonth: '2026-01',
                    effectiveDate: '2026-01-10',
                    amount: 300,
                    movementId: 'mov-jan',
                },
            ],
            createdAt: '2025-01-01',
        }

        const next = buildFixedExpenseExecutions(expense, {
            yearMonth: '2026-02',
            effectiveDate: '2026-02-10',
            amount: 300,
            accountId: 'acc-1',
            movementId: 'mov-feb',
        })

        expect(next).toHaveLength(2)
        expect(next.find((entry) => entry.yearMonth === '2026-02')).toMatchObject({
            yearMonth: '2026-02',
            effectiveDate: '2026-02-10',
            amount: 300,
            accountId: 'acc-1',
            movementId: 'mov-feb',
        })
    })
})
