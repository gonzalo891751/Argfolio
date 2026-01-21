import Dexie, { Table } from 'dexie'
import type { Movement, Instrument, Account, Snapshot, Debt } from '@/domain/types'

// =============================================================================
// Personal Finances V3 Types (DB-level)
// =============================================================================

export interface PFCreditCard {
    id: string
    bank: string           // "Galicia", "BBVA"
    name: string           // "Visa Signature"
    last4: string          // "4509"
    network?: 'VISA' | 'MASTERCARD' | 'AMEX'
    currency: 'ARS'
    closingDay: number     // 1-31
    dueDay: number         // 1-31
    defaultAccountId?: string
    createdAt: string
    updatedAt?: string
}

export interface PFCardConsumption {
    id: string
    cardId: string
    description: string
    amount: number
    currency: 'ARS'
    purchaseDateISO: string       // Actual purchase date
    postedYearMonth: string       // "YYYY-MM" (payment month)
    installmentTotal?: number     // null = single payment
    installmentIndex?: number     // 1-based
    category?: string
    createdAt: string
}

export type PFDebtStatus = 'active' | 'paid' | 'pending' | 'overdue'
export type PFRecurrence = 'ONCE' | 'MONTHLY'
export type PFExpenseCategory = 'service' | 'subscription' | 'education' | 'housing' | 'insurance'

export interface PFDebt {
    id: string
    title: string
    counterparty: string
    totalAmount: number
    remainingAmount: number
    installmentsCount: number
    currentInstallment: number
    monthlyValue: number
    dueDateDay: number
    status: PFDebtStatus
    startYearMonth: string       // "YYYY-MM"
    defaultAccountId?: string
    createdAt: string
    // Prepayment tracking
    prepayments?: Array<{
        date: string
        amount: number
        strategy: 'reduce_count' | 'reduce_amount'
    }>
}

export interface PFFixedExpense {
    id: string
    title: string
    amount: number
    dueDay: number
    category: PFExpenseCategory
    recurrence: PFRecurrence      // NEW: 'ONCE' | 'MONTHLY'
    startYearMonth: string        // "YYYY-MM"
    endYearMonth?: string         // Optional end
    status: PFDebtStatus
    autoDebit: boolean
    defaultAccountId?: string
    createdAt: string
}

export interface PFIncome {
    id: string
    title: string
    amount: number
    dateExpected: number          // Day of month
    yearMonth: string             // "YYYY-MM"
    isGuaranteed: boolean
    status: 'pending' | 'received'
    defaultAccountId?: string
    createdAt: string
}

export interface PFBudgetCategory {
    id: string
    name: string
    estimatedAmount: number
    spentAmount: number
    yearMonth: string             // "YYYY-MM"
    createdAt: string
}

// =============================================================================
// Dexie Database Schema
// =============================================================================

export class ArgfolioDatabase extends Dexie {
    movements!: Table<Movement, string>
    instruments!: Table<Instrument, string>
    accounts!: Table<Account, string>
    snapshots!: Table<Snapshot, string>
    debts!: Table<Debt, string>
    manualPrices!: Table<{ instrumentId: string; price: number; updatedAtISO: string }, string>

    // Personal Finances V3 Tables
    pfCreditCards!: Table<PFCreditCard, string>
    pfConsumptions!: Table<PFCardConsumption, string>
    pfDebts!: Table<PFDebt, string>
    pfFixedExpenses!: Table<PFFixedExpense, string>
    pfIncomes!: Table<PFIncome, string>
    pfBudgets!: Table<PFBudgetCategory, string>

    constructor() {
        super('argfolio-db')

        this.version(1).stores({
            movements: 'id, datetimeISO, type, instrumentId, accountId, tradeCurrency',
            instruments: 'id, symbol, category, nativeCurrency',
            accounts: 'id, name, kind',
            snapshots: 'id, dateLocal, createdAtISO',
            debts: 'id, status, dueDateLocal',
        })

        this.version(2).stores({
            manualPrices: 'instrumentId',
        })

        // V3: Personal Finances Tables
        this.version(3).stores({
            pfCreditCards: 'id, bank, closingDay, dueDay',
            pfConsumptions: 'id, cardId, postedYearMonth, purchaseDateISO',
            pfDebts: 'id, status, startYearMonth',
            pfFixedExpenses: 'id, recurrence, startYearMonth',
            pfIncomes: 'id, yearMonth, status',
            pfBudgets: 'id, yearMonth',
        })
    }
}

export const db = new ArgfolioDatabase()

// Check if database has been seeded
export async function isDatabaseSeeded(): Promise<boolean> {
    const count = await db.accounts.count()
    return count > 0
}

