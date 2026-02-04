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
            case 'DEBT_ADD':
            case 'DEPOSIT':
            case 'BUY_USD': { // USD Purchase
                const addedQty = qty
                if (addedQty <= 0) break

                // Calculate Trade Amounts
                let tradeAmtArs = 0
                let tradeAmtUsd = 0

                // USD Cash (BUY_USD or DEPOSIT USD)
                // If it's a USD Deposit, we assume it carries a Cost Basis in ARS (either Manual or Implied)
                if (mov.type === 'BUY_USD' || (mov.tradeCurrency === 'USD' && mov.type === 'DEPOSIT')) {
                    // Qty = USD Bought
                    // Cost ARS = totalAmount (ARS Paid)
                    // Cost USD = totalUSD (USD Value, usually equal to Qty)
                    tradeAmtArs = mov.totalAmount || 0
                    tradeAmtUsd = mov.totalUSD || addedQty
                } else if (tradeCcy === 'ARS') {
                    // Bought/Deposited with ARS
                    // For Cash ARS, Quantity IS the Amount. price usually 1.
                    // Prefer totalAmount if available, else calc
                    tradeAmtArs = mov.totalAmount || (addedQty * price)
                    if (tradeAmtArs === 0 && addedQty > 0) tradeAmtArs = addedQty // Fallback for Cash ARS if price missing
                    tradeAmtUsd = tradeAmtArs / fxRate
                } else {
                    // Other Foreign Currency Bought with USD? Or generic
                    tradeAmtUsd = (mov.totalUSD || (addedQty * price))
                    tradeAmtArs = tradeAmtUsd * fxRate
                }

                quantity += addedQty
                costBasisArs += tradeAmtArs
                costBasisUsd += tradeAmtUsd
                break
            }

            case 'DIVIDEND':
            case 'INTEREST':
                if (qty > 0) quantity += qty
                // Zero cost basis addition implies pure profit (PnL increases)
                break

            case 'SELL':
            case 'TRANSFER_OUT':
            case 'DEBT_PAY':
            case 'WITHDRAW':
            case 'SELL_USD': { // USD Sale
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
