// =============================================================================
// MOVEMENT BRIDGE — Create Movements from Personal Finances
// =============================================================================

import { movementsRepo } from '@/db/repositories/movements'
import type { Movement, MovementType, Currency } from '@/domain/types'

export interface CreateMovementParams {
    type: 'income' | 'expense'
    accountId: string
    date: string // ISO
    amount: number
    currency: Currency
    description: string
    tags?: string[]
    link?: {
        kind: 'debt' | 'expense' | 'income'
        id: string
        installmentId?: string
    }
}

export interface FinanceExecutionMovementParams {
    kind: 'income' | 'expense' | 'credit_card_statement' | 'loan_installment'
    accountId: string
    date: string
    amount: number
    currency: Currency
    title: string
    notes?: string
    link?: {
        kind: 'income' | 'expense' | 'card' | 'debt'
        id: string
        statementId?: string
    }
}

/**
 * Create a movement in the Movements system from Personal Finances
 */
export async function createMovementFromFinance(
    params: CreateMovementParams
): Promise<string> {
    const movementType: MovementType =
        params.type === 'income' ? 'DEPOSIT' : 'WITHDRAW'

    // Build notes with link info for traceability
    let notes = params.description
    if (params.link) {
        notes += ` [${params.link.kind}:${params.link.id}]`
    }

    const movement: Movement = {
        id: crypto.randomUUID(),
        datetimeISO: params.date,
        type: movementType,
        accountId: params.accountId,
        tradeCurrency: params.currency,
        totalAmount: params.amount,
        notes,
        source: 'system',
    }

    return movementsRepo.create(movement)
}

export async function createMovementFromFinanceExecution(
    params: FinanceExecutionMovementParams
): Promise<string> {
    const movementType: MovementType = params.kind === 'income' ? 'DEPOSIT' : 'WITHDRAW'

    let description = params.notes || ''
    if (!description) {
        if (params.kind === 'income') {
            description = buildIncomeDescription(params.title)
        } else if (params.kind === 'credit_card_statement') {
            description = buildCardPaymentDescription(params.title)
        } else if (params.kind === 'loan_installment') {
            description = `Pago cuota - ${params.title}`
        } else {
            description = buildExpensePaymentDescription(params.title)
        }
    }

    if (params.link) {
        description += ` [${params.link.kind}:${params.link.id}]`
    }

    const movement: Movement = {
        id: crypto.randomUUID(),
        datetimeISO: params.date,
        type: movementType,
        accountId: params.accountId,
        tradeCurrency: params.currency,
        totalAmount: params.amount,
        notes: description,
        source: 'system',
    }

    return movementsRepo.create(movement)
}

/**
 * Build description for a debt payment
 */
export function buildDebtPaymentDescription(
    title: string,
    installmentNumber: number,
    totalInstallments: number
): string {
    return `Pago cuota ${installmentNumber}/${totalInstallments} - ${title}`
}

/**
 * Build description for a fixed expense payment
 */
export function buildExpensePaymentDescription(title: string): string {
    return `Pago gasto fijo: ${title}`
}

/**
 * Build description for an income receipt
 */
export function buildIncomeDescription(title: string): string {
    return `Ingreso: ${title}`
}

export function buildCardPaymentDescription(title: string): string {
    return `Pago tarjeta: ${title}`
}
