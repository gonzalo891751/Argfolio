// =============================================================================
// USE PERSONAL FINANCES HOOK
// =============================================================================

import { useState, useCallback, useMemo } from 'react'
import {
    loadPersonalFinances,
    createDebt,
    updateDebt,
    deleteDebt,
    payDebtInstallment,
    createFixedExpense,
    updateFixedExpense,
    deleteFixedExpense,
    payFixedExpense,
    createIncome,
    updateIncome,
    deleteIncome,
    markIncomeReceived,
    // V2: Credit Card operations
    createCreditCard,
    updateCreditCard,
    deleteCreditCard,
    addCardConsumption,
    removeCardConsumption,
    // V2: Budget operations
    createBudgetCategory,
    updateBudgetCategory,
    deleteBudgetCategory,
    addBudgetSpending,
} from '../services/personalFinancesStore'
import {
    computeMonthTotals,
    computeComparison,
    getUpcomingMaturities,
    getMonthKey,
    addMonths,
} from '../models/calculations'
import type {
    PFDebt,
    FixedExpense,
    Income,
    CreditCard,
    CardConsumption,
    BudgetCategory,
    PersonalFinancesData,
    MonthlySnapshot,
    UpcomingItem,
} from '../models/types'

export interface UsePersonalFinancesReturn {
    // Data
    data: PersonalFinancesData
    debts: PFDebt[]
    fixedExpenses: FixedExpense[]
    incomes: Income[]
    creditCards: CreditCard[] // V2
    budgetItems: BudgetCategory[] // V2

    // Current month state
    currentDate: Date
    monthKey: string
    setCurrentDate: (date: Date) => void
    goToPreviousMonth: () => void
    goToNextMonth: () => void

    // Computed
    currentTotals: MonthlySnapshot
    previousTotals: MonthlySnapshot | null
    comparison: ReturnType<typeof computeComparison>
    upcomingMaturities: UpcomingItem[]

    // Debt actions
    addDebt: (debt: Omit<PFDebt, 'id' | 'createdAt'>) => PFDebt
    editDebt: (id: string, updates: Partial<PFDebt>) => void
    removeDebt: (id: string) => void
    payDebt: (id: string) => void

    // Fixed expense actions
    addFixedExpense: (expense: Omit<FixedExpense, 'id' | 'createdAt'>) => FixedExpense
    editFixedExpense: (id: string, updates: Partial<FixedExpense>) => void
    removeFixedExpense: (id: string) => void
    payExpense: (id: string) => void

    // Income actions
    addIncome: (income: Omit<Income, 'id' | 'createdAt'>) => Income
    editIncome: (id: string, updates: Partial<Income>) => void
    removeIncome: (id: string) => void
    receiveIncome: (id: string) => void

    // V2: Credit Card actions
    addCard: (card: Omit<CreditCard, 'id' | 'createdAt' | 'consumptions'>) => CreditCard
    editCard: (id: string, updates: Partial<CreditCard>) => void
    removeCard: (id: string) => void
    addConsumption: (cardId: string, consumption: Omit<CardConsumption, 'id'>) => CardConsumption
    removeConsumption: (cardId: string, consumptionId: string) => void

    // V2: Budget actions
    addBudget: (item: Omit<BudgetCategory, 'id' | 'createdAt' | 'spentAmount'>) => BudgetCategory
    editBudget: (id: string, updates: Partial<BudgetCategory>) => void
    removeBudget: (id: string) => void
    recordSpending: (id: string, amount: number) => void

    // Refresh
    refresh: () => void
}

export function usePersonalFinances(): UsePersonalFinancesReturn {
    // State
    const [data, setData] = useState<PersonalFinancesData>(() => loadPersonalFinances())
    const [currentDate, setCurrentDate] = useState<Date>(() => new Date())

    // Derived
    const monthKey = useMemo(() => getMonthKey(currentDate), [currentDate])
    const previousMonthKey = useMemo(
        () => getMonthKey(addMonths(currentDate, -1)),
        [currentDate]
    )

    // Refresh data from localStorage
    const refresh = useCallback(() => {
        setData(loadPersonalFinances())
    }, [])

    // Month navigation (immutable)
    const goToPreviousMonth = useCallback(() => {
        setCurrentDate((prev) => addMonths(prev, -1))
    }, [])

    const goToNextMonth = useCallback(() => {
        setCurrentDate((prev) => addMonths(prev, 1))
    }, [])

    // Computed totals
    const currentTotals = useMemo(
        () => computeMonthTotals(data, monthKey),
        [data, monthKey]
    )

    const previousTotals = useMemo(
        () => computeMonthTotals(data, previousMonthKey),
        [data, previousMonthKey]
    )

    const comparison = useMemo(
        () => computeComparison(currentTotals, previousTotals),
        [currentTotals, previousTotals]
    )

    const upcomingMaturities = useMemo(
        () => getUpcomingMaturities(
            data.debts,
            data.fixedExpenses,
            currentDate,
            5,
            data.creditCards || []
        ),
        [data.debts, data.fixedExpenses, data.creditCards, currentDate]
    )

    // =========================================================================
    // Debt actions
    // =========================================================================
    const addDebt = useCallback((debt: Omit<PFDebt, 'id' | 'createdAt'>) => {
        const newDebt = createDebt(debt)
        refresh()
        return newDebt
    }, [refresh])

    const editDebt = useCallback((id: string, updates: Partial<PFDebt>) => {
        updateDebt(id, updates)
        refresh()
    }, [refresh])

    const removeDebt = useCallback((id: string) => {
        deleteDebt(id)
        refresh()
    }, [refresh])

    const payDebt = useCallback((id: string) => {
        payDebtInstallment(id)
        refresh()
    }, [refresh])

    // =========================================================================
    // Fixed expense actions
    // =========================================================================
    const addFixedExpense = useCallback(
        (expense: Omit<FixedExpense, 'id' | 'createdAt'>) => {
            const newExpense = createFixedExpense(expense)
            refresh()
            return newExpense
        },
        [refresh]
    )

    const editFixedExpense = useCallback(
        (id: string, updates: Partial<FixedExpense>) => {
            updateFixedExpense(id, updates)
            refresh()
        },
        [refresh]
    )

    const removeFixedExpense = useCallback((id: string) => {
        deleteFixedExpense(id)
        refresh()
    }, [refresh])

    const payExpense = useCallback((id: string) => {
        payFixedExpense(id)
        refresh()
    }, [refresh])

    // =========================================================================
    // Income actions
    // =========================================================================
    const addIncome = useCallback((income: Omit<Income, 'id' | 'createdAt'>) => {
        const newIncome = createIncome(income)
        refresh()
        return newIncome
    }, [refresh])

    const editIncome = useCallback((id: string, updates: Partial<Income>) => {
        updateIncome(id, updates)
        refresh()
    }, [refresh])

    const removeIncome = useCallback((id: string) => {
        deleteIncome(id)
        refresh()
    }, [refresh])

    const receiveIncome = useCallback((id: string) => {
        markIncomeReceived(id)
        refresh()
    }, [refresh])

    // =========================================================================
    // V2: Credit Card actions
    // =========================================================================
    const addCard = useCallback(
        (card: Omit<CreditCard, 'id' | 'createdAt' | 'consumptions'>) => {
            const newCard = createCreditCard(card)
            refresh()
            return newCard
        },
        [refresh]
    )

    const editCard = useCallback(
        (id: string, updates: Partial<CreditCard>) => {
            updateCreditCard(id, updates)
            refresh()
        },
        [refresh]
    )

    const removeCard = useCallback((id: string) => {
        deleteCreditCard(id)
        refresh()
    }, [refresh])

    const addConsumption = useCallback(
        (cardId: string, consumption: Omit<CardConsumption, 'id'>) => {
            const newConsumption = addCardConsumption(cardId, consumption)
            refresh()
            return newConsumption
        },
        [refresh]
    )

    const removeConsumption = useCallback(
        (cardId: string, consumptionId: string) => {
            removeCardConsumption(cardId, consumptionId)
            refresh()
        },
        [refresh]
    )

    // =========================================================================
    // V2: Budget actions
    // =========================================================================
    const addBudget = useCallback(
        (item: Omit<BudgetCategory, 'id' | 'createdAt' | 'spentAmount'>) => {
            const newItem = createBudgetCategory(item)
            refresh()
            return newItem
        },
        [refresh]
    )

    const editBudget = useCallback(
        (id: string, updates: Partial<BudgetCategory>) => {
            updateBudgetCategory(id, updates)
            refresh()
        },
        [refresh]
    )

    const removeBudget = useCallback((id: string) => {
        deleteBudgetCategory(id)
        refresh()
    }, [refresh])

    const recordSpending = useCallback(
        (id: string, amount: number) => {
            addBudgetSpending(id, amount)
            refresh()
        },
        [refresh]
    )

    return {
        data,
        debts: data.debts,
        fixedExpenses: data.fixedExpenses,
        incomes: data.incomes,
        creditCards: data.creditCards || [],
        budgetItems: data.budgetItems || [],
        currentDate,
        monthKey,
        setCurrentDate,
        goToPreviousMonth,
        goToNextMonth,
        currentTotals,
        previousTotals,
        comparison,
        upcomingMaturities,
        // Debt
        addDebt,
        editDebt,
        removeDebt,
        payDebt,
        // Expense
        addFixedExpense,
        editFixedExpense,
        removeFixedExpense,
        payExpense,
        // Income
        addIncome,
        editIncome,
        removeIncome,
        receiveIncome,
        // V2: Cards
        addCard,
        editCard,
        removeCard,
        addConsumption,
        removeConsumption,
        // V2: Budget
        addBudget,
        editBudget,
        removeBudget,
        recordSpending,
        // Refresh
        refresh,
    }
}
