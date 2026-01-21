// =============================================================================
// PERSONAL FINANCES CALCULATIONS — Pure Functions
// =============================================================================

import type {
    PFDebt,
    FixedExpense,
    CreditCard,
    BudgetCategory,
    MonthlySnapshot,
    Installment,
    UpcomingItem,
    PersonalFinancesData,
} from './types'

/**
 * Get month key in YYYY-MM format
 */
export function getMonthKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
}

/**
 * Parse month key back to Date (first day of month)
 */
export function parseMonthKey(monthKey: string): Date {
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(year, month - 1, 1)
}

/**
 * Add months to a date (immutable)
 */
export function addMonths(date: Date, delta: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

/**
 * Get the first day of the month for a given date
 */
export function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Check if a day has passed in the current month
 */
export function isDayPassed(day: number, referenceDate: Date): boolean {
    return day < referenceDate.getDate()
}

/**
 * Calculate days until a due date (negative if overdue)
 */
export function getDaysUntil(dueDay: number, referenceDate: Date): number {
    const today = referenceDate.getDate()
    const diff = dueDay - today
    return diff
}

/**
 * V2: Calculate days until a specific day in the current month.
 * Returns accurate calculation considering the actual days in the current month.
 */
export function daysUntilDay(day: number, referenceDate: Date = new Date()): number {
    const today = referenceDate.getDate()
    const daysInMonth = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth() + 1,
        0
    ).getDate()

    // Clamp day to the max days in current month
    const effectiveDay = Math.min(day, daysInMonth)

    if (effectiveDay >= today) {
        return effectiveDay - today
    } else {
        // Already passed this month, calculate until next month's occurrence
        const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1)
        const daysInNextMonth = new Date(
            nextMonth.getFullYear(),
            nextMonth.getMonth() + 1,
            0
        ).getDate()
        const effectiveNextDay = Math.min(day, daysInNextMonth)
        const daysLeftThisMonth = daysInMonth - today
        return daysLeftThisMonth + effectiveNextDay
    }
}

/**
 * Get days message for display
 */
export function getDaysMessage(dueDay: number, referenceDate: Date): string {
    const diff = getDaysUntil(dueDay, referenceDate)
    if (diff === 0) return 'Vence hoy'
    if (diff === 1) return 'Vence mañana'
    if (diff < 0) return `Venció hace ${Math.abs(diff)} días`
    return `En ${diff} días`
}

/**
 * V2: Get closing/due message for credit cards
 */
export function getCardClosingMessage(closeDay: number, referenceDate: Date = new Date()): string {
    const days = daysUntilDay(closeDay, referenceDate)
    if (days === 0) return 'Cierra hoy'
    if (days <= 3) return `Cierra en ${days} días`
    if (days > 25) return 'Ya cerró'
    return `Cierra en ${days} días`
}

/**
 * Compute installment schedule for a debt
 */
export function computeDebtSchedule(debt: PFDebt, startDate: Date): Installment[] {
    const installments: Installment[] = []

    for (let i = 0; i < debt.installmentsCount; i++) {
        const dueDate = new Date(
            startDate.getFullYear(),
            startDate.getMonth() + i,
            debt.dueDateDay
        )

        installments.push({
            index: i + 1,
            monthKey: getMonthKey(dueDate),
            dueDate,
            amount: debt.monthlyValue,
            status: i < debt.currentInstallment ? 'paid' : 'pending',
        })
    }

    return installments
}

/**
 * V2: Calculate total credit card consumptions
 */
export function computeCardTotal(card: CreditCard): number {
    return card.consumptions.reduce((acc, c) => acc + c.amount, 0)
}

/**
 * V2: Calculate total across all credit cards
 */
export function computeAllCardsTotal(cards: CreditCard[]): number {
    return cards.reduce((acc, card) => acc + computeCardTotal(card), 0)
}

/**
 * V2: Calculate total budgeted amount
 */
export function computeBudgetedTotal(items: BudgetCategory[]): number {
    return items.reduce((acc, item) => acc + item.estimatedAmount, 0)
}

/**
 * V2: Calculate total spent from budget
 */
export function computeBudgetSpent(items: BudgetCategory[]): number {
    return items.reduce((acc, item) => acc + item.spentAmount, 0)
}

/**
 * Compute month totals for KPIs
 */
export function computeMonthTotals(
    data: PersonalFinancesData,
    _monthKey: string
): MonthlySnapshot {
    const totalIncome = data.incomes.reduce((acc, item) => acc + item.amount, 0)
    const totalDebts = data.debts
        .filter((d) => d.status !== 'paid')
        .reduce((acc, item) => acc + item.monthlyValue, 0)
    const totalFixed = data.fixedExpenses.reduce((acc, item) => acc + item.amount, 0)

    // V2: Credit cards and budget
    const totalCards = computeAllCardsTotal(data.creditCards || [])
    const totalBudgeted = computeBudgetedTotal(data.budgetItems || [])

    // Commitments = debts + fixed + cards (budget is variable, not a commitment)
    const commitments = totalDebts + totalFixed + totalCards
    const available = totalIncome - commitments - totalBudgeted
    const coverageRatio = totalIncome > 0 ? (commitments / totalIncome) * 100 : 0

    return {
        monthKey: _monthKey,
        totalIncome,
        totalDebts,
        totalFixed,
        totalCards,
        totalBudgeted,
        commitments,
        available,
        coverageRatio,
    }
}

/**
 * Compute comparison between two monthly snapshots
 */
export function computeComparison(
    current: MonthlySnapshot,
    previous: MonthlySnapshot | null
): {
    incomeDelta: number
    incomeDeltaPct: number
    commitmentsDelta: number
    commitmentsDeltaPct: number
    availableDelta: number
    availableDeltaPct: number
} {
    if (!previous) {
        return {
            incomeDelta: 0,
            incomeDeltaPct: 0,
            commitmentsDelta: 0,
            commitmentsDeltaPct: 0,
            availableDelta: 0,
            availableDeltaPct: 0,
        }
    }

    const calcDelta = (curr: number, prev: number) => curr - prev
    const calcPct = (curr: number, prev: number) =>
        prev !== 0 ? ((curr - prev) / prev) * 100 : 0

    return {
        incomeDelta: calcDelta(current.totalIncome, previous.totalIncome),
        incomeDeltaPct: calcPct(current.totalIncome, previous.totalIncome),
        commitmentsDelta: calcDelta(current.commitments, previous.commitments),
        commitmentsDeltaPct: calcPct(current.commitments, previous.commitments),
        availableDelta: calcDelta(current.available, previous.available),
        availableDeltaPct: calcPct(current.available, previous.available),
    }
}

/**
 * Build upcoming maturities list (mixed debts + expenses + cards)
 */
export function getUpcomingMaturities(
    debts: PFDebt[],
    expenses: FixedExpense[],
    referenceDate: Date,
    limit = 5,
    cards: CreditCard[] = []
): UpcomingItem[] {
    const allItems: UpcomingItem[] = [
        ...debts
            .filter((d) => d.status !== 'paid')
            .map((d) => ({
                id: d.id,
                type: 'debt' as const,
                title: d.title,
                amount: d.monthlyValue,
                dueDay: d.dueDateDay,
                status: d.status,
                counterparty: d.counterparty,
                installmentInfo: `${d.currentInstallment}/${d.installmentsCount}`,
                category: d.category,
            })),
        ...expenses
            .filter((e) => e.status !== 'paid')
            .map((e) => ({
                id: e.id,
                type: 'expense' as const,
                title: e.title,
                amount: e.amount,
                dueDay: e.dueDay,
                status: e.status,
                category: e.category,
            })),
        // V2: Add credit card due dates
        ...cards.map((c) => ({
            id: c.id,
            type: 'card' as const,
            title: c.name,
            amount: computeCardTotal(c),
            dueDay: c.dueDay,
            status: 'pending' as const,
            counterparty: c.bank,
        })),
    ]

    // Sort by proximity to current date
    const today = referenceDate.getDate()
    return allItems
        .sort((a, b) => {
            let distA = a.dueDay - today
            let distB = b.dueDay - today
            // Overdue items come first (negative distance)
            if (distA < 0 && a.status !== 'overdue') distA += 30
            if (distB < 0 && b.status !== 'overdue') distB += 30
            // Actually overdue items come even before
            if (a.status === 'overdue') distA = -100
            if (b.status === 'overdue') distB = -100
            return distA - distB
        })
        .slice(0, limit)
}

/**
 * Format currency ARS style
 */
export function formatARS(amount: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

/**
 * Format percentage with sign
 */
export function formatPercent(value: number): string {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
}
