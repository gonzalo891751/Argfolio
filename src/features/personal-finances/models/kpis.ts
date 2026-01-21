// =============================================================================
// Monthly KPI Calculations
// =============================================================================

import type {
    PFIncome,
    PFFixedExpense,
    PFDebt,
    PFStatement,
    PFCardConsumption,
} from '@/db/schema'
import {
    getDebtInstallmentForMonth,
    getDebtPaymentsInMonth,
    getFixedExpenseExecutionForMonth,
    getIncomeEffectiveDate,
    isDateInYearMonth,
    getPaidStatementsInMonth,
} from './financeHelpers'

export interface MonthlyKpis {
    incomesEstimated: number
    incomesCollected: number
    expensesEstimated: number
    expensesPaid: number
    cardsAccrued: number
    cardsDueNextMonth: number
    cardsPaid: number
    commitmentsEstimated: number
    commitmentsPaid: number
    savingsEstimated: number
    savingsActual: number
}

interface ComputeMonthlyKpisInput {
    yearMonth: string
    incomesForMonth: PFIncome[]
    allIncomes: PFIncome[]
    fixedExpenses: PFFixedExpense[]
    consumptionsClosing: PFCardConsumption[]
    statementsDueNextMonth: PFStatement[]
    statements: PFStatement[]
    debts: PFDebt[]
}

export function computeMonthlyKpis(input: ComputeMonthlyKpisInput): MonthlyKpis {
    const {
        yearMonth,
        incomesForMonth,
        allIncomes,
        fixedExpenses,
        consumptionsClosing,
        statementsDueNextMonth,
        statements,
        debts,
    } = input

    const incomesEstimated = incomesForMonth.reduce((sum, i) => sum + i.amount, 0)
    const incomesCollected = allIncomes
        .filter((i) => isDateInYearMonth(getIncomeEffectiveDate(i), yearMonth))
        .reduce((sum, i) => sum + i.amount, 0)

    const expensesEstimated = fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
    const expensesPaid = fixedExpenses.reduce((sum, e) => {
        const exec = getFixedExpenseExecutionForMonth(e, yearMonth)
        return sum + (exec ? exec.amount : 0)
    }, 0)

    const cardsAccrued = consumptionsClosing.reduce((sum, c) => sum + c.amount, 0)
    const cardsDueNextMonth = statementsDueNextMonth.reduce((sum, s) => sum + s.totalAmount, 0)
    const cardsPaid = getPaidStatementsInMonth(statements, yearMonth)

    const debtInstallments = debts.reduce(
        (sum, d) => sum + getDebtInstallmentForMonth(d, yearMonth),
        0
    )
    const debtPaid = debts.reduce((sum, d) => sum + getDebtPaymentsInMonth(d, yearMonth), 0)

    const commitmentsEstimated = debtInstallments + cardsDueNextMonth
    const commitmentsPaid = debtPaid + cardsPaid

    const savingsEstimated = incomesEstimated - expensesEstimated - commitmentsEstimated
    const savingsActual = incomesCollected - expensesPaid - commitmentsPaid

    return {
        incomesEstimated,
        incomesCollected,
        expensesEstimated,
        expensesPaid,
        cardsAccrued,
        cardsDueNextMonth,
        cardsPaid,
        commitmentsEstimated,
        commitmentsPaid,
        savingsEstimated,
        savingsActual,
    }
}
