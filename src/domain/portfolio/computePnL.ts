import type { Movement, Holding, FxRates, FxType } from '@/domain/types'

export interface RealizedPnLResult {
    totalNative: number
    totalARS: number
    totalUSD: number
    realizedArs: number
    realizedUsd: number
    byInstrument: Map<string, { ars: number, usd: number }>
    byAccount: Record<string, { ars: number, usd: number }>
}

/**
 * Compute realized PnL from SELL movements using weighted average cost.
 */
export function computeRealizedPnL(
    movements: Movement[],
    _fxRates: FxRates,
    _baseFx: FxType = 'MEP'
): RealizedPnLResult {
    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    // Track cost basis per instrument+account
    const costBasisMap = new Map<string, { quantity: number; costBasis: number }>()
    const pnlByInstrument = new Map<string, { ars: number, usd: number }>()
    const pnlByAccount = new Map<string, { ars: number, usd: number }>()

    let totalArs = 0
    let totalUsd = 0

    for (const mov of sorted) {
        if (!mov.instrumentId) continue

        const key = `${mov.instrumentId}::${mov.accountId}`
        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0

        if (!costBasisMap.has(key)) {
            costBasisMap.set(key, { quantity: 0, costBasis: 0 })
        }

        const position = costBasisMap.get(key)!

        // Movements that increase position (add to cost basis)
        if (
            mov.type === 'BUY' ||
            mov.type === 'BUY_USD' ||
            mov.type === 'TRANSFER_IN' ||
            mov.type === 'DEPOSIT' ||
            mov.type === 'INTEREST' || // Reinvested interest adds to cost basis
            mov.type === 'DIVIDEND' // Reinvested dividend adds to cost basis
        ) {
            position.quantity += qty
            position.costBasis += qty * price
        } else if (mov.type === 'SELL' || mov.type === 'SELL_USD' || mov.type === 'WITHDRAW') {
            // SELL logic
            if (position.quantity > 0) {
                const avgCost = position.costBasis / position.quantity
                const soldQty = Math.min(qty, position.quantity)
                const proceeds = soldQty * price
                const cost = soldQty * avgCost
                const pnl = proceeds - cost

                if (mov.type === 'SELL' || mov.type === 'SELL_USD') {
                    // Only count PnL for explicit SELLs.
                    // Assuming tradeCurrency dictates PnL currency.
                    const isArs = mov.tradeCurrency === 'ARS'

                    if (isArs) {
                        totalArs += pnl

                        const iPnl = pnlByInstrument.get(mov.instrumentId) || { ars: 0, usd: 0 }
                        iPnl.ars += pnl
                        pnlByInstrument.set(mov.instrumentId, iPnl)

                        const aPnl = pnlByAccount.get(mov.accountId) || { ars: 0, usd: 0 }
                        aPnl.ars += pnl
                        pnlByAccount.set(mov.accountId, aPnl)

                    } else {
                        totalUsd += pnl

                        const iPnl = pnlByInstrument.get(mov.instrumentId) || { ars: 0, usd: 0 }
                        iPnl.usd += pnl
                        pnlByInstrument.set(mov.instrumentId, iPnl)

                        const aPnl = pnlByAccount.get(mov.accountId) || { ars: 0, usd: 0 }
                        aPnl.usd += pnl
                        pnlByAccount.set(mov.accountId, aPnl)
                    }
                }

                position.quantity -= soldQty
                position.costBasis -= soldQty * avgCost
            }
        }

        if (position.quantity < 0.00000001) {
            position.quantity = 0
            position.costBasis = 0
        }
    }

    return {
        totalNative: 0, // Ignored
        totalARS: totalArs,
        totalUSD: totalUsd,
        realizedArs: totalArs,
        realizedUsd: totalUsd, // Raw USD PnL
        byInstrument: pnlByInstrument,
        byAccount: Object.fromEntries(pnlByAccount)
    }
}

/**
 * Compute unrealized PnL for current holdings.
 */
export function computeUnrealizedPnL(
    holdings: Holding[],
    currentPrices: Map<string, number>,
    fxRates: FxRates,
    baseFx: FxType = 'MEP'
): { totalNative: number; totalARS: number; totalUSD: number } {
    let totalNative = 0

    for (const holding of holdings) {
        const price = currentPrices.get(holding.instrumentId)
        if (price === undefined) continue

        const currentValue = holding.quantity * price
        const costBasis = holding.costBasisNative
        const unrealized = currentValue - costBasis

        totalNative += unrealized
    }

    const fxRate = getFxRate(fxRates, baseFx)

    return {
        totalNative,
        totalARS: totalNative * fxRate,
        totalUSD: totalNative,
    }
}

function getFxRate(fxRates: FxRates, type: FxType): number {
    switch (type) {
        case 'MEP':
            return fxRates.mep?.sell || fxRates.mep?.buy || 0
        case 'CCL':
            return fxRates.ccl?.sell || fxRates.ccl?.buy || 0
        case 'OFICIAL':
            return fxRates.oficial?.sell || fxRates.oficial?.buy || 0
        case 'CRIPTO':
            return fxRates.cripto?.sell || fxRates.cripto?.buy || 0
        default:
            return fxRates.mep?.sell || fxRates.mep?.buy || 0
    }
}
