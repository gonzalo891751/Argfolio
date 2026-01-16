/**
 * FIFO Inventory Engine
 * Implements "First-In, First-Out" logic for asset cost basis.
 */

import type { Movement } from '@/domain/types'

export interface FifoLot {
    date: string
    quantity: number // Remaining quantity
    originalQty: number

    // Cost Basis (Unit)
    unitCostNative: number
    unitCostArs: number
    unitCostUsd: number

    // FX info
    fxAtTrade: number
    fxType: string // 'mep' | 'cripto' | etc
}

export interface FifoResult {
    lots: FifoLot[]
    totalQuantity: number
    totalCostNative: number
    totalCostArs: number
    totalCostUsd: number // = sum(lot.qty * lot.unitCostUsd)
}

/**
 * Build FIFO inventory from movements.
 * 
 * Strategy:
 * - ADD (Buy, TransferIn, etc): Create new lot.
 * - REMOVE (Sell, TransferOut): Consume from oldest lot.
 */
export function buildFifoLots(
    movements: Movement[]
): FifoResult {
    // 1. Sort by date ascending
    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    const lots: FifoLot[] = []

    for (const mov of sorted) {
        if (!mov.instrumentId) continue

        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0

        // FX Handling
        // If movement has stored FX, use it. Otherwise try to infer or default to 1.
        // For accurate historical cost in USD, we rely on fxAtTrade being populated during ingestion.
        // If not, we might be missing data.
        const fxRate = mov.fxAtTrade ?? 1

        switch (mov.type) {
            case 'BUY':
            case 'TRANSFER_IN':
            case 'DIVIDEND':
            case 'INTEREST':
            case 'DEBT_ADD': // Assuming gaining asset via debt? Rarely used for assets.
                // Create Lot
                // Calculate unit costs
                let unitCostArs = 0
                let unitCostUsd = 0

                if (mov.tradeCurrency === 'ARS') {
                    unitCostArs = price
                    unitCostUsd = fxRate > 0 ? price / fxRate : 0
                } else {
                    // USD or Crypto
                    unitCostUsd = price
                    unitCostArs = price * fxRate
                }

                // If native is USD/Crypto, unitCostNative = unitCostUsd (mostly)
                // If native is ARS (CEDEAR), unitCostNative = unitCostArs
                // However, `movement.unitPrice` is usually in trade currency.
                // We need `unitCostNative`.
                // If tradeCurrency != nativeCurrency (e.g. buying Apple (USD native) with ARS),
                // then price is in ARS. unitCostNative (USD) = priceArs / fx.
                // If buying CEDEAR (ARS native) with ARS, unitCostNative = price.

                // Simplified assumption: 
                // We store unitCostArs and unitCostUsd explicitely.

                lots.push({
                    date: mov.datetimeISO,
                    quantity: qty,
                    originalQty: qty,
                    unitCostNative: price,
                    unitCostArs,
                    unitCostUsd,
                    fxAtTrade: fxRate,
                    fxType: 'implied'
                })
                break

            case 'SELL':
            case 'TRANSFER_OUT':
            case 'DEBT_PAY':
                // Consume Lots (FIFO)
                let qtyToRemove = qty

                // Iterate mutable lots array
                // We must remove from index 0
                while (qtyToRemove > 0 && lots.length > 0) {
                    const head = lots[0]

                    if (head.quantity > qtyToRemove) {
                        // Partial consumption
                        head.quantity -= qtyToRemove
                        qtyToRemove = 0
                    } else {
                        // Full consumption of this lot
                        qtyToRemove -= head.quantity
                        lots.shift() // Remove lot
                    }
                }
                break
        }
    }

    // Compute Totals
    let totalQuantity = 0
    let totalCostNative = 0
    let totalCostArs = 0
    let totalCostUsd = 0

    for (const lot of lots) {
        totalQuantity += lot.quantity
        totalCostNative += lot.quantity * lot.unitCostNative
        totalCostArs += lot.quantity * lot.unitCostArs
        totalCostUsd += lot.quantity * lot.unitCostUsd
    }

    return {
        lots,
        totalQuantity,
        totalCostNative,
        totalCostArs,
        totalCostUsd
    }
}
