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
