// =============================================================================
// Finance Helpers: Plan vs Actual
// =============================================================================

import type { PFIncome, PFFixedExpense, PFDebt, PFStatement } from '@/db/schema'
import { makeDateISO, parseYearMonth, getYearMonthFromDate } from '../utils/dateHelpers'

export function isDateInYearMonth(dateISO: string | undefined, yearMonth: string): boolean {
    if (!dateISO) return false
    return getYearMonthFromDate(dateISO) === yearMonth
}

export function getIncomeScheduledDate(income: PFIncome): string {
    const { year, month } = parseYearMonth(income.yearMonth)
    return makeDateISO(year, month, income.dateExpected || 1)
}

export function getIncomeEffectiveDate(income: PFIncome): string | undefined {
    return income.effectiveDate || (income.status === 'received' ? getIncomeScheduledDate(income) : undefined)
}

export function getFixedExpenseScheduledDate(expense: PFFixedExpense, yearMonth: string): string {
    const { year, month } = parseYearMonth(yearMonth)
    return makeDateISO(year, month, expense.dueDay || 1)
}

export function getFixedExpenseExecutionForMonth(
    expense: PFFixedExpense,
    yearMonth: string
) {
    return expense.executions?.find((exec) => exec.yearMonth === yearMonth)
}

export function getDebtInstallmentForMonth(debt: PFDebt, yearMonth: string): number {
    const toYearMonthIndex = (ym: string) => {
        const [year, month] = ym.split('-').map(Number)
        return year * 12 + (month - 1)
    }
    const startYM = debt.startYearMonth || debt.startDate?.slice(0, 7) || yearMonth
    const startIndex = toYearMonthIndex(startYM)
    const targetIndex = toYearMonthIndex(yearMonth)
    const endIndex = startIndex + debt.installmentsCount - 1
    const isInRange = targetIndex >= startIndex && targetIndex <= endIndex

    if (!isInRange) return 0
    if (debt.category === 'credit_card') return 0
    if (debt.status === 'paid' || debt.status === 'completed') return 0
    return debt.installmentAmount || debt.monthlyValue || 0
}

export function getDebtPaymentsInMonth(debt: PFDebt, yearMonth: string): number {
    if (!debt.payments?.length) return 0
    return debt.payments
        .filter((p) => getYearMonthFromDate(p.date) === yearMonth)
        .reduce((sum, p) => sum + p.amount, 0)
}

export function getPaidStatementsInMonth(statements: PFStatement[], yearMonth: string): number {
    return statements
        .filter((s) => s.status === 'PAID' && getYearMonthFromDate(s.paidAt || '') === yearMonth)
        .reduce((sum, s) => sum + (s.paidAmount ?? s.totalAmount), 0)
}
