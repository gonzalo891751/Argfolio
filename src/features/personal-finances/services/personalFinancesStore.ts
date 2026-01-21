// =============================================================================
// PERSONAL FINANCES STORE — localStorage Persistence
// =============================================================================

import type {
    PFDebt,
    FixedExpense,
    Income,
    CreditCard,
    CardConsumption,
    BudgetCategory,
    PersonalFinancesData,
} from '../models/types'

const STORAGE_KEY_V2 = 'argfolio.personalFinances.v2'
const STORAGE_KEY_V1 = 'argfolio.personalFinances.v1'

/**
 * Default empty state
 */
function getDefaultData(): PersonalFinancesData {
    return {
        debts: [],
        fixedExpenses: [],
        incomes: [],
        creditCards: [],
        budgetItems: [],
        settings: {},
    }
}

/**
 * Migrate V1 data to V2 format
 */
function migrateV1ToV2(v1Data: Partial<PersonalFinancesData>): PersonalFinancesData {
    return {
        debts: v1Data.debts || [],
        fixedExpenses: v1Data.fixedExpenses || [],
        incomes: v1Data.incomes || [],
        creditCards: [], // New in V2
        budgetItems: [], // New in V2
        settings: v1Data.settings || {},
    }
}

/**
 * Load data from localStorage (with V1 migration)
 */
export function loadPersonalFinances(): PersonalFinancesData {
    try {
        // Try V2 first
        const rawV2 = localStorage.getItem(STORAGE_KEY_V2)
        if (rawV2) {
            const parsed = JSON.parse(rawV2)
            // Merge with defaults to handle new fields
            return {
                ...getDefaultData(),
                ...parsed,
            }
        }

        // Fall back to V1 and migrate
        const rawV1 = localStorage.getItem(STORAGE_KEY_V1)
        if (rawV1) {
            const parsed = JSON.parse(rawV1)
            const migrated = migrateV1ToV2(parsed)
            // Save as V2
            savePersonalFinances(migrated)
            return migrated
        }

        return getDefaultData()
    } catch (error) {
        console.error('Failed to load personal finances data:', error)
        return getDefaultData()
    }
}

/**
 * Save data to localStorage
 */
export function savePersonalFinances(data: PersonalFinancesData): void {
    try {
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data))
    } catch (error) {
        console.error('Failed to save personal finances data:', error)
    }
}

/**
 * Generate a unique ID
 */
function generateId(): string {
    return crypto.randomUUID()
}

/**
 * Get current ISO timestamp
 */
function nowISO(): string {
    return new Date().toISOString()
}

// =============================================================================
// DEBT OPERATIONS
// =============================================================================

export function createDebt(
    debt: Omit<PFDebt, 'id' | 'createdAt'>
): PFDebt {
    const data = loadPersonalFinances()
    const newDebt: PFDebt = {
        ...debt,
        id: generateId(),
        createdAt: nowISO(),
    }
    data.debts.push(newDebt)
    savePersonalFinances(data)
    return newDebt
}

export function updateDebt(id: string, updates: Partial<PFDebt>): void {
    const data = loadPersonalFinances()
    const index = data.debts.findIndex((d) => d.id === id)
    if (index !== -1) {
        data.debts[index] = { ...data.debts[index], ...updates }
        savePersonalFinances(data)
    }
}

export function deleteDebt(id: string): void {
    const data = loadPersonalFinances()
    data.debts = data.debts.filter((d) => d.id !== id)
    savePersonalFinances(data)
}

export function payDebtInstallment(id: string): void {
    const data = loadPersonalFinances()
    const debt = data.debts.find((d) => d.id === id)
    if (!debt) return

    const newCurrent = debt.currentInstallment + 1
    const newRemaining = debt.remainingAmount - debt.monthlyValue

    if (newCurrent >= debt.installmentsCount) {
        // Fully paid
        debt.currentInstallment = debt.installmentsCount
        debt.remainingAmount = 0
        debt.status = 'paid'
    } else {
        debt.currentInstallment = newCurrent
        debt.remainingAmount = Math.max(0, newRemaining)
        debt.status = 'active'
    }

    savePersonalFinances(data)
}

// =============================================================================
// FIXED EXPENSE OPERATIONS
// =============================================================================

export function createFixedExpense(
    expense: Omit<FixedExpense, 'id' | 'createdAt'>
): FixedExpense {
    const data = loadPersonalFinances()
    const newExpense: FixedExpense = {
        ...expense,
        id: generateId(),
        createdAt: nowISO(),
    }
    data.fixedExpenses.push(newExpense)
    savePersonalFinances(data)
    return newExpense
}

export function updateFixedExpense(id: string, updates: Partial<FixedExpense>): void {
    const data = loadPersonalFinances()
    const index = data.fixedExpenses.findIndex((e) => e.id === id)
    if (index !== -1) {
        data.fixedExpenses[index] = { ...data.fixedExpenses[index], ...updates }
        savePersonalFinances(data)
    }
}

export function deleteFixedExpense(id: string): void {
    const data = loadPersonalFinances()
    data.fixedExpenses = data.fixedExpenses.filter((e) => e.id !== id)
    savePersonalFinances(data)
}

export function payFixedExpense(id: string): void {
    updateFixedExpense(id, { status: 'paid' })
}

// =============================================================================
// INCOME OPERATIONS
// =============================================================================

export function createIncome(
    income: Omit<Income, 'id' | 'createdAt'>
): Income {
    const data = loadPersonalFinances()
    const newIncome: Income = {
        ...income,
        id: generateId(),
        createdAt: nowISO(),
    }
    data.incomes.push(newIncome)
    savePersonalFinances(data)
    return newIncome
}

export function updateIncome(id: string, updates: Partial<Income>): void {
    const data = loadPersonalFinances()
    const index = data.incomes.findIndex((i) => i.id === id)
    if (index !== -1) {
        data.incomes[index] = { ...data.incomes[index], ...updates }
        savePersonalFinances(data)
    }
}

export function deleteIncome(id: string): void {
    const data = loadPersonalFinances()
    data.incomes = data.incomes.filter((i) => i.id !== id)
    savePersonalFinances(data)
}

export function markIncomeReceived(id: string): void {
    updateIncome(id, { status: 'received' })
}

// =============================================================================
// V2: CREDIT CARD OPERATIONS
// =============================================================================

export function createCreditCard(
    card: Omit<CreditCard, 'id' | 'createdAt' | 'consumptions'>
): CreditCard {
    const data = loadPersonalFinances()
    const newCard: CreditCard = {
        ...card,
        id: generateId(),
        consumptions: [],
        createdAt: nowISO(),
    }
    data.creditCards.push(newCard)
    savePersonalFinances(data)
    return newCard
}

export function updateCreditCard(id: string, updates: Partial<CreditCard>): void {
    const data = loadPersonalFinances()
    const index = data.creditCards.findIndex((c) => c.id === id)
    if (index !== -1) {
        data.creditCards[index] = { ...data.creditCards[index], ...updates }
        savePersonalFinances(data)
    }
}

export function deleteCreditCard(id: string): void {
    const data = loadPersonalFinances()
    data.creditCards = data.creditCards.filter((c) => c.id !== id)
    savePersonalFinances(data)
}

export function addCardConsumption(
    cardId: string,
    consumption: Omit<CardConsumption, 'id'>
): CardConsumption {
    const data = loadPersonalFinances()
    const card = data.creditCards.find((c) => c.id === cardId)
    if (!card) throw new Error('Card not found')

    const newConsumption: CardConsumption = {
        ...consumption,
        id: generateId(),
    }
    card.consumptions.push(newConsumption)
    savePersonalFinances(data)
    return newConsumption
}

export function removeCardConsumption(cardId: string, consumptionId: string): void {
    const data = loadPersonalFinances()
    const card = data.creditCards.find((c) => c.id === cardId)
    if (!card) return

    card.consumptions = card.consumptions.filter((c) => c.id !== consumptionId)
    savePersonalFinances(data)
}

// =============================================================================
// V2: BUDGET CATEGORY OPERATIONS
// =============================================================================

export function createBudgetCategory(
    item: Omit<BudgetCategory, 'id' | 'createdAt' | 'spentAmount'>
): BudgetCategory {
    const data = loadPersonalFinances()
    const newItem: BudgetCategory = {
        ...item,
        id: generateId(),
        spentAmount: 0,
        createdAt: nowISO(),
    }
    data.budgetItems.push(newItem)
    savePersonalFinances(data)
    return newItem
}

export function updateBudgetCategory(id: string, updates: Partial<BudgetCategory>): void {
    const data = loadPersonalFinances()
    const index = data.budgetItems.findIndex((b) => b.id === id)
    if (index !== -1) {
        data.budgetItems[index] = { ...data.budgetItems[index], ...updates }
        savePersonalFinances(data)
    }
}

export function deleteBudgetCategory(id: string): void {
    const data = loadPersonalFinances()
    data.budgetItems = data.budgetItems.filter((b) => b.id !== id)
    savePersonalFinances(data)
}

export function addBudgetSpending(id: string, amount: number): void {
    const data = loadPersonalFinances()
    const item = data.budgetItems.find((b) => b.id === id)
    if (!item) return

    item.spentAmount = (item.spentAmount || 0) + amount
    savePersonalFinances(data)
}

// =============================================================================
// SETTINGS OPERATIONS
// =============================================================================

export function updateSettings(updates: Partial<PersonalFinancesData['settings']>): void {
    const data = loadPersonalFinances()
    data.settings = { ...data.settings, ...updates }
    savePersonalFinances(data)
}

// =============================================================================
// MONTHLY RESET (call at start of each month)
// =============================================================================

export function resetMonthlyStatuses(): void {
    const data = loadPersonalFinances()

    // Reset fixed expenses to pending for new month
    data.fixedExpenses = data.fixedExpenses.map((e) => ({
        ...e,
        status: 'pending' as const,
    }))

    // Reset pending incomes
    data.incomes = data.incomes.map((i) => ({
        ...i,
        status: 'pending' as const,
    }))

    // Reset budget spent amounts
    data.budgetItems = data.budgetItems.map((b) => ({
        ...b,
        spentAmount: 0,
    }))

    // Update overdue debts
    const today = new Date().getDate()
    data.debts = data.debts.map((d) => {
        if (d.status === 'pending' && d.dueDateDay < today) {
            return { ...d, status: 'overdue' as const }
        }
        return d
    })

    savePersonalFinances(data)
}
