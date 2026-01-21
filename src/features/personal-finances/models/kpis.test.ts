import { describe, expect, it } from 'vitest'
import { computeMonthlyKpis } from './kpis'
import type { PFDebt, PFFixedExpense, PFIncome, PFStatement, PFCardConsumption } from '@/db/schema'

describe('computeMonthlyKpis', () => {
    it('separates estimated vs executed amounts by month', () => {
        const yearMonth = '2026-02'

        const incomesForMonth: PFIncome[] = [
            {
                id: 'inc-1',
                title: 'Sueldo',
                amount: 1000,
                dateExpected: 25,
                yearMonth,
                isGuaranteed: true,
                status: 'pending',
                createdAt: '2026-02-01',
            },
        ]

        const allIncomes: PFIncome[] = [
            ...incomesForMonth,
            {
                id: 'inc-2',
                title: 'Bonus',
                amount: 500,
                dateExpected: 5,
                yearMonth: '2026-01',
                isGuaranteed: false,
                status: 'received',
                effectiveDate: '2026-02-05',
                createdAt: '2026-01-01',
            },
        ]

        const fixedExpenses: PFFixedExpense[] = [
            {
                id: 'exp-1',
                title: 'Internet',
                amount: 300,
                dueDay: 10,
                category: 'service',
                recurrence: 'MONTHLY',
                startYearMonth: '2025-01',
                status: 'active',
                autoDebit: true,
                executions: [
                    {
                        yearMonth,
                        effectiveDate: '2026-02-10',
                        amount: 300,
                        accountId: 'acc-1',
                        movementId: 'mov-1',
                    },
                ],
                createdAt: '2025-01-01',
            },
            {
                id: 'exp-2',
                title: 'Seguro',
                amount: 200,
                dueDay: 5,
                category: 'insurance',
                recurrence: 'MONTHLY',
                startYearMonth: '2025-01',
                status: 'active',
                autoDebit: false,
                createdAt: '2025-01-01',
            },
        ]

        const consumptionsClosing: PFCardConsumption[] = [
            {
                id: 'cons-1',
                cardId: 'card-1',
                description: 'Super',
                amount: 200,
                currency: 'ARS',
                purchaseDateISO: '2026-02-03',
                closingYearMonth: yearMonth,
                postedYearMonth: '2026-03',
                createdAt: '2026-02-03',
            },
            {
                id: 'cons-2',
                cardId: 'card-1',
                description: 'Nafta',
                amount: 100,
                currency: 'ARS',
                purchaseDateISO: '2026-02-08',
                closingYearMonth: yearMonth,
                postedYearMonth: '2026-03',
                createdAt: '2026-02-08',
            },
        ]

        const statementsDueNextMonth: PFStatement[] = [
            {
                id: 'stmt-next',
                cardId: 'card-1',
                closeDate: '2026-02-20',
                dueDate: '2026-03-05',
                periodStart: '2026-01-21',
                periodEnd: '2026-02-20',
                closingYearMonth: yearMonth,
                dueYearMonth: '2026-03',
                totalAmount: 400,
                status: 'UNPAID',
                createdAt: '2026-02-20',
            },
        ]

        const statements: PFStatement[] = [
            {
                id: 'stmt-paid',
                cardId: 'card-1',
                closeDate: '2026-01-20',
                dueDate: '2026-02-05',
                periodStart: '2025-12-21',
                periodEnd: '2026-01-20',
                closingYearMonth: '2026-01',
                dueYearMonth: yearMonth,
                totalAmount: 500,
                status: 'PAID',
                paidAt: '2026-02-06',
                paidAmount: 500,
                createdAt: '2026-01-20',
            },
        ]

        const debts: PFDebt[] = [
            {
                id: 'debt-1',
                title: 'Prestamo',
                counterparty: 'Banco',
                totalAmount: 1200,
                remainingAmount: 800,
                installmentsCount: 6,
                currentInstallment: 2,
                monthlyValue: 200,
                status: 'active',
                startYearMonth: '2026-01',
                createdAt: '2026-01-01',
                payments: [
                    {
                        date: '2026-02-12',
                        amount: 200,
                        installmentIndex: 2,
                    },
                ],
            },
        ]

        const kpis = computeMonthlyKpis({
            yearMonth,
            incomesForMonth,
            allIncomes,
            fixedExpenses,
            consumptionsClosing,
            statementsDueNextMonth,
            statements,
            debts,
        })

        expect(kpis.incomesEstimated).toBe(1000)
        expect(kpis.incomesCollected).toBe(500)
        expect(kpis.expensesEstimated).toBe(500)
        expect(kpis.expensesPaid).toBe(300)
        expect(kpis.cardsAccrued).toBe(300)
        expect(kpis.cardsDueNextMonth).toBe(400)
        expect(kpis.cardsPaid).toBe(500)
        expect(kpis.commitmentsEstimated).toBe(600)
        expect(kpis.commitmentsPaid).toBe(700)
        expect(kpis.savingsEstimated).toBe(1000 - 500 - 600)
        expect(kpis.savingsActual).toBe(500 - 300 - 700)
    })
})
