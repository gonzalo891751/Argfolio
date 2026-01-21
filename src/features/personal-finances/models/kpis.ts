// =============================================================================
// Monthly KPI Calculations
// =============================================================================

import type {
    PFIncome,
    PFFixedExpense,
    PFDebt,
    PFStatement,
    PFCardConsumption,
    PFBudgetCategory,
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
    // Original fields
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

    // NEW: Budget fields
    budgetsEstimated: number
    budgetsSpent: number

    // NEW: Cards due this month (for display)
    cardsDueThisMonth: number

    // NEW: Debt installments
    debtInstallmentsThisMonth: number
    debtPaidThisMonth: number

    // NEW: Combined totals for the prototype UI
    totalExpensesPlan: number    // fixedExpenses + budgets (estimated)
    totalExpensesReal: number    // fixedExpenses + budgets (paid/spent)
    totalCommitmentsPlan: number // cardsDueThisMonth + debtInstallments
    totalCommitmentsReal: number // cardsPaid + debtPaid

    // NEW: Insight tile ratios (as percentages 0-100)
    coverageRatio: number        // (all commitments) / income
    fixedExpenseRatio: number    // fixedExpenses / income
    debtLoadRatio: number        // (cards + debts) / income
    availableToBudget: number    // income - fixed - cards - debts - budgets

    // NEW: Currency logic
    cardsAccruedArs: number
    cardsAccruedUsd: number
}

interface ComputeMonthlyKpisInput {
    yearMonth: string
    incomesForMonth: PFIncome[]
    allIncomes: PFIncome[]
    fixedExpenses: PFFixedExpense[]
    consumptionsClosing: PFCardConsumption[]
    statementsDueNextMonth: PFStatement[]
    statementsDueThisMonth: PFStatement[]
    statements: PFStatement[]
    debts: PFDebt[]
    budgets: PFBudgetCategory[]
    mepSell?: number | null // FX Rate for USD conversion
}

export function computeMonthlyKpis(input: ComputeMonthlyKpisInput): MonthlyKpis {
    const {
        yearMonth,
        incomesForMonth,
        allIncomes,
        fixedExpenses,
        consumptionsClosing,
        statementsDueNextMonth,
        statementsDueThisMonth,
        statements,
        debts,
        budgets,
    } = input

    // Income calculations
    const incomesEstimated = incomesForMonth.reduce((sum, i) => sum + i.amount, 0)
    const incomesCollected = allIncomes
        .filter((i) => isDateInYearMonth(getIncomeEffectiveDate(i), yearMonth))
        .reduce((sum, i) => sum + i.amount, 0)

    // Fixed expenses calculations
    const expensesEstimated = fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
    const expensesPaid = fixedExpenses.reduce((sum, e) => {
        const exec = getFixedExpenseExecutionForMonth(e, yearMonth)
        return sum + (exec ? exec.amount : 0)
    }, 0)

    // Budget calculations
    const budgetsEstimated = budgets.reduce((sum, b) => sum + b.estimatedAmount, 0)
    const budgetsSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0)

    // Cards calculations
    // Split consumptions by currency
    const cardsAccruedArs = consumptionsClosing
        .filter(c => c.currency === 'ARS' || !c.currency)
        .reduce((sum, c) => sum + c.amount, 0)

    const cardsAccruedUsd = consumptionsClosing
        .filter(c => c.currency === 'USD')
        .reduce((sum, c) => sum + c.amount, 0)

    // Total Accrued in ARS (using FX if available)
    // If mepSell is not available, we don't value the USD part in the total (or could use 0, but user said "don't sum equivalence")
    const cardsAccruedUsdValued = (cardsAccruedUsd > 0 && input.mepSell)
        ? cardsAccruedUsd * input.mepSell
        : 0

    const cardsAccrued = cardsAccruedArs + cardsAccruedUsdValued

    // Note: DueNextMonth and Paid still rely on simple sum or need similar split if Statements support fields
    // For now we assume Statements (imported) are single currency or handled elsewhere, but for KPIs we stick to ARS generally
    const cardsDueNextMonth = statementsDueNextMonth.reduce((sum, s) => sum + s.totalAmount, 0)
    const cardsDueThisMonth = statementsDueThisMonth.reduce((sum, s) => sum + s.totalAmount, 0)
    const cardsPaid = getPaidStatementsInMonth(statements, yearMonth)

    // Debt calculations
    const debtInstallmentsThisMonth = debts.reduce(
        (sum, d) => sum + getDebtInstallmentForMonth(d, yearMonth),
        0
    )
    const debtPaidThisMonth = debts.reduce((sum, d) => sum + getDebtPaymentsInMonth(d, yearMonth), 0)

    // Legacy commitment fields (keep for backwards compatibility)
    const commitmentsEstimated = debtInstallmentsThisMonth + cardsDueNextMonth
    const commitmentsPaid = debtPaidThisMonth + cardsPaid

    // Combined totals for the prototype UI
    const totalExpensesPlan = expensesEstimated + budgetsEstimated
    const totalExpensesReal = expensesPaid + budgetsSpent
    // Use cardsAccrued (sum of closingTotal from all cards) for plan, not cardsDueThisMonth
    const totalCommitmentsPlan = cardsAccrued + debtInstallmentsThisMonth
    const totalCommitmentsReal = cardsPaid + debtPaidThisMonth

    // Savings calculations
    const savingsEstimated = incomesEstimated - totalExpensesPlan - totalCommitmentsPlan
    const savingsActual = incomesCollected - totalExpensesReal - totalCommitmentsReal

    // Insight tile ratios
    const coverageRatio = incomesEstimated > 0
        ? ((totalExpensesPlan + totalCommitmentsPlan) / incomesEstimated) * 100
        : 0
    const fixedExpenseRatio = incomesEstimated > 0
        ? (expensesEstimated / incomesEstimated) * 100
        : 0
    const debtLoadRatio = incomesEstimated > 0
        ? (totalCommitmentsPlan / incomesEstimated) * 100
        : 0
    const availableToBudget = incomesEstimated - expensesEstimated - totalCommitmentsPlan - budgetsEstimated

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
        // NEW fields
        budgetsEstimated,
        budgetsSpent,
        cardsDueThisMonth,
        debtInstallmentsThisMonth,
        debtPaidThisMonth,
        totalExpensesPlan,
        totalExpensesReal,
        totalCommitmentsPlan,
        totalCommitmentsReal,
        coverageRatio,
        fixedExpenseRatio,
        debtLoadRatio,
        availableToBudget,
        cardsAccruedArs,
        cardsAccruedUsd,
    }
}
