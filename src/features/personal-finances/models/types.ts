// =============================================================================
// PERSONAL FINANCES TYPES
// =============================================================================

export type ItemStatus = 'active' | 'paid' | 'pending' | 'overdue'
export type InterestMode = 'none' | 'percent' | 'fixed'
export type ExpenseCategory = 'service' | 'subscription' | 'education' | 'housing' | 'insurance'
export type DebtCategory =
    | 'credit_card'
    | 'loan'
    | 'personal'
    | 'banco'
    | 'profesional'
    | 'familiar'
    | 'comercio'
    | 'otro'

// V2: New item type for modal wizard
export type NewItemType = 'income' | 'debt' | 'expense-fixed' | 'budget' | 'expense-normal'

// V2: Debt subtypes for wizard
export type DebtSubtype = 'tarjeta' | 'prestamo' | 'personal'

export interface PFDebt {
    id: string
    name?: string
    title: string
    description?: string
    counterparty: string
    totalAmount: number
    remainingAmount: number
    installmentsCount: number
    installmentAmount?: number
    currentInstallment: number
    interestMode: InterestMode
    monthlyValue: number
    dueDateDay?: number
    dueDay?: number
    status: ItemStatus
    category: DebtCategory
    startDate?: string
    startYearMonth?: string
    paidInstallments?: number
    payments?: Array<{
        date: string
        amount: number
        installmentIndex?: number
    }>
    defaultAccountId?: string
    createdAt: string
}

export interface FixedExpense {
    id: string
    title: string
    amount: number
    dueDay: number
    category: ExpenseCategory
    status: ItemStatus
    autoDebit: boolean
    defaultAccountId?: string
    createdAt: string
}

export interface Income {
    id: string
    title: string
    amount: number
    dateExpected: number
    isGuaranteed: boolean
    status: 'pending' | 'received'
    defaultAccountId?: string
    createdAt: string
}

// =============================================================================
// V2: CREDIT CARDS
// =============================================================================

export interface CardConsumption {
    id: string
    concept: string
    amount: number
    date: string // ISO date
    category: string
    installments: { current: number; total: number } | null
}

export interface CreditCard {
    id: string
    name: string // e.g., "Visa Galicia"
    issuer: string // e.g., "Visa", "Mastercard"
    bank: string // e.g., "Galicia"
    closeDay: number // Day of month (1-31)
    dueDay: number // Day of month (1-31)
    consumptions: CardConsumption[]
    defaultAccountId?: string
    createdAt: string
}

// =============================================================================
// V2: BUDGET CATEGORIES
// =============================================================================

export interface BudgetCategory {
    id: string
    name: string // e.g., "Supermercado", "Nafta"
    estimatedAmount: number
    spentAmount: number // Tracked manually or from movements
    createdAt: string
}

// =============================================================================
// SNAPSHOTS & AGGREGATES
// =============================================================================

export interface MonthlySnapshot {
    monthKey: string // "YYYY-MM"
    totalIncome: number
    totalDebts: number
    totalFixed: number
    totalCards: number // V2: credit card totals
    totalBudgeted: number // V2: budget estimates
    commitments: number
    available: number
    coverageRatio: number
}

export interface PersonalFinancesData {
    debts: PFDebt[]
    fixedExpenses: FixedExpense[]
    incomes: Income[]
    creditCards: CreditCard[] // V2
    budgetItems: BudgetCategory[] // V2
    settings: {
        defaultAccountId?: string
    }
}

// Installment for debt schedule
export interface Installment {
    index: number
    monthKey: string
    dueDate: Date
    amount: number
    status: ItemStatus
    paidAt?: string
}

// Upcoming maturity item (unified across debts, expenses, and cards)
export interface UpcomingItem {
    id: string
    type: 'debt' | 'expense' | 'card'
    title: string
    amount: number
    dueDay: number
    status: ItemStatus
    counterparty?: string
    installmentInfo?: string // e.g. "3/12"
    category?: DebtCategory | ExpenseCategory
}
