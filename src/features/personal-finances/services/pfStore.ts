// =============================================================================
// Personal Finances V3 Store — Dexie Persistence
// =============================================================================

import { db, type PFCreditCard, type PFCardConsumption, type PFStatement, type PFDebt, type PFFixedExpense, type PFIncome, type PFBudgetCategory } from '@/db/schema'
import {
    addMonthsToYearMonth,
    getCurrentYearMonth,
    getStatementForTransaction,
    getStatementClosingInMonth,
} from '../utils/dateHelpers'

// Legacy localStorage keys
const STORAGE_KEY_V2 = 'argfolio.personalFinances.v2'
const STORAGE_KEY_V3_MIGRATED = 'argfolio.personalFinances.v3.migrated'

function normalizeDebtCategory(category?: string): PFDebt['category'] {
    if (!category) return 'otro'
    if (category === 'loan') return 'banco'
    if (category === 'personal') return 'familiar'
    return category as PFDebt['category']
}

function getInstallmentAmount(debt: {
    installmentAmount?: number
    monthlyValue?: number
    totalAmount?: number
    installmentsCount?: number
}): number {
    if (debt.installmentAmount && debt.installmentAmount > 0) return debt.installmentAmount
    if (debt.monthlyValue && debt.monthlyValue > 0) return debt.monthlyValue
    if (debt.totalAmount && debt.installmentsCount) {
        return Math.ceil(debt.totalAmount / debt.installmentsCount)
    }
    return 0
}

// =============================================================================
// MIGRATION FROM LOCALSTORAGE TO DEXIE
// =============================================================================

interface LegacyData {
    debts?: any[]
    fixedExpenses?: any[]
    incomes?: any[]
    creditCards?: any[]
    budgetItems?: any[]
    settings?: any
}

/**
 * Check if migration from localStorage to Dexie has been done.
 */
export async function isV3Migrated(): Promise<boolean> {
    return localStorage.getItem(STORAGE_KEY_V3_MIGRATED) === 'true'
}

/**
 * Migrate legacy localStorage data to Dexie tables.
 * This runs once on first load.
 */
export async function migrateToV3(): Promise<void> {
    if (await isV3Migrated()) return

    try {
        const raw = localStorage.getItem(STORAGE_KEY_V2)
        if (!raw) {
            localStorage.setItem(STORAGE_KEY_V3_MIGRATED, 'true')
            return
        }

        const legacy: LegacyData = JSON.parse(raw)
        const currentYM = getCurrentYearMonth()

        // Migrate Credit Cards
        if (legacy.creditCards?.length) {
            for (const card of legacy.creditCards) {
                const newCard: PFCreditCard = {
                    id: card.id || crypto.randomUUID(),
                    bank: card.bank || card.issuer || 'Desconocido',
                    name: card.name || 'Tarjeta',
                    last4: card.last4 || '0000',
                    network: card.issuer?.toUpperCase() as any,
                    currency: 'ARS',
                    closingDay: card.closeDay || card.closingDay || 25,
                    dueDay: card.dueDay || 5,
                    defaultAccountId: card.defaultAccountId,
                    createdAt: card.createdAt || new Date().toISOString(),
                }
                await db.pfCreditCards.put(newCard)

                // Migrate embedded consumptions
                if (card.consumptions?.length) {
                    for (const cons of card.consumptions) {
                        const purchaseDate = cons.date || new Date().toISOString().split('T')[0]
                        const statement = getStatementForTransaction(newCard.closingDay, newCard.dueDay, purchaseDate)
                        const newCons: PFCardConsumption = {
                            id: cons.id || crypto.randomUUID(),
                            cardId: newCard.id,
                            description: cons.concept || cons.description || 'Consumo',
                            amount: cons.amount || 0,
                            currency: 'ARS',
                            purchaseDateISO: purchaseDate,
                            closingYearMonth: statement.closingYearMonth,
                            postedYearMonth: statement.dueYearMonth,
                            installmentTotal: cons.installments?.total,
                            installmentIndex: cons.installments?.current,
                            category: cons.category,
                            createdAt: new Date().toISOString(),
                        }
                        await db.pfConsumptions.put(newCons)
                    }
                }
            }
        }

        // Migrate Debts
        if (legacy.debts?.length) {
            for (const debt of legacy.debts) {
                const totalAmount = debt.totalAmount || 0
                const installmentsCount = debt.installmentsCount || 1
                const monthlyValue = debt.monthlyValue || Math.ceil(totalAmount / installmentsCount)
                const dueDay = debt.dueDay || debt.dueDateDay || 1
                const newDebt: PFDebt = {
                    id: debt.id || crypto.randomUUID(),
                    name: debt.name || debt.title,
                    title: debt.title || debt.name || 'Deuda',
                    description: debt.description,
                    counterparty: debt.counterparty || 'Desconocido',
                    totalAmount,
                    remainingAmount: debt.remainingAmount || totalAmount,
                    installmentsCount,
                    installmentAmount: debt.installmentAmount || monthlyValue,
                    currentInstallment: debt.currentInstallment || 1,
                    monthlyValue,
                    dueDay,
                    dueDateDay: debt.dueDateDay || dueDay,
                    status: debt.status || 'active',
                    category: normalizeDebtCategory(debt.category),
                    startDate: debt.startDate,
                    startYearMonth: debt.startYearMonth || currentYM,
                    defaultAccountId: debt.defaultAccountId,
                    createdAt: debt.createdAt || new Date().toISOString(),
                }
                await db.pfDebts.put(newDebt)
            }
        }

        // Migrate Fixed Expenses
        if (legacy.fixedExpenses?.length) {
            for (const exp of legacy.fixedExpenses) {
                const newExp: PFFixedExpense = {
                    id: exp.id || crypto.randomUUID(),
                    title: exp.title || 'Gasto Fijo',
                    amount: exp.amount || 0,
                    dueDay: exp.dueDay || 1,
                    category: exp.category || 'service',
                    recurrence: 'MONTHLY', // Default to monthly for existing
                    startYearMonth: currentYM,
                    status: exp.status || 'pending',
                    autoDebit: exp.autoDebit || false,
                    defaultAccountId: exp.defaultAccountId,
                    createdAt: exp.createdAt || new Date().toISOString(),
                }
                await db.pfFixedExpenses.put(newExp)
            }
        }

        // Migrate Incomes
        if (legacy.incomes?.length) {
            for (const inc of legacy.incomes) {
                const newInc: PFIncome = {
                    id: inc.id || crypto.randomUUID(),
                    title: inc.title || 'Ingreso',
                    amount: inc.amount || 0,
                    dateExpected: inc.dateExpected || 1,
                    yearMonth: currentYM,
                    isGuaranteed: inc.isGuaranteed || false,
                    status: inc.status || 'pending',
                    defaultAccountId: inc.defaultAccountId,
                    createdAt: inc.createdAt || new Date().toISOString(),
                }
                await db.pfIncomes.put(newInc)
            }
        }

        // Migrate Budget Categories
        if (legacy.budgetItems?.length) {
            for (const budget of legacy.budgetItems) {
                const newBudget: PFBudgetCategory = {
                    id: budget.id || crypto.randomUUID(),
                    name: budget.name || 'Categoría',
                    estimatedAmount: budget.estimatedAmount || 0,
                    spentAmount: budget.spentAmount || 0,
                    yearMonth: currentYM,
                    createdAt: budget.createdAt || new Date().toISOString(),
                }
                await db.pfBudgets.put(newBudget)
            }
        }

        localStorage.setItem(STORAGE_KEY_V3_MIGRATED, 'true')
        console.log('[PF V3] Migration from localStorage complete')
    } catch (error) {
        console.error('[PF V3] Migration failed:', error)
    }
}

/**
 * Migrate existing consumptions to add closingYearMonth if missing.
 * This handles the V3 -> V4 schema upgrade.
 */
export async function migrateConsumptionsToV4(): Promise<void> {
    const consumptions = await db.pfConsumptions.toArray()
    const cards = await db.pfCreditCards.toArray()
    const cardMap = new Map(cards.map(c => [c.id, c]))

    for (const cons of consumptions) {
        // Skip if already has closingYearMonth
        if (cons.closingYearMonth) continue

        const card = cardMap.get(cons.cardId)
        if (!card) continue

        // Calculate closingYearMonth from purchaseDateISO
        const statement = getStatementForTransaction(card.closingDay, card.dueDay, cons.purchaseDateISO)

        await db.pfConsumptions.update(cons.id, {
            closingYearMonth: statement.closingYearMonth,
            // Also update postedYearMonth if it's wrong
            postedYearMonth: statement.dueYearMonth,
        })
    }

    console.log('[PF V4] Consumptions migration complete')
}

/**
 * Backfill new debt fields for existing records.
 */
export async function migrateDebtsToV5(): Promise<void> {
    const debts = await db.pfDebts.toArray()
    if (!debts.length) return

    for (const debt of debts) {
        const updates: Partial<PFDebt> = {}
        const dueDay = debt.dueDay || debt.dueDateDay

        if (!debt.name && debt.title) updates.name = debt.title
        if (!debt.title && debt.name) updates.title = debt.name
        if (!debt.category) updates.category = normalizeDebtCategory(debt.category)
        if (!debt.installmentAmount) updates.installmentAmount = getInstallmentAmount(debt)
        if (!debt.dueDay && dueDay) updates.dueDay = dueDay
        if (!debt.dueDateDay && dueDay) updates.dueDateDay = dueDay
        if (!debt.startYearMonth) {
            updates.startYearMonth = debt.startDate?.slice(0, 7) || getCurrentYearMonth()
        }

        if (Object.keys(updates).length > 0) {
            await db.pfDebts.update(debt.id, updates)
        }
    }

    console.log('[PF V5] Debts migration complete')
}

// =============================================================================
// CREDIT CARD OPERATIONS
// =============================================================================

export async function getAllCreditCards(): Promise<PFCreditCard[]> {
    return db.pfCreditCards.toArray()
}

export async function getCreditCardById(id: string): Promise<PFCreditCard | undefined> {
    return db.pfCreditCards.get(id)
}

export async function createCreditCard(card: Omit<PFCreditCard, 'id' | 'createdAt'>): Promise<PFCreditCard> {
    const newCard: PFCreditCard = {
        ...card,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    await db.pfCreditCards.put(newCard)
    return newCard
}

export async function updateCreditCard(id: string, updates: Partial<PFCreditCard>): Promise<void> {
    await db.pfCreditCards.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteCreditCard(id: string): Promise<void> {
    await db.pfCreditCards.delete(id)
    // Also delete related consumptions
    await db.pfConsumptions.where('cardId').equals(id).delete()
}

// =============================================================================
// CARD CONSUMPTION OPERATIONS
// =============================================================================

export async function getConsumptionsByCard(cardId: string): Promise<PFCardConsumption[]> {
    return db.pfConsumptions.where('cardId').equals(cardId).toArray()
}

export async function getConsumptionsByYearMonth(yearMonth: string): Promise<PFCardConsumption[]> {
    return db.pfConsumptions.where('postedYearMonth').equals(yearMonth).toArray()
}

export async function getConsumptionsByCardAndMonth(cardId: string, yearMonth: string): Promise<PFCardConsumption[]> {
    return db.pfConsumptions
        .where('cardId').equals(cardId)
        .and(c => c.postedYearMonth === yearMonth)
        .toArray()
}

export interface CreateConsumptionInput {
    cardId: string
    description: string
    amount: number
    purchaseDateISO: string
    currency?: 'ARS' | 'USD'
    category?: string
    installmentTotal?: number
    createAllInstallments?: boolean
}

export interface UpdateConsumptionInput {
    description: string
    amount: number
    purchaseDateISO: string
    currency?: 'ARS' | 'USD'
    category?: string
    installmentTotal?: number
}

export async function createConsumption(
    input: CreateConsumptionInput,
    card: PFCreditCard
): Promise<PFCardConsumption[]> {
    const { cardId, description, amount, purchaseDateISO, currency, category, installmentTotal, createAllInstallments } = input

    // Calculate which statement this consumption belongs to
    const baseStatement = getStatementForTransaction(card.closingDay, card.dueDay, purchaseDateISO)
    const created: PFCardConsumption[] = []

    const installments = installmentTotal && installmentTotal > 1 ? installmentTotal : 1
    const amountPerInstallment = amount / installments

    for (let i = 0; i < installments; i++) {
        // Only create first or all if requested
        if (i > 0 && !createAllInstallments) break

        // For installments, each goes to the next month's statement
        const closingYM = i === 0 ? baseStatement.closingYearMonth : addMonthsToYearMonth(baseStatement.closingYearMonth, i)
        const dueYM = i === 0 ? baseStatement.dueYearMonth : addMonthsToYearMonth(baseStatement.dueYearMonth, i)

        const cons: PFCardConsumption = {
            id: crypto.randomUUID(),
            cardId,
            description,
            amount: amountPerInstallment,
            currency: currency ?? 'ARS',
            purchaseDateISO,
            closingYearMonth: closingYM,
            postedYearMonth: dueYM,
            installmentTotal: installments > 1 ? installments : undefined,
            installmentIndex: installments > 1 ? i + 1 : undefined,
            category,
            createdAt: new Date().toISOString(),
        }
        await db.pfConsumptions.put(cons)
        created.push(cons)
    }

    return created
}

export async function deleteConsumption(id: string): Promise<void> {
    await db.pfConsumptions.delete(id)
}

export async function updateConsumption(
    id: string,
    updates: UpdateConsumptionInput,
    card: PFCreditCard
): Promise<void> {
    const statement = getStatementForTransaction(card.closingDay, card.dueDay, updates.purchaseDateISO)
    await db.pfConsumptions.update(id, {
        description: updates.description,
        amount: updates.amount,
        purchaseDateISO: updates.purchaseDateISO,
        currency: updates.currency ?? 'ARS',
        category: updates.category,
        installmentTotal: updates.installmentTotal,
        closingYearMonth: statement.closingYearMonth,
        postedYearMonth: statement.dueYearMonth,
    })
}

/**
 * Get consumptions that belong to a statement closing in a specific month.
 * These are the "devengado" consumptions - what was spent during the period.
 */
export async function getConsumptionsByClosingMonth(cardId: string, closingYearMonth: string): Promise<PFCardConsumption[]> {
    return db.pfConsumptions
        .where('cardId').equals(cardId)
        .and(c => c.closingYearMonth === closingYearMonth)
        .toArray()
}

/**
 * Get all consumptions for a card that close in a specific month (across all cards).
 */
export async function getAllConsumptionsByClosingMonth(closingYearMonth: string): Promise<PFCardConsumption[]> {
    return db.pfConsumptions.where('closingYearMonth').equals(closingYearMonth).toArray()
}

// =============================================================================
// STATEMENT OPERATIONS
// =============================================================================

/**
 * Get or create a statement for a card in a specific closing month.
 */
export async function getOrCreateStatement(
    card: PFCreditCard,
    closingYearMonth: string
): Promise<PFStatement> {
    // Check if statement exists
    const existing = await db.pfStatements
        .where('cardId').equals(card.id)
        .and(s => s.closingYearMonth === closingYearMonth)
        .first()

    if (existing) return existing

    // Create new statement
    const period = getStatementClosingInMonth(card.closingDay, card.dueDay, closingYearMonth)

    // Calculate total from consumptions
    const consumptions = await getConsumptionsByClosingMonth(card.id, closingYearMonth)
    const total = consumptions.reduce((sum, c) => sum + c.amount, 0)

    const statement: PFStatement = {
        id: crypto.randomUUID(),
        cardId: card.id,
        closeDate: period.closeDate,
        dueDate: period.dueDate,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        closingYearMonth: period.closingYearMonth,
        dueYearMonth: period.dueYearMonth,
        totalAmount: total,
        status: 'UNPAID',
        createdAt: new Date().toISOString(),
    }

    await db.pfStatements.put(statement)
    return statement
}

/**
 * Get statement for a card by closing month (returns null if not exists).
 */
export async function getStatementByClosingMonth(
    cardId: string,
    closingYearMonth: string
): Promise<PFStatement | undefined> {
    return db.pfStatements
        .where('cardId').equals(cardId)
        .and(s => s.closingYearMonth === closingYearMonth)
        .first()
}

/**
 * Get statement for a card by due month (returns null if not exists).
 */
export async function getStatementByDueMonth(
    cardId: string,
    dueYearMonth: string
): Promise<PFStatement | undefined> {
    return db.pfStatements
        .where('cardId').equals(cardId)
        .and(s => s.dueYearMonth === dueYearMonth)
        .first()
}

/**
 * Get all statements due in a specific month.
 */
export async function getStatementsDueInMonth(dueYearMonth: string): Promise<PFStatement[]> {
    return db.pfStatements.where('dueYearMonth').equals(dueYearMonth).toArray()
}

/**
 * Get all statements closing in a specific month.
 */
export async function getStatementsClosingInMonth(closingYearMonth: string): Promise<PFStatement[]> {
    return db.pfStatements.where('closingYearMonth').equals(closingYearMonth).toArray()
}

/**
 * Update statement total (recalculate from consumptions).
 */
export async function recalculateStatementTotal(statementId: string): Promise<number> {
    const statement = await db.pfStatements.get(statementId)
    if (!statement) return 0

    const consumptions = await getConsumptionsByClosingMonth(statement.cardId, statement.closingYearMonth)
    const total = consumptions.reduce((sum, c) => sum + c.amount, 0)

    await db.pfStatements.update(statementId, {
        totalAmount: total,
        updatedAt: new Date().toISOString(),
    })

    return total
}

/**
 * Mark a statement as paid, creating a movement record.
 * @returns The payment movement ID
 */
export async function markStatementPaid(
    statementId: string,
    paymentDateISO: string,
    movementId?: string
): Promise<void> {
    await db.pfStatements.update(statementId, {
        status: 'PAID',
        paidAt: paymentDateISO,
        paymentMovementId: movementId,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Mark a statement as unpaid (reverse payment).
 */
export async function markStatementUnpaid(statementId: string): Promise<void> {
    await db.pfStatements.update(statementId, {
        status: 'UNPAID',
        paidAt: undefined,
        paymentMovementId: undefined,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Get total unpaid card amount for a specific due month.
 */
export async function getTotalUnpaidCardsDueInMonth(dueYearMonth: string): Promise<number> {
    const statements = await db.pfStatements
        .where('dueYearMonth').equals(dueYearMonth)
        .and(s => s.status === 'UNPAID')
        .toArray()

    return statements.reduce((sum, s) => sum + s.totalAmount, 0)
}

// =============================================================================
// DEBT OPERATIONS
// =============================================================================

export async function getAllDebts(): Promise<PFDebt[]> {
    return db.pfDebts.toArray()
}

export async function getDebtsByMonth(yearMonth: string): Promise<PFDebt[]> {
    // Show debts that are active and have installments in this month
    const all = await db.pfDebts.where('status').equals('active').toArray()
    return all.filter(debt => {
        // Calculate if this month falls within the debt's installment range
        const startYM = debt.startYearMonth || debt.startDate?.slice(0, 7) || getCurrentYearMonth()
        const endYM = addMonthsToYearMonth(startYM, debt.installmentsCount - 1)
        return yearMonth >= startYM && yearMonth <= endYM
    })
}

export async function createDebt(debt: Omit<PFDebt, 'id' | 'createdAt'>): Promise<PFDebt> {
    const startYearMonth = debt.startYearMonth || debt.startDate?.slice(0, 7) || getCurrentYearMonth()
    const dueDay = debt.dueDay || debt.dueDateDay || 1
    const installmentAmount = getInstallmentAmount(debt)
    const newDebt: PFDebt = {
        ...debt,
        id: crypto.randomUUID(),
        name: debt.name || debt.title,
        title: debt.title || debt.name || 'Deuda',
        category: normalizeDebtCategory(debt.category),
        startYearMonth,
        dueDay,
        dueDateDay: debt.dueDateDay || dueDay,
        installmentAmount,
        createdAt: new Date().toISOString(),
    }
    await db.pfDebts.put(newDebt)
    return newDebt
}

export async function updateDebt(id: string, updates: Partial<PFDebt>): Promise<void> {
    await db.pfDebts.update(id, updates)
}

export async function deleteDebt(id: string): Promise<void> {
    await db.pfDebts.delete(id)
}

export async function registerPrepayment(
    id: string,
    amount: number,
    strategy: 'reduce_count' | 'reduce_amount'
): Promise<void> {
    const debt = await db.pfDebts.get(id)
    if (!debt) return

    const prepayment = {
        date: new Date().toISOString(),
        amount,
        strategy,
    }

    const prepayments = [...(debt.prepayments || []), prepayment]
    let updates: Partial<PFDebt> = { prepayments }

    if (strategy === 'reduce_count') {
        // Reduce number of remaining installments
        const installmentsPaid = Math.floor(amount / debt.monthlyValue)
        const newRemaining = Math.max(0, debt.remainingAmount - amount)
        const newInstallmentsCount = Math.max(1, debt.installmentsCount - installmentsPaid)
        updates = {
            ...updates,
            remainingAmount: newRemaining,
            installmentsCount: newInstallmentsCount,
        }
    } else {
        // Reduce monthly value, keep count
        const newRemaining = Math.max(0, debt.remainingAmount - amount)
        const remainingInstallments = debt.installmentsCount - debt.currentInstallment + 1
        const newMonthlyValue = remainingInstallments > 0 ? newRemaining / remainingInstallments : 0
        updates = {
            ...updates,
            remainingAmount: newRemaining,
            monthlyValue: newMonthlyValue,
        }
    }

    await db.pfDebts.update(id, updates)
}

// =============================================================================
// FIXED EXPENSE OPERATIONS
// =============================================================================

export async function getAllFixedExpenses(): Promise<PFFixedExpense[]> {
    return db.pfFixedExpenses.toArray()
}

export async function getFixedExpensesByMonth(yearMonth: string): Promise<PFFixedExpense[]> {
    const all = await db.pfFixedExpenses.toArray()
    return all.filter(exp => {
        if (exp.recurrence === 'MONTHLY') {
            // Show if started and not ended
            if (yearMonth < exp.startYearMonth) return false
            if (exp.endYearMonth && yearMonth > exp.endYearMonth) return false
            return true
        }
        // ONCE: only show in start month
        return exp.startYearMonth === yearMonth
    })
}

export async function createFixedExpense(expense: Omit<PFFixedExpense, 'id' | 'createdAt'>): Promise<PFFixedExpense> {
    const newExp: PFFixedExpense = {
        ...expense,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    await db.pfFixedExpenses.put(newExp)
    return newExp
}

export async function updateFixedExpense(id: string, updates: Partial<PFFixedExpense>): Promise<void> {
    await db.pfFixedExpenses.update(id, updates)
}

export async function deleteFixedExpense(id: string): Promise<void> {
    await db.pfFixedExpenses.delete(id)
}

// =============================================================================
// INCOME OPERATIONS
// =============================================================================

export async function getAllIncomes(): Promise<PFIncome[]> {
    return db.pfIncomes.toArray()
}

export async function getIncomesByMonth(yearMonth: string): Promise<PFIncome[]> {
    return db.pfIncomes.where('yearMonth').equals(yearMonth).toArray()
}

export async function createIncome(income: Omit<PFIncome, 'id' | 'createdAt'>): Promise<PFIncome> {
    const newInc: PFIncome = {
        ...income,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    await db.pfIncomes.put(newInc)
    return newInc
}

export async function updateIncome(id: string, updates: Partial<PFIncome>): Promise<void> {
    await db.pfIncomes.update(id, updates)
}

export async function deleteIncome(id: string): Promise<void> {
    await db.pfIncomes.delete(id)
}

// =============================================================================
// BUDGET OPERATIONS
// =============================================================================

export async function getAllBudgets(): Promise<PFBudgetCategory[]> {
    return db.pfBudgets.toArray()
}

export async function getBudgetsByMonth(yearMonth: string): Promise<PFBudgetCategory[]> {
    return db.pfBudgets.where('yearMonth').equals(yearMonth).toArray()
}

export async function createBudget(budget: Omit<PFBudgetCategory, 'id' | 'createdAt'>): Promise<PFBudgetCategory> {
    const newBudget: PFBudgetCategory = {
        ...budget,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    await db.pfBudgets.put(newBudget)
    return newBudget
}

export async function updateBudget(id: string, updates: Partial<PFBudgetCategory>): Promise<void> {
    await db.pfBudgets.update(id, updates)
}

export async function deleteBudget(id: string): Promise<void> {
    await db.pfBudgets.delete(id)
}

export async function addBudgetSpending(id: string, amount: number): Promise<void> {
    const budget = await db.pfBudgets.get(id)
    if (budget) {
        await db.pfBudgets.update(id, { spentAmount: budget.spentAmount + amount })
    }
}
