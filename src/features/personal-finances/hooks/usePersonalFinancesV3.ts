// =============================================================================
// Personal Finances V3 Hook — Uses Dexie Store
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PFCreditCard, PFCardConsumption, PFDebt, PFFixedExpense, PFIncome, PFBudgetCategory } from '@/db/schema'
import * as store from '../services/pfStore'
import { getCurrentYearMonth, addMonthsToYearMonth } from '../utils/dateHelpers'

export interface MonthlyTotals {
    totalIncome: number
    totalDebts: number
    totalFixed: number
    totalCards: number
    totalBudgeted: number
    commitments: number
    available: number
}

export function usePersonalFinancesV3() {
    const [loading, setLoading] = useState(true)
    const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())

    // Data state
    const [creditCards, setCreditCards] = useState<PFCreditCard[]>([])
    const [consumptions, setConsumptions] = useState<PFCardConsumption[]>([])
    const [debts, setDebts] = useState<PFDebt[]>([])
    const [fixedExpenses, setFixedExpenses] = useState<PFFixedExpense[]>([])
    const [incomes, setIncomes] = useState<PFIncome[]>([])
    const [budgets, setBudgets] = useState<PFBudgetCategory[]>([])

    // Initialize: run migration and load data
    useEffect(() => {
        async function init() {
            setLoading(true)
            await store.migrateToV3()
            await refreshAll()
            setLoading(false)
        }
        init()
    }, [])

    // Reload data when yearMonth changes
    useEffect(() => {
        if (!loading) {
            refreshMonthData()
        }
    }, [yearMonth, loading])

    const refreshAll = useCallback(async () => {
        const [cards, allDebts, allExpenses, monthIncomes, monthBudgets] = await Promise.all([
            store.getAllCreditCards(),
            store.getAllDebts(),
            store.getAllFixedExpenses(),
            store.getIncomesByMonth(yearMonth),
            store.getBudgetsByMonth(yearMonth),
        ])

        setCreditCards(cards)
        setDebts(allDebts)
        setFixedExpenses(allExpenses)
        setIncomes(monthIncomes)
        setBudgets(monthBudgets)

        // Load consumptions for current month
        const monthConsumptions = await store.getConsumptionsByYearMonth(yearMonth)
        setConsumptions(monthConsumptions)
    }, [yearMonth])

    const refreshMonthData = useCallback(async () => {
        const [monthConsumptions, monthDebts, monthExpenses, monthIncomes, monthBudgets] = await Promise.all([
            store.getConsumptionsByYearMonth(yearMonth),
            store.getDebtsByMonth(yearMonth),
            store.getFixedExpensesByMonth(yearMonth),
            store.getIncomesByMonth(yearMonth),
            store.getBudgetsByMonth(yearMonth),
        ])

        setConsumptions(monthConsumptions)
        setDebts(monthDebts)
        setFixedExpenses(monthExpenses)
        setIncomes(monthIncomes)
        setBudgets(monthBudgets)
    }, [yearMonth])

    // Group consumptions by card
    const consumptionsByCard = useMemo(() => {
        const map: Record<string, PFCardConsumption[]> = {}
        for (const c of consumptions) {
            if (!map[c.cardId]) map[c.cardId] = []
            map[c.cardId].push(c)
        }
        return map
    }, [consumptions])

    // Calculate totals for current month
    const totals = useMemo<MonthlyTotals>(() => {
        const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0)
        const totalCards = consumptions.reduce((sum, c) => sum + c.amount, 0)
        const totalDebts = debts.reduce((sum, d) => sum + d.monthlyValue, 0)
        const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
        const totalBudgeted = budgets.reduce((sum, b) => sum + b.estimatedAmount, 0)
        const commitments = totalCards + totalDebts + totalFixed
        const available = totalIncome - commitments - totalBudgeted

        return { totalIncome, totalDebts, totalFixed, totalCards, totalBudgeted, commitments, available }
    }, [incomes, consumptions, debts, fixedExpenses, budgets])

    // Month navigation
    const goToPrevMonth = useCallback(() => {
        setYearMonth(ym => addMonthsToYearMonth(ym, -1))
    }, [])

    const goToNextMonth = useCallback(() => {
        setYearMonth(ym => addMonthsToYearMonth(ym, 1))
    }, [])

    const goToMonth = useCallback((ym: string) => {
        setYearMonth(ym)
    }, [])

    // Credit Card CRUD
    const createCard = useCallback(async (card: Omit<PFCreditCard, 'id' | 'createdAt'>) => {
        const newCard = await store.createCreditCard(card)
        setCreditCards(cards => [...cards, newCard])
        return newCard
    }, [])

    const updateCard = useCallback(async (id: string, updates: Partial<PFCreditCard>) => {
        await store.updateCreditCard(id, updates)
        setCreditCards(cards => cards.map(c => c.id === id ? { ...c, ...updates } : c))
    }, [])

    const deleteCard = useCallback(async (id: string) => {
        await store.deleteCreditCard(id)
        setCreditCards(cards => cards.filter(c => c.id !== id))
        setConsumptions(cons => cons.filter(c => c.cardId !== id))
    }, [])

    // Consumption CRUD
    const createConsumption = useCallback(async (
        input: store.CreateConsumptionInput,
        card: PFCreditCard
    ) => {
        const created = await store.createConsumption(input, card)
        // Only add consumptions that belong to current month
        const toAdd = created.filter(c => c.postedYearMonth === yearMonth)
        if (toAdd.length > 0) {
            setConsumptions(cons => [...cons, ...toAdd])
        }
        return created
    }, [yearMonth])

    const deleteConsumption = useCallback(async (id: string) => {
        await store.deleteConsumption(id)
        setConsumptions(cons => cons.filter(c => c.id !== id))
    }, [])

    // Debt CRUD
    const createDebt = useCallback(async (debt: Omit<PFDebt, 'id' | 'createdAt'>) => {
        const newDebt = await store.createDebt(debt)
        setDebts(debts => [...debts, newDebt])
        return newDebt
    }, [])

    const updateDebt = useCallback(async (id: string, updates: Partial<PFDebt>) => {
        await store.updateDebt(id, updates)
        setDebts(debts => debts.map(d => d.id === id ? { ...d, ...updates } : d))
    }, [])

    const deleteDebt = useCallback(async (id: string) => {
        await store.deleteDebt(id)
        setDebts(debts => debts.filter(d => d.id !== id))
    }, [])

    const registerPrepayment = useCallback(async (
        id: string,
        amount: number,
        strategy: 'reduce_count' | 'reduce_amount'
    ) => {
        await store.registerPrepayment(id, amount, strategy)
        await refreshMonthData()
    }, [refreshMonthData])

    // Fixed Expense CRUD
    const createFixedExpense = useCallback(async (expense: Omit<PFFixedExpense, 'id' | 'createdAt'>) => {
        const newExp = await store.createFixedExpense(expense)
        setFixedExpenses(exps => [...exps, newExp])
        return newExp
    }, [])

    const updateFixedExpense = useCallback(async (id: string, updates: Partial<PFFixedExpense>) => {
        await store.updateFixedExpense(id, updates)
        setFixedExpenses(exps => exps.map(e => e.id === id ? { ...e, ...updates } : e))
    }, [])

    const deleteFixedExpense = useCallback(async (id: string) => {
        await store.deleteFixedExpense(id)
        setFixedExpenses(exps => exps.filter(e => e.id !== id))
    }, [])

    // Income CRUD
    const createIncome = useCallback(async (income: Omit<PFIncome, 'id' | 'createdAt'>) => {
        const newInc = await store.createIncome(income)
        if (income.yearMonth === yearMonth) {
            setIncomes(incs => [...incs, newInc])
        }
        return newInc
    }, [yearMonth])

    const updateIncome = useCallback(async (id: string, updates: Partial<PFIncome>) => {
        await store.updateIncome(id, updates)
        setIncomes(incs => incs.map(i => i.id === id ? { ...i, ...updates } : i))
    }, [])

    const deleteIncome = useCallback(async (id: string) => {
        await store.deleteIncome(id)
        setIncomes(incs => incs.filter(i => i.id !== id))
    }, [])

    // Budget CRUD
    const createBudget = useCallback(async (budget: Omit<PFBudgetCategory, 'id' | 'createdAt'>) => {
        const newBudget = await store.createBudget(budget)
        if (budget.yearMonth === yearMonth) {
            setBudgets(bgs => [...bgs, newBudget])
        }
        return newBudget
    }, [yearMonth])

    const updateBudget = useCallback(async (id: string, updates: Partial<PFBudgetCategory>) => {
        await store.updateBudget(id, updates)
        setBudgets(bgs => bgs.map(b => b.id === id ? { ...b, ...updates } : b))
    }, [])

    const deleteBudget = useCallback(async (id: string) => {
        await store.deleteBudget(id)
        setBudgets(bgs => bgs.filter(b => b.id !== id))
    }, [])

    const addBudgetSpending = useCallback(async (id: string, amount: number) => {
        await store.addBudgetSpending(id, amount)
        setBudgets(bgs => bgs.map(b => b.id === id ? { ...b, spentAmount: b.spentAmount + amount } : b))
    }, [])

    return {
        loading,
        yearMonth,
        goToPrevMonth,
        goToNextMonth,
        goToMonth,

        // Data
        creditCards,
        consumptions,
        consumptionsByCard,
        debts,
        fixedExpenses,
        incomes,
        budgets,
        totals,

        // Actions
        createCard,
        updateCard,
        deleteCard,
        createConsumption,
        deleteConsumption,
        createDebt,
        updateDebt,
        deleteDebt,
        registerPrepayment,
        createFixedExpense,
        updateFixedExpense,
        deleteFixedExpense,
        createIncome,
        updateIncome,
        deleteIncome,
        createBudget,
        updateBudget,
        deleteBudget,
        addBudgetSpending,
        refreshAll,
    }
}
