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
    currency: 'ARS' | 'USD'
    purchaseDateISO: string       // Actual purchase date
    closingYearMonth: string      // "YYYY-MM" (month where statement closes - devengado)
    postedYearMonth: string       // "YYYY-MM" (payment month - when due)
    statementId?: string          // Link to statement (optional, for future use)
    installmentTotal?: number     // null = single payment
    installmentIndex?: number     // 1-based
    category?: string
    isRecurring?: boolean
    recurring?: {
        freq: 'monthly'
        interval?: number
        startDate: string // ISO
        until?: string | null
    }
    recurringId?: string
    createdAt: string
}

export type PFStatementStatus = 'UNPAID' | 'PAID'

export interface PFStatement {
    id: string
    cardId: string
    closeDate: string             // "YYYY-MM-DD" fecha de cierre
    dueDate: string               // "YYYY-MM-DD" fecha de vencimiento
    periodStart: string           // "YYYY-MM-DD" inicio período de consumos
    periodEnd: string             // "YYYY-MM-DD" = closeDate
    closingYearMonth: string      // "YYYY-MM" mes donde cierra
    dueYearMonth: string          // "YYYY-MM" mes donde vence
    totalAmount: number           // Cached total (can be recalculated)
    status: PFStatementStatus
    paidAt?: string               // ISO datetime when marked as paid
    paidAmount?: number           // Actual amount paid (supports partial later)
    paymentMovementId?: string    // Link to the movement created for payment
    paymentAccountId?: string
    createdAt: string
    updatedAt?: string
}

export type PFDebtStatus = 'active' | 'paid' | 'pending' | 'overdue' | 'completed'
export type PFDebtCategory =
    | 'banco'
    | 'profesional'
    | 'familiar'
    | 'comercio'
    | 'otro'
    | 'credit_card'
    | 'loan'
    | 'personal'
export type PFRecurrence = 'ONCE' | 'MONTHLY'
export type PFExpenseCategory = 'service' | 'subscription' | 'education' | 'housing' | 'insurance'

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
    monthlyValue: number
    dueDay?: number
    dueDateDay?: number
    status: PFDebtStatus
    category?: PFDebtCategory
    startDate?: string          // "YYYY-MM-DD"
    startYearMonth: string       // "YYYY-MM"
    defaultAccountId?: string
    createdAt: string
    paidInstallments?: number
    payments?: Array<{
        date: string
        amount: number
        installmentIndex?: number
        movementId?: string
        accountId?: string
    }>
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
    executions?: Array<{
        yearMonth: string
        effectiveDate: string
        amount: number
        accountId?: string
        movementId?: string
    }>
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
    effectiveDate?: string
    accountId?: string
    movementId?: string
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

// Provider Commission Settings (for V2 VNR calculation)
export interface ProviderSettings {
    id: string              // = accountId (provider)
    buyPct: number          // e.g. 0.5 for 0.5%
    sellPct: number         // e.g. 0.5 for 0.5%
    fixedArs?: number       // Fixed ARS commission
    fixedUsd?: number       // Fixed USD commission
    updatedAt: string       // ISO datetime
}

// Account Settings (for V2 classification overrides and display names)
export type RubroOverride = 'billeteras' | 'frascos' | 'plazos' | 'cedears' | 'cripto'

export interface AccountSettings {
    id: string                      // = accountId
    displayNameOverride?: string    // Human-readable name override
    rubroOverride?: RubroOverride   // Manual rubro classification
    tnaOverride?: number            // Override TNA for yield calculation
    hidden?: boolean                // Hide from all views
    updatedAt: string               // ISO datetime
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
    pfStatements!: Table<PFStatement, string>
    pfDebts!: Table<PFDebt, string>
    pfFixedExpenses!: Table<PFFixedExpense, string>
    pfIncomes!: Table<PFIncome, string>
    pfBudgets!: Table<PFBudgetCategory, string>

    // Provider Commission Settings
    providerSettings!: Table<ProviderSettings, string>

    // Account Settings (display names, rubro overrides)
    accountSettings!: Table<AccountSettings, string>

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

        // V4: Credit Card Statements + closingYearMonth index
        this.version(4).stores({
            pfConsumptions: 'id, cardId, postedYearMonth, closingYearMonth, purchaseDateISO',
            pfStatements: 'id, cardId, closingYearMonth, dueYearMonth, status',
        })

        // V5: Provider Commission Settings for VNR calculation
        this.version(5).stores({
            providerSettings: 'id',
        })

        // V6: Account Settings for display names and rubro overrides
        this.version(6).stores({
            accountSettings: 'id',
        })

        // V7: Snapshot source tagging + V2 breakdown support
        this.version(7).stores({
            snapshots: 'id, dateLocal, createdAtISO, source',
        }).upgrade(async (tx) => {
            const snapshotsTable = tx.table('snapshots')
            await snapshotsTable.toCollection().modify((snapshot: Record<string, unknown>) => {
                if (!snapshot.source) {
                    snapshot.source = 'legacy'
                }
            })
        })
    }
}

export const db = new ArgfolioDatabase()

// Check if database has been seeded
export async function isDatabaseSeeded(): Promise<boolean> {
    const count = await db.accounts.count()
    return count > 0
}

