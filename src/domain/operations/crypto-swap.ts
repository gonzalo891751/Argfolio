/**
 * Crypto swap / conversion (Fase 5).
 *
 * A swap converts one or more source assets into a destination asset within
 * the same account (e.g. BTC + USDT → NEXO en Nexo):
 *
 *  - Each source leg is a SELL at its execution price → the existing PnL
 *    engine realizes gain/loss on non-stable sources (stables at $1 → ~0).
 *  - The destination leg is a BUY whose total cost equals the sum of the
 *    source leg values → the destination is born with a verifiable cost
 *    basis, even if it has no market price yet (e.g. NEXO sin cotización).
 *  - All legs share one operationId (operationKind 'swap') so Movimientos
 *    shows a single grouped operation.
 *  - Cash-neutral by construction: SELL credits and BUY debits the same
 *    total, mirroring the existing SELL+BUY auto-credit pattern.
 *
 * Fees: an explicit in-kind fee should be expressed as part of the amounts
 * (you receive slightly less destination qty) or as an extra source leg
 * (e.g. BNB). The implied fee is visible as the difference between market
 * value delivered and received.
 */

import type { Movement } from '@/domain/types'
import { newOperationId } from './operation'

export interface SwapSourceLeg {
    instrumentId: string
    symbol: string
    assetName?: string
    /** Quantity of this source asset delivered */
    qty: number
    /** Execution price per unit (USD). For stables this is ~1. */
    priceUsd: number
    /** Quantity available (for oversell validation) */
    availableQty?: number
}

export interface SwapDestination {
    instrumentId: string
    symbol: string
    assetName?: string
    /** Quantity of the destination asset received */
    qty: number
}

export interface CryptoSwapInput {
    accountId: string
    sources: SwapSourceLeg[]
    destination: SwapDestination
    /** Event datetime (ISO). Defaults to now. */
    datetimeISO?: string
    notes?: string
    txHash?: string
    /** Current crypto FX rate (ARS per USD) for historical valuation */
    fxRate?: number
    /** Allow overdraft on source balances (explicit user override) */
    allowOverdraft?: boolean
}

export interface CryptoSwapResult {
    operationId: string
    /** SELL legs (one per source) */
    sourceMovements: Movement[]
    /** BUY leg for the destination */
    destinationMovement: Movement
    /** Total USD value delivered (= destination cost basis) */
    totalValueUsd: number
    /** Destination unit cost (totalValueUsd / destination qty) */
    destinationUnitCostUsd: number
}

export class CryptoSwapError extends Error {
    constructor(message: string, public code:
        | 'NO_SOURCES'
        | 'INVALID_QTY'
        | 'INVALID_PRICE'
        | 'INSUFFICIENT_BALANCE'
        | 'SAME_INSTRUMENT'
    ) {
        super(message)
        this.name = 'CryptoSwapError'
    }
}

const QTY_EPSILON = 1e-9

/**
 * Build the movement legs for a crypto swap. Pure function: the caller
 * persists all returned movements atomically.
 */
export function buildCryptoSwapMovements(input: CryptoSwapInput): CryptoSwapResult {
    const { accountId, sources, destination, notes, txHash, fxRate, allowOverdraft = false } = input
    const datetimeISO = input.datetimeISO ?? new Date().toISOString()

    // ---- Validation ------------------------------------------------------
    if (!sources || sources.length === 0) {
        throw new CryptoSwapError('Un swap necesita al menos una pata de origen.', 'NO_SOURCES')
    }
    if (!Number.isFinite(destination.qty) || destination.qty <= 0) {
        throw new CryptoSwapError('La cantidad recibida debe ser mayor a cero.', 'INVALID_QTY')
    }

    for (const src of sources) {
        if (!Number.isFinite(src.qty) || src.qty <= 0) {
            throw new CryptoSwapError(`Cantidad inválida para ${src.symbol}.`, 'INVALID_QTY')
        }
        if (!Number.isFinite(src.priceUsd) || src.priceUsd <= 0) {
            throw new CryptoSwapError(`Precio inválido para ${src.symbol}.`, 'INVALID_PRICE')
        }
        if (!allowOverdraft && src.availableQty != null && src.qty > src.availableQty + QTY_EPSILON) {
            throw new CryptoSwapError(
                `Saldo insuficiente de ${src.symbol}: disponible ${src.availableQty}, se intentó convertir ${src.qty}.`,
                'INSUFFICIENT_BALANCE'
            )
        }
        if (src.instrumentId === destination.instrumentId) {
            throw new CryptoSwapError('El activo origen y destino no pueden ser el mismo.', 'SAME_INSTRUMENT')
        }
    }

    const operationId = newOperationId()
    const totalValueUsd = sources.reduce((s, src) => s + src.qty * src.priceUsd, 0)
    const destinationUnitCostUsd = totalValueUsd / destination.qty

    const sharedMeta = {
        operationId,
        operationKind: 'swap' as const,
        operationStatus: 'posted' as const,
        txHash,
    }

    const sourceMovements: Movement[] = sources.map(src => ({
        id: crypto.randomUUID(),
        datetimeISO,
        type: 'SELL' as const,
        assetClass: 'crypto' as const,
        accountId,
        instrumentId: src.instrumentId,
        ticker: src.symbol,
        assetName: src.assetName ?? src.symbol,
        quantity: src.qty,
        unitPrice: src.priceUsd,
        tradeCurrency: 'USD' as const,
        totalAmount: src.qty * src.priceUsd,
        totalUSD: src.qty * src.priceUsd,
        fxAtTrade: fxRate,
        source: 'user' as const,
        groupId: operationId,
        notes: notes ?? `Swap ${src.symbol} → ${destination.symbol}`,
        meta: {
            ...sharedMeta,
            legRole: 'source' as const,
        },
    }))

    const destinationMovement: Movement = {
        id: crypto.randomUUID(),
        datetimeISO,
        type: 'BUY',
        assetClass: 'crypto',
        accountId,
        instrumentId: destination.instrumentId,
        ticker: destination.symbol,
        assetName: destination.assetName ?? destination.symbol,
        quantity: destination.qty,
        unitPrice: destinationUnitCostUsd,
        tradeCurrency: 'USD',
        totalAmount: totalValueUsd,
        totalUSD: totalValueUsd,
        fxAtTrade: fxRate,
        source: 'user',
        groupId: operationId,
        notes: notes ?? `Swap ${sources.map(s => s.symbol).join(' + ')} → ${destination.symbol}`,
        meta: {
            ...sharedMeta,
            legRole: 'destination',
        },
    }

    return {
        operationId,
        sourceMovements,
        destinationMovement,
        totalValueUsd,
        destinationUnitCostUsd,
    }
}
