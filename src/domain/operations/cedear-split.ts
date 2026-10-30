/**
 * CEDEAR ratio change (split): the broker multiplies your units and the price
 * per CEDEAR drops in the same proportion. Nothing is bought or paid, so the
 * movement adds the new units at zero cost. Average cost and FIFO lots keep the
 * total cost (and the dollar of the original purchase); only the cost per unit
 * changes.
 */

import type { Movement } from '@/domain/types'

export interface CedearSplitInput {
    accountId: string
    instrumentId: string
    symbol: string
    name: string
    /** Units held before the split */
    heldQty: number
    /** 3 for "3 new CEDEARs for each one" */
    ratio: number
    datetimeISO: string
    /** MEP of the day, informative only (the new units cost nothing) */
    fxRate?: number
    id?: string
}

export function buildCedearSplitMovement(input: CedearSplitInput): Movement {
    if (!(input.heldQty > 0)) throw new Error('No hay CEDEARs para dividir.')
    if (!(input.ratio > 1)) throw new Error('El ratio del split tiene que ser mayor a 1.')

    const added = input.heldQty * (input.ratio - 1)
    return {
        id: input.id ?? crypto.randomUUID(),
        datetimeISO: input.datetimeISO,
        type: 'BUY',
        assetClass: 'cedear',
        instrumentId: input.instrumentId,
        accountId: input.accountId,
        ticker: input.symbol,
        assetName: input.name,
        quantity: added,
        unitPrice: 0,
        tradeCurrency: 'ARS',
        totalAmount: 0,
        netAmount: 0,
        totalARS: 0,
        totalUSD: 0,
        ...(input.fxRate && input.fxRate > 0 ? { fxAtTrade: input.fxRate } : {}),
        notes: `Cambio de ratio ${input.symbol} ${input.ratio}:1 (split): ${input.heldQty} → ${input.heldQty * input.ratio}`,
        meta: {
            costPolicy: 'zero_cost',
            splitRatio: input.ratio,
        },
    }
}
