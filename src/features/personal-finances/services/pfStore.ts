// =============================================================================
// Personal Finances V3 Store — Dexie Persistence
// =============================================================================

import { db, type PFCreditCard, type PFCardConsumption, type PFDebt, type PFFixedExpense, type PFIncome, type PFBudgetCategory } from '@/db/schema'
import { calculatePostedYearMonth, addMonthsToYearMonth, getCurrentYearMonth } from '../utils/dateHelpers'

// Legacy localStorage keys
const STORAGE_KEY_V2 = 'argfolio.personalFinances.v2'
const STORAGE_KEY_V3_MIGRATED = 'argfolio.personalFinances.v3.migrated'

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
                        const newCons: PFCardConsumption = {
                            id: cons.id || crypto.randomUUID(),
                            cardId: newCard.id,
                            description: cons.concept || cons.description || 'Consumo',
                            amount: cons.amount || 0,
                            currency: 'ARS',
                            purchaseDateISO: purchaseDate,
                            postedYearMonth: calculatePostedYearMonth(purchaseDate, newCard.closingDay, newCard.dueDay),
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
                const newDebt: PFDebt = {
                    id: debt.id || crypto.randomUUID(),
                    title: debt.title || 'Deuda',
                    counterparty: debt.counterparty || 'Desconocido',
                    totalAmount: debt.totalAmount || 0,
                    remainingAmount: debt.remainingAmount || debt.totalAmount || 0,
                    installmentsCount: debt.installmentsCount || 1,
                    currentInstallment: debt.currentInstallment || 1,
                    monthlyValue: debt.monthlyValue || 0,
                    dueDateDay: debt.dueDateDay || 1,
                    status: debt.status || 'active',
                    startYearMonth: currentYM,
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
    category?: string
    installmentTotal?: number
    createAllInstallments?: boolean
}

export async function createConsumption(
    input: CreateConsumptionInput,
    card: PFCreditCard
): Promise<PFCardConsumption[]> {
    const { cardId, description, amount, purchaseDateISO, category, installmentTotal, createAllInstallments } = input

    const basePostedYM = calculatePostedYearMonth(purchaseDateISO, card.closingDay, card.dueDay)
    const created: PFCardConsumption[] = []

    const installments = installmentTotal && installmentTotal > 1 ? installmentTotal : 1
    const amountPerInstallment = amount / installments

    for (let i = 0; i < installments; i++) {
        // Only create first or all if requested
        if (i > 0 && !createAllInstallments) break

        const postedYM = i === 0 ? basePostedYM : addMonthsToYearMonth(basePostedYM, i)

        const cons: PFCardConsumption = {
            id: crypto.randomUUID(),
            cardId,
            description,
            amount: amountPerInstallment,
            currency: 'ARS',
            purchaseDateISO,
            postedYearMonth: postedYM,
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
        const startYM = debt.startYearMonth
        const endYM = addMonthsToYearMonth(startYM, debt.installmentsCount - 1)
        return yearMonth >= startYM && yearMonth <= endYM
    })
}

export async function createDebt(debt: Omit<PFDebt, 'id' | 'createdAt'>): Promise<PFDebt> {
    const newDebt: PFDebt = {
        ...debt,
        id: crypto.randomUUID(),
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
