import { useState, useCallback, useRef } from 'react'
import type { BudgetState, Card, Service, PlannedExpense, Income } from './types'

const STORAGE_KEY = 'budget_fintech'

const DEFAULT_STATE: BudgetState = {
    fxOficial: 1100,
    fxCompra: 1450,
    fxVenta: 1500,
    cards: [],
    services: [],
    planned: [],
    savings: 0,
    incomes: [],
    events: [],
}

function loadState(): BudgetState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULT_STATE }
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_STATE, ...parsed }
    } catch {
        return { ...DEFAULT_STATE }
    }
}

function uid(): string {
    return Math.random().toString(36).slice(2, 9)
}

export function useBudget() {
    const [state, setStateRaw] = useState<BudgetState>(loadState)
    const stateRef = useRef(state)

    const persist = useCallback((next: BudgetState) => {
        stateRef.current = next
        setStateRaw(next)
        const { fxLoading: _, ...toSave } = next
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    }, [])

    const update = useCallback((fn: (s: BudgetState) => BudgetState) => {
        const next = fn(stateRef.current)
        persist(next)
    }, [persist])

    // --- Card operations ---
    const addCard = useCallback(() => {
        update(s => ({
            ...s,
            cards: [...s.cards, { id: uid(), name: 'Nueva Tarjeta', totalArs: 0, usdItems: [], payments: [] }],
        }))
    }, [update])

    const removeCard = useCallback((idx: number) => {
        update(s => ({ ...s, cards: s.cards.filter((_, i) => i !== idx) }))
    }, [update])

    const updateCard = useCallback((idx: number, patch: Partial<Card>) => {
        update(s => ({
            ...s,
            cards: s.cards.map((c, i) => i === idx ? { ...c, ...patch } : c),
        }))
    }, [update])

    // --- Service operations ---
    const addService = useCallback(() => {
        update(s => ({
            ...s,
            services: [...s.services, { id: uid(), name: 'Servicio', amount: 0, discount: 0 }],
        }))
    }, [update])

    const removeService = useCallback((idx: number) => {
        update(s => ({ ...s, services: s.services.filter((_, i) => i !== idx) }))
    }, [update])

    const updateService = useCallback((idx: number, patch: Partial<Service>) => {
        update(s => ({
            ...s,
            services: s.services.map((sv, i) => i === idx ? { ...sv, ...patch } : sv),
        }))
    }, [update])

    // --- Planned operations ---
    const addPlanned = useCallback(() => {
        update(s => ({
            ...s,
            planned: [...s.planned, { id: uid(), name: 'Gasto', amount: 0 }],
        }))
    }, [update])

    const removePlanned = useCallback((idx: number) => {
        update(s => ({ ...s, planned: s.planned.filter((_, i) => i !== idx) }))
    }, [update])

    const updatePlanned = useCallback((idx: number, patch: Partial<PlannedExpense>) => {
        update(s => ({
            ...s,
            planned: s.planned.map((p, i) => i === idx ? { ...p, ...patch } : p),
        }))
    }, [update])

    // --- Income operations ---
    const addIncome = useCallback(() => {
        update(s => ({
            ...s,
            incomes: [...s.incomes, { id: uid(), name: 'Ingreso', amount: 0 }],
        }))
    }, [update])

    const removeIncome = useCallback((idx: number) => {
        update(s => ({ ...s, incomes: s.incomes.filter((_, i) => i !== idx) }))
    }, [update])

    const updateIncome = useCallback((idx: number, patch: Partial<Income>) => {
        update(s => ({
            ...s,
            incomes: s.incomes.map((inc, i) => i === idx ? { ...inc, ...patch } : inc),
        }))
    }, [update])

    // --- Savings ---
    const updateSavings = useCallback((amount: number) => {
        update(s => ({ ...s, savings: amount }))
    }, [update])

    // --- FX ---
    const updateFx = useCallback((compra: number, venta: number) => {
        update(s => ({
            ...s,
            fxOficial: (compra + venta) / 2,
            fxCompra: compra,
            fxVenta: venta,
        }))
    }, [update])

    // --- Computed totals ---
    const cardsBal = state.cards.reduce((acc, c) => {
        const usd = c.usdItems.reduce((s, u) => s + u.amount, 0) * state.fxVenta
        const fee = (c.feeArsBase || 0) * (1 + (c.feeVatRate ?? 0.21))
        const paid = c.payments.reduce((s, p) => s + p.amount, 0)
        return acc + (c.totalArs + usd + fee - paid)
    }, 0)

    const servicesTotal = state.services.reduce((acc, s) =>
        acc + (s.paid ? 0 : (s.amount - (s.discount || 0))), 0)

    const plannedTotal = state.planned.reduce((acc, p) =>
        acc + (p.paid ? 0 : p.amount), 0)

    const incomeTotal = state.incomes.reduce((acc, i) => acc + i.amount, 0)

    const executedTotal = (state.events || []).reduce((acc, e) => acc + e.amount, 0)

    const expenseTotal = cardsBal + servicesTotal + plannedTotal + state.savings
    const available = incomeTotal - expenseTotal - executedTotal

    return {
        state,
        // Operations
        addCard, removeCard, updateCard,
        addService, removeService, updateService,
        addPlanned, removePlanned, updatePlanned,
        addIncome, removeIncome, updateIncome,
        updateSavings, updateFx, update,
        // Computed
        cardsBal, servicesTotal, plannedTotal, incomeTotal,
        executedTotal, expenseTotal, available,
    }
}
