import type { Movement } from '@/domain/types'
import { newOperationId } from './operation'

export type CryptoAdjustmentReason = 'reward' | 'rounding' | 'fee' | 'manual_correction' | 'external_transfer' | 'unknown'
export type CryptoAdjustmentCostPolicy = 'zero_cost' | 'manual_cost' | 'preserve_average' | 'unknown'

export interface CryptoBalanceAdjustmentInput {
    accountId: string
    instrumentId: string
    symbol: string
    assetName?: string
    diffQty: number
    reason: CryptoAdjustmentReason
    costPolicy: CryptoAdjustmentCostPolicy
    unitCostUsd?: number
    datetimeISO?: string
    note?: string
    operationId?: string
    repairPlanId?: string
    requiresManualReview?: boolean
}

function operationKindForReason(reason: CryptoAdjustmentReason): 'balance_adjustment' | 'income' | 'fee' {
    if (reason === 'reward') return 'income'
    if (reason === 'fee') return 'fee'
    return 'balance_adjustment'
}

function movementTypeFor(reason: CryptoAdjustmentReason, isIncrease: boolean): Movement['type'] {
    if (reason === 'reward' && isIncrease) return 'INTEREST'
    return isIncrease ? 'DEPOSIT' : 'WITHDRAW'
}

export function isAdjustmentReasonCompatible(diffQty: number, reason: CryptoAdjustmentReason): boolean {
    if (reason === 'fee') return diffQty < 0
    if (reason === 'reward') return diffQty > 0
    return true
}

export function buildCryptoBalanceAdjustmentMovement(input: CryptoBalanceAdjustmentInput): Movement {
    if (!Number.isFinite(input.diffQty) || Math.abs(input.diffQty) <= 1e-12) {
        throw new Error('La diferencia del ajuste debe ser distinta de cero.')
    }
    if (!input.accountId || !input.instrumentId || !input.symbol.trim()) {
        throw new Error('Cuenta, instrumento y símbolo son obligatorios para ajustar un saldo.')
    }

    const needsUnitCost = input.costPolicy === 'manual_cost' || input.costPolicy === 'preserve_average'
    if (needsUnitCost && (!Number.isFinite(input.unitCostUsd) || (input.unitCostUsd ?? -1) < 0)) {
        throw new Error(`La política ${input.costPolicy} requiere un costo unitario USD válido.`)
    }

    const isIncrease = input.diffQty > 0
    if (!isAdjustmentReasonCompatible(input.diffQty, input.reason)) {
        throw new Error(input.reason === 'fee'
            ? 'Un fee debe disminuir el saldo.'
            : 'Un reward debe aumentar el saldo.')
    }
    const quantity = Math.abs(input.diffQty)
    const unitCostUsd = needsUnitCost ? (input.unitCostUsd ?? 0) : 0
    const operationId = input.operationId ?? newOperationId()
    const reasonLabel = input.reason === 'unknown' ? 'motivo pendiente de clasificar' : input.reason

    return {
        id: crypto.randomUUID(),
        datetimeISO: input.datetimeISO ?? new Date().toISOString(),
        type: movementTypeFor(input.reason, isIncrease),
        assetClass: 'crypto',
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        ticker: input.symbol.toUpperCase(),
        assetName: input.assetName ?? input.symbol.toUpperCase(),
        quantity,
        unitPrice: unitCostUsd,
        tradeCurrency: 'USD',
        totalAmount: quantity * unitCostUsd,
        totalUSD: quantity * unitCostUsd,
        source: 'system',
        groupId: operationId,
        notes: input.note ?? `Conciliación ${input.symbol.toUpperCase()}: ${isIncrease ? '+' : '-'}${quantity} (${reasonLabel})`,
        meta: {
            operationId,
            operationKind: operationKindForReason(input.reason),
            operationStatus: 'posted',
            legRole: input.reason === 'fee' ? 'fee' : 'asset',
            direction: isIncrease ? 'in' : 'out',
            adjustmentReason: input.reason,
            costPolicy: input.costPolicy,
            requiresManualReview: input.requiresManualReview ?? input.reason === 'unknown',
            repairPlanId: input.repairPlanId,
            repairNote: input.note,
        },
    }
}

/** Reclassify a proposed adjustment without changing its audit identity or amount. */
export function reclassifyCryptoBalanceAdjustment(
    movement: Movement,
    reason: CryptoAdjustmentReason,
): Movement {
    const isIncrease = movement.meta?.direction !== 'out'
    if (!isAdjustmentReasonCompatible(isIncrease ? 1 : -1, reason)) {
        throw new Error(reason === 'fee'
            ? 'Un fee debe disminuir el saldo.'
            : 'Un reward debe aumentar el saldo.')
    }
    const becomesZeroCostIncome = reason === 'reward'
    return {
        ...movement,
        type: movementTypeFor(reason, isIncrease),
        unitPrice: becomesZeroCostIncome ? 0 : movement.unitPrice,
        totalAmount: becomesZeroCostIncome ? 0 : movement.totalAmount,
        totalUSD: becomesZeroCostIncome ? 0 : movement.totalUSD,
        totalARS: becomesZeroCostIncome && movement.totalARS != null ? 0 : movement.totalARS,
        netAmount: becomesZeroCostIncome && movement.netAmount != null ? 0 : movement.netAmount,
        notes: movement.notes?.replace(/\([^)]*\)$/, `(${reason})`) ?? movement.notes,
        meta: {
            ...movement.meta,
            operationKind: operationKindForReason(reason),
            legRole: reason === 'fee' ? 'fee' : 'asset',
            adjustmentReason: reason,
            costPolicy: reason === 'reward' ? 'zero_cost' : movement.meta?.costPolicy,
            requiresManualReview: reason === 'unknown',
        },
    }
}
