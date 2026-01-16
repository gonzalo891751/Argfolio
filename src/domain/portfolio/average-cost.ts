/**
 * Weighted Average Cost Engine
 * Implements Average Cost logic for asset cost basis.
 * Replaces FIFO for simpler, more deterministic position tracking.
 */

import type { Movement } from '@/domain/types'

export interface AverageCostResult {
    quantity: number
    costBasisNative: number
    costBasisArs: number
    costBasisUsd: number

    // Averages
    avgCostNative: number
    avgCostArs: number
    avgCostUsd: number
}

/**
 * Compute position using Weighted Average Cost
 */
export function computeAverageCost(
    movements: Movement[]
): AverageCostResult {
    // 1. Sort by date ascending to build history
    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    let quantity = 0
    let costBasisArs = 0    // Always ARS
    let costBasisUsd = 0    // Always USD

    for (const mov of sorted) {
        if (!mov.instrumentId) continue

        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0

        // Resolve FX Rate
        // customized logic: If we have 'fx' object, use it.
        // If not, fall back to fxAtTrade.
        let fxRate = 1

        if (mov.fx && mov.fx.rate > 0) {
            fxRate = mov.fx.rate
        } else if (mov.fxAtTrade && mov.fxAtTrade > 0) {
            fxRate = mov.fxAtTrade
        }

        const tradeCcy = mov.tradeCurrency

        switch (mov.type) {
            case 'BUY':
            case 'TRANSFER_IN':
            case 'DIVIDEND':
            case 'INTEREST':
            case 'DEBT_ADD':
                const addedQty = qty
                if (addedQty <= 0) break

                // Calculate Trade Amounts
                let tradeAmtArs = 0
                let tradeAmtUsd = 0

                if (tradeCcy === 'ARS') {
                    // Bought with ARS
                    tradeAmtArs = addedQty * price
                    tradeAmtUsd = tradeAmtArs / fxRate // Implies fxRate is ARS/USD
                    // Native depends on asset.
                    // This function doesn't know asset metadata (CEDEAR vs CRYPTO).
                    // We need to infer or it must be passed?
                    // Standard assumption:
                    // If tradeCcy == ARS, cost is ARS.
                    // If tradeCcy == USD, cost is USD.
                    // But we track basis in NATIVE.
                    // If I buy AAPL (native USD?) with ARS.
                    // Actually CEDEAR native is ARS in this system.
                    // CRYPTO native is USD.

                    // We will rely on accumulated columns:
                    // costBasisNative will accumulate in TRADE CURRENCY? No.
                    // We have to assume 'costBasisNative' aligns with the major currency of the asset.
                    // Issue: We don't have 'Asset' passed here to know if it's CEDEAR or CRYPTO.
                    // BUT: 'costBasisNative' usually means "The currency the price is quoted in".

                    // HEURISTIC:
                    // If most moves are USD, it's USD native.
                    // If most moves are ARS, it's ARS native.
                    // Or we just track what we can.
                    // IMPROVEMENT: passing nativeCurrency or inferred from moves.

                    // Let's look at `fifo.ts`: it derived unitCostNative from price.
                    // It had the same ambiguity.
                    // "If tradeCurrency != nativeCurrency ... unitCostNative = priceArs / fx"

                    // For now, to be safe without changing signature excessively:
                    // We will track costBasis as 'Sum of amounts in trade ccy converted to X'.
                    // But we really need to know the target Native Ccy.

                    // Let's assume:
                    // If trade is in ARS, and we want USD basis => convert.
                    // If trade is in USD, and we want ARS basis => convert.
                    // But `costBasisNative` is ambiguous without context.
                    // FORCE FIX: We will discard `costBasisNative` ambiguity and rely on `costBasisUsd` and `costBasisArs` as absolute truths.
                    // The caller (`computeHoldings.ts`) has the `instrument`. It can decide which one is "Native".

                } else {
                    // Bought with USD
                    tradeAmtUsd = addedQty * price
                    tradeAmtArs = tradeAmtUsd * fxRate
                }

                // Logic: costBasisNative is tricky if we mix ARS/USD trades for same asset.
                // We will defer "Native" selection to the end or caller?
                // No, existing `Holding` expects `costBasisNative`.
                // In Fifo it says: "If native is USD/Crypto, unitCostNative = unitCostUsd".
                // Since `average-cost` is generic, we might produce mixed bags if we don't know native.
                // However, usually we trade in one main currency.

                // Refined Logic:
                // We just accumulate totals.
                // If the asset is predominantly USD (Crypto), `costBasisUsd` is the key one.
                // If the asset is predominantly ARS (Cedear), `costBasisArs` is the key one.

                quantity += addedQty
                costBasisArs += tradeAmtArs
                costBasisUsd += tradeAmtUsd
                break

            case 'SELL':
            case 'TRANSFER_OUT':
            case 'DEBT_PAY':
                const removedQty = qty
                if (removedQty <= 0) break
                if (quantity === 0) break

                // Reduce basis proportionally (Average Cost)
                const ratio = removedQty / quantity

                // Capped at 1 (100%)
                const safeRatio = Math.min(ratio, 1)

                costBasisArs -= costBasisArs * safeRatio
                costBasisUsd -= costBasisUsd * safeRatio
                quantity -= removedQty

                // Floating point cleanup
                if (quantity < 0.00000001) {
                    quantity = 0
                    costBasisArs = 0
                    costBasisUsd = 0
                }
                break
        }
    }

    // Determine Averages
    const avgCostArs = quantity > 0 ? costBasisArs / quantity : 0
    const avgCostUsd = quantity > 0 ? costBasisUsd / quantity : 0

    // For return value, what is 'costBasisNative'?
    // We'll leave it 0 here and let the caller assign it from Usd or Ars depending on Instrument check.
    // Or we returns the two tracks and the caller decides.

    return {
        quantity,
        costBasisNative: 0, // Caller must decide
        costBasisArs,
        costBasisUsd,
        avgCostNative: 0, // Caller must decide
        avgCostArs,
        avgCostUsd
    }
}
