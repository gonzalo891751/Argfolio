/**
 * Crypto transfer between own accounts (Fase 4).
 *
 * A transfer is a change of custody, NOT a sale:
 *  - no realized PnL;
 *  - the consolidated cost basis of the asset must not change;
 *  - the destination inherits the source's average cost (PPP carry-over MVP).
 *
 * Cost model (PPP):
 *  - TRANSFER_OUT reduces the source basis proportionally (computeAverageCost
 *    already does this for TRANSFER_OUT).
 *  - TRANSFER_IN enters the destination with
 *      totalUSD = sentQty × avgCostUsd  (the full cost leaves the source)
 *      unitPrice = totalUSD / receivedQty
 *    so an in-kind network fee is CAPITALIZED into the destination's average
 *    cost and the consolidated basis stays constant.
 *  - An optional FEE movement documents the in-kind fee for auditing. FEE is
 *    ignored by the holdings/PnL engines, so it never double-counts.
 */

import type { Movement } from '@/domain/types'
import { newOperationId } from './operation'

export interface CryptoTransferInput {
    /** Instrument being moved */
    instrumentId: string
    symbol: string
    assetName?: string
    /** Source account (must differ from destination) */
    fromAccountId: string
    /** Destination account */
    toAccountId: string
    /** Quantity leaving the source */
    sentQty: number
    /** Quantity arriving at destination (defaults to sentQty) */
    receivedQty?: number
    /** Average unit cost (USD) of the source position at transfer time */
    avgCostUsd: number
    /** Quantity available in the source account (for oversell validation) */
    availableQty?: number
    /** Allow sending more than availableQty (explicit user override) */
    allowOverdraft?: boolean
    /** Event datetime (ISO). Defaults to now. */
    datetimeISO?: string
    notes?: string
    txHash?: string
    /** Current crypto FX rate (ARS per USD) for historical valuation */
    fxRate?: number
}

export interface CryptoTransferResult {
    operationId: string
    out: Movement
    in: Movement
    /** Present only when receivedQty < sentQty (in-kind network fee) */
    fee?: Movement
    /** USD cost basis carried from source to destination */
    costBasisTransferredUsd: number
    feeQty: number
}

export class CryptoTransferError extends Error {
    constructor(message: string, public code:
        | 'SAME_ACCOUNT'
        | 'INVALID_QTY'
        | 'RECEIVED_EXCEEDS_SENT'
        | 'INSUFFICIENT_BALANCE'
    ) {
        super(message)
        this.name = 'CryptoTransferError'
    }
}

const QTY_EPSILON = 1e-9

/**
 * Build the movement legs for a crypto transfer. Pure function: the caller
 * persists the returned movements atomically (single Dexie transaction).
 */
export function buildCryptoTransferMovements(input: CryptoTransferInput): CryptoTransferResult {
    const {
        instrumentId,
        symbol,
        assetName,
        fromAccountId,
        toAccountId,
        sentQty,
        avgCostUsd,
        availableQty,
        allowOverdraft = false,
        notes,
        txHash,
        fxRate,
    } = input

    const receivedQty = input.receivedQty ?? sentQty
    const datetimeISO = input.datetimeISO ?? new Date().toISOString()

    // ---- Validation ------------------------------------------------------
    if (fromAccountId === toAccountId) {
        throw new CryptoTransferError('La cuenta origen y destino no pueden ser iguales.', 'SAME_ACCOUNT')
    }
    if (!Number.isFinite(sentQty) || sentQty <= 0) {
        throw new CryptoTransferError('La cantidad enviada debe ser mayor a cero.', 'INVALID_QTY')
    }
    if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
        throw new CryptoTransferError('La cantidad recibida debe ser mayor a cero.', 'INVALID_QTY')
    }
    if (receivedQty > sentQty + QTY_EPSILON) {
        throw new CryptoTransferError('La cantidad recibida no puede superar la enviada.', 'RECEIVED_EXCEEDS_SENT')
    }
    if (!allowOverdraft && availableQty != null && sentQty > availableQty + QTY_EPSILON) {
        throw new CryptoTransferError(
            `Saldo insuficiente: disponible ${availableQty} ${symbol}, se intentó transferir ${sentQty}.`,
            'INSUFFICIENT_BALANCE'
        )
    }

    const feeQty = Math.max(0, sentQty - receivedQty)
    const safeAvgCost = Number.isFinite(avgCostUsd) && avgCostUsd > 0 ? avgCostUsd : 0

    // Cost leaving the source (PPP proportional reduction)
    const costBasisTransferredUsd = sentQty * safeAvgCost
    // Destination absorbs the full transferred cost over the received qty
    // (in-kind fee capitalized → consolidated basis unchanged)
    const destUnitCostUsd = receivedQty > 0 ? costBasisTransferredUsd / receivedQty : 0

    const operationId = newOperationId()

    const sharedMeta = {
        operationId,
        operationKind: 'transfer' as const,
        operationStatus: 'posted' as const,
        transferGroupId: operationId, // legacy grouping compatibility
        txHash,
        costBasisTransferredUsd,
        feeQty: feeQty > QTY_EPSILON ? feeQty : undefined,
    }

    const out: Movement = {
        id: crypto.randomUUID(),
        datetimeISO,
        type: 'TRANSFER_OUT',
        assetClass: 'crypto',
        accountId: fromAccountId,
        instrumentId,
        ticker: symbol,
        assetName: assetName ?? symbol,
        quantity: sentQty,
        unitPrice: safeAvgCost,
        tradeCurrency: 'USD',
        totalAmount: costBasisTransferredUsd,
        totalUSD: costBasisTransferredUsd,
        fxAtTrade: fxRate,
        toAccountId,
        source: 'user',
        groupId: operationId,
        notes,
        meta: {
            ...sharedMeta,
            legRole: 'source',
            counterpartyAccountId: toAccountId,
            direction: 'out',
        },
    }

    const inMov: Movement = {
        id: crypto.randomUUID(),
        datetimeISO,
        type: 'TRANSFER_IN',
        assetClass: 'crypto',
        accountId: toAccountId,
        instrumentId,
        ticker: symbol,
        assetName: assetName ?? symbol,
        quantity: receivedQty,
        unitPrice: destUnitCostUsd,
        tradeCurrency: 'USD',
        totalAmount: costBasisTransferredUsd,
        totalUSD: costBasisTransferredUsd,
        fxAtTrade: fxRate,
        source: 'user',
        groupId: operationId,
        notes,
        meta: {
            ...sharedMeta,
            legRole: 'destination',
            counterpartyAccountId: fromAccountId,
            direction: 'in',
        },
    }

    let fee: Movement | undefined
    if (feeQty > QTY_EPSILON) {
        // Audit-only leg: FEE type is ignored by holdings/PnL engines.
        fee = {
            id: crypto.randomUUID(),
            datetimeISO,
            type: 'FEE',
            assetClass: 'crypto',
            accountId: fromAccountId,
            instrumentId,
            ticker: symbol,
            assetName: assetName ?? symbol,
            quantity: feeQty,
            unitPrice: safeAvgCost,
            tradeCurrency: 'USD',
            totalAmount: feeQty * safeAvgCost,
            totalUSD: feeQty * safeAvgCost,
            fxAtTrade: fxRate,
            source: 'system',
            groupId: operationId,
            notes: `Fee de red por transferencia ${symbol} (${feeQty} ${symbol})`,
            meta: {
                ...sharedMeta,
                legRole: 'fee',
                direction: 'out',
            },
        }
    }

    return {
        operationId,
        out,
        in: inMov,
        fee,
        costBasisTransferredUsd,
        feeQty,
    }
}
