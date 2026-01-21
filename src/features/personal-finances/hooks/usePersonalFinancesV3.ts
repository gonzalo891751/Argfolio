// =============================================================================
// Personal Finances V3 Hook — Uses Dexie Store
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
    PFCreditCard,
    PFCardConsumption,
    PFStatement,
    PFDebt,
    PFFixedExpense,
    PFIncome,
    PFBudgetCategory,
} from '@/db/schema'
import * as store from '../services/pfStore'
import {
    getCurrentYearMonth,
    addMonthsToYearMonth,
    getStatementClosingInMonth,
    getStatementDueInMonth,
    type StatementPeriod
} from '../utils/dateHelpers'
import { computeMonthlyKpis, type MonthlyKpis } from '../models/kpis'

export interface CardStatementData {
    card: PFCreditCard
    // Statement closing this month (devengado)
    closingStatement: StatementPeriod
    closingConsumptions: PFCardConsumption[]
    closingTotal: number // Keeps sum of all amounts (mixed)
    closingTotalArs: number // Sum of ARS only
    closingTotalUsd: number // Sum of USD only
    // Statement due this month (a pagar)
    dueStatement: StatementPeriod
    dueStatementRecord: PFStatement | null
    dueConsumptions: PFCardConsumption[]
    dueTotal: number
    dueTotalArs: number
    dueTotalUsd: number // Sum of USD only
    isPaid: boolean
}

export function usePersonalFinancesV3(mepSell?: number | null) {
    const [loading, setLoading] = useState(true)
    const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())

    // Data state
    const [creditCards, setCreditCards] = useState<PFCreditCard[]>([])
    const [consumptions, setConsumptions] = useState<PFCardConsumption[]>([])
    const [consumptionsClosing, setConsumptionsClosing] = useState<PFCardConsumption[]>([])
    const [statements, setStatements] = useState<PFStatement[]>([])
    const [statementsDueNextMonth, setStatementsDueNextMonth] = useState<PFStatement[]>([])
    const [statementsDueThisMonth, setStatementsDueThisMonth] = useState<PFStatement[]>([])
    const [debts, setDebts] = useState<PFDebt[]>([])
    const [fixedExpenses, setFixedExpenses] = useState<PFFixedExpense[]>([])
    const [incomes, setIncomes] = useState<PFIncome[]>([])
    const [allIncomes, setAllIncomes] = useState<PFIncome[]>([])
    const [budgets, setBudgets] = useState<PFBudgetCategory[]>([])

    // Initialize: run migration and load data
    useEffect(() => {
        async function init() {
            setLoading(true)
            await store.migrateToV3()
            await store.migrateConsumptionsToV4()
            await store.migrateDebtsToV5()
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
        const [cards, allDebts, allExpenses, monthIncomes, allIncomeRows, monthBudgets] = await Promise.all([
            store.getAllCreditCards(),
            store.getAllDebts(),
            store.getAllFixedExpenses(),
            store.getIncomesByMonth(yearMonth),
            store.getAllIncomes(),
            store.getBudgetsByMonth(yearMonth),
        ])

        setCreditCards(cards)
        setDebts(allDebts)
        setFixedExpenses(allExpenses)
        setIncomes(monthIncomes)
        setAllIncomes(allIncomeRows)
        setBudgets(monthBudgets)

        // Load consumptions for current month (both closing and due views)
        await refreshConsumptionsAndStatements(cards)
        const nextMonth = addMonthsToYearMonth(yearMonth, 1)
        const [nextStatements, thisMonthStatements] = await Promise.all([
            store.getStatementsDueInMonth(nextMonth),
            store.getStatementsDueInMonth(yearMonth),
        ])
        setStatementsDueNextMonth(nextStatements)
        setStatementsDueThisMonth(thisMonthStatements)
    }, [yearMonth])

    const refreshConsumptionsAndStatements = useCallback(async (cards: PFCreditCard[]) => {
        // Get consumptions that CLOSE this month (devengado)
        const closingCons = await store.getAllConsumptionsByClosingMonth(yearMonth)
        setConsumptionsClosing(closingCons)

        // Get consumptions that are DUE this month (close was last month)
        const dueCons = await store.getConsumptionsByYearMonth(yearMonth)
        setConsumptions(dueCons)

        // Ensure statements exist for cards with activity
        const statementsToLoad: PFStatement[] = []

        for (const card of cards) {
            // Get or create statement for closing month
            const closingConsForCard = closingCons.filter(c => c.cardId === card.id)
            if (closingConsForCard.length > 0) {
                const stmt = await store.getOrCreateStatement(card, yearMonth)
                statementsToLoad.push(stmt)
            }

            // Get statement for due month (created when it was closing month)
            const dueStmt = await store.getStatementByDueMonth(card.id, yearMonth)
            if (dueStmt && !statementsToLoad.find(s => s.id === dueStmt.id)) {
                statementsToLoad.push(dueStmt)
            }
        }

        setStatements(statementsToLoad)
    }, [yearMonth])

    const refreshMonthData = useCallback(async () => {
        const [allDebts, monthExpenses, monthIncomes, allIncomeRows, monthBudgets] = await Promise.all([
            store.getAllDebts(),
            store.getFixedExpensesByMonth(yearMonth),
            store.getIncomesByMonth(yearMonth),
            store.getAllIncomes(),
            store.getBudgetsByMonth(yearMonth),
        ])

        setDebts(allDebts)
        setFixedExpenses(monthExpenses)
        setIncomes(monthIncomes)
        setAllIncomes(allIncomeRows)
        setBudgets(monthBudgets)

        // Refresh consumptions and statements
        await refreshConsumptionsAndStatements(creditCards)
        const nextMonth = addMonthsToYearMonth(yearMonth, 1)
        const [nextStatements, thisMonthStatements] = await Promise.all([
            store.getStatementsDueInMonth(nextMonth),
            store.getStatementsDueInMonth(yearMonth),
        ])
        setStatementsDueNextMonth(nextStatements)
        setStatementsDueThisMonth(thisMonthStatements)
    }, [yearMonth, creditCards, refreshConsumptionsAndStatements])

    // Build card data with both closing and due periods
    const cardStatementData = useMemo<CardStatementData[]>(() => {
        return creditCards.map(card => {
            // Statement closing this month
            const closingStatement = getStatementClosingInMonth(card.closingDay, card.dueDay, yearMonth)
            const closingConsumptions = consumptionsClosing.filter(c => c.cardId === card.id)
            const closingTotalArs = closingConsumptions
                .filter(c => c.currency === 'ARS' || !c.currency)
                .reduce((sum, c) => sum + c.amount, 0)
            const closingTotalUsd = closingConsumptions
                .filter(c => c.currency === 'USD')
                .reduce((sum, c) => sum + c.amount, 0)
            const closingTotal = closingTotalArs + closingTotalUsd // Mixed sum

            // Statement due this month (closed last month)
            const dueStatement = getStatementDueInMonth(card.closingDay, card.dueDay, yearMonth)
            const dueStatementRecord = statements.find(
                s => s.cardId === card.id && s.dueYearMonth === yearMonth
            ) || null
            const dueConsumptions = consumptions.filter(c => c.cardId === card.id)

            // For due totals, prefer statement record if exists, otherwise sum consumptions
            const dueTotalArs = dueStatementRecord
                ? dueStatementRecord.totalAmount // Assumes statement is mostly ARS or consolidated. TODO: Add currency to statement?
                : dueConsumptions
                    .filter(c => c.currency === 'ARS' || !c.currency)
                    .reduce((sum, c) => sum + c.amount, 0)

            const dueTotalUsd = dueStatementRecord
                ? 0 // If using statement record, we don't have split USD info yet in PFStatement
                : dueConsumptions
                    .filter(c => c.currency === 'USD')
                    .reduce((sum, c) => sum + c.amount, 0)

            const dueTotal = dueTotalArs + dueTotalUsd
            const isPaid = dueStatementRecord?.status === 'PAID'

            return {
                card,
                closingStatement,
                closingConsumptions,
                closingTotal,
                closingTotalArs,
                closingTotalUsd,
                dueStatement,
                dueStatementRecord,
                dueConsumptions,
                dueTotal,
                dueTotalArs,
                dueTotalUsd,
                isPaid,
            }
        })
    }, [creditCards, consumptionsClosing, consumptions, statements, yearMonth])

    // Group consumptions by card (for backward compatibility - uses closing month consumptions)
    const consumptionsByCard = useMemo(() => {
        const map: Record<string, PFCardConsumption[]> = {}
        for (const c of consumptionsClosing) {
            if (!map[c.cardId]) map[c.cardId] = []
            map[c.cardId].push(c)
        }
        return map
    }, [consumptionsClosing])

    // Calculate totals for current month
    const kpis = useMemo<MonthlyKpis>(() => {
        return computeMonthlyKpis({
            yearMonth,
            incomesForMonth: incomes,
            allIncomes,
            fixedExpenses,
            consumptionsClosing,
            statementsDueNextMonth,
            statementsDueThisMonth,
            statements,
            debts,
            budgets,
            mepSell,
        })
    }, [
        yearMonth,
        incomes,
        allIncomes,
        fixedExpenses,
        consumptionsClosing,
        statementsDueNextMonth,
        statementsDueThisMonth,
        statementsDueThisMonth,
        statements,
        debts,
        budgets,
        mepSell,
    ])

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
        setConsumptionsClosing(cons => cons.filter(c => c.cardId !== id))
    }, [])

    // Consumption CRUD
    const createConsumption = useCallback(async (
        input: store.CreateConsumptionInput,
        card: PFCreditCard
    ) => {
        const created = await store.createConsumption(input, card)
        // Refresh to pick up new data
        await refreshConsumptionsAndStatements(creditCards)
        return created
    }, [creditCards, refreshConsumptionsAndStatements])

    const deleteConsumption = useCallback(async (id: string) => {
        const existing =
            consumptionsClosing.find(c => c.id === id) ??
            consumptions.find(c => c.id === id)

        await store.deleteConsumption(id)

        setConsumptions(cons => cons.filter(c => c.id !== id))
        setConsumptionsClosing(cons => cons.filter(c => c.id !== id))

        if (existing?.closingYearMonth) {
            const stmt = await store.getStatementByClosingMonth(existing.cardId, existing.closingYearMonth)
            if (stmt) {
                await store.recalculateStatementTotal(stmt.id)
            }
        }

        await refreshConsumptionsAndStatements(creditCards)
    }, [consumptionsClosing, consumptions, creditCards, refreshConsumptionsAndStatements])

    const updateConsumption = useCallback(async (
        id: string,
        updates: store.UpdateConsumptionInput,
        card: PFCreditCard
    ) => {
        await store.updateConsumption(id, updates, card)
        await refreshConsumptionsAndStatements(creditCards)
    }, [creditCards, refreshConsumptionsAndStatements])

    // Statement Payment
    const markStatementPaid = useCallback(async (
        cardId: string,
        paymentDateISO: string,
        movementId?: string,
        paymentAccountId?: string,
        paidAmount?: number
    ) => {
        // Find the statement due this month for this card
        const stmt = statements.find(s => s.cardId === cardId && s.dueYearMonth === yearMonth)
        if (!stmt) {
            console.warn('No statement found to mark as paid')
            return
        }

        await store.markStatementPaid(stmt.id, paymentDateISO, movementId, paymentAccountId, paidAmount)

        // Update local state
        setStatements(prev => prev.map(s =>
            s.id === stmt.id
                ? {
                    ...s,
                    status: 'PAID' as const,
                    paidAt: paymentDateISO,
                    paymentMovementId: movementId,
                    paymentAccountId,
                    paidAmount,
                }
                : s
        ))
    }, [statements, yearMonth])

    const markStatementUnpaid = useCallback(async (cardId: string) => {
        const stmt = statements.find(s => s.cardId === cardId && s.dueYearMonth === yearMonth)
        if (!stmt) return

        // TODO: Delete or reverse the movement

        await store.markStatementUnpaid(stmt.id)

        setStatements(prev => prev.map(s =>
            s.id === stmt.id
                ? { ...s, status: 'UNPAID' as const, paidAt: undefined, paymentMovementId: undefined }
                : s
        ))
    }, [statements, yearMonth])

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
        consumptions,            // Consumptions DUE this month (legacy)
        consumptionsClosing,     // Consumptions CLOSING this month (devengado)
        consumptionsByCard,      // Grouped by card (uses closing month)
        cardStatementData,       // Full card data with both periods
        statements,
        statementsDueNextMonth,
        debts,
        fixedExpenses,
        incomes,
        allIncomes,
        budgets,
        kpis,

        // Actions
        createCard,
        updateCard,
        deleteCard,
        createConsumption,
        deleteConsumption,
        updateConsumption,
        markStatementPaid,
        markStatementUnpaid,
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
        executeIncome: store.executeIncome,
        executeFixedExpense: store.executeFixedExpense,
        recordDebtPayment: store.recordDebtPayment,
        refreshAll,
    }
}
