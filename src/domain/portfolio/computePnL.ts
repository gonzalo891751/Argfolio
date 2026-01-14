import type { Movement, Holding, FxRates, FxType } from '@/domain/types'

interface RealizedPnLResult {
    totalNative: number
    totalARS: number
    totalUSD: number
    byInstrument: Map<string, number>
}

/**
 * Compute realized PnL from SELL movements using weighted average cost.
 */
export function computeRealizedPnL(
    movements: Movement[],
    fxRates: FxRates,
    baseFx: FxType = 'MEP'
): RealizedPnLResult {
    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    // Track cost basis per instrument+account
    const costBasisMap = new Map<string, { quantity: number; costBasis: number }>()
    const pnlByInstrument = new Map<string, number>()
    let totalPnL = 0

    for (const mov of sorted) {
        if (!mov.instrumentId) continue

        const key = `${mov.instrumentId}::${mov.accountId}`
        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0

        if (!costBasisMap.has(key)) {
            costBasisMap.set(key, { quantity: 0, costBasis: 0 })
        }

        const position = costBasisMap.get(key)!

        if (mov.type === 'BUY' || mov.type === 'TRANSFER_IN') {
            position.quantity += qty
            position.costBasis += qty * price
        } else if (mov.type === 'SELL') {
            if (position.quantity > 0) {
                const avgCost = position.costBasis / position.quantity
                const soldQty = Math.min(qty, position.quantity)
                const proceeds = soldQty * price
                const cost = soldQty * avgCost
                const pnl = proceeds - cost

                totalPnL += pnl

                const currentPnl = pnlByInstrument.get(mov.instrumentId) ?? 0
                pnlByInstrument.set(mov.instrumentId, currentPnl + pnl)

                position.quantity -= soldQty
                position.costBasis -= soldQty * avgCost
            }
        }

        if (position.quantity < 0.00000001) {
            position.quantity = 0
            position.costBasis = 0
        }
    }

    // Convert to ARS/USD
    const fxRate = getFxRate(fxRates, baseFx)
    const totalARS = totalPnL * fxRate
    const totalUSD = totalPnL

    return {
        totalNative: totalPnL,
        totalARS,
        totalUSD,
        byInstrument: pnlByInstrument,
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
            return fxRates.mep
        case 'CCL':
            return fxRates.ccl
        case 'OFICIAL':
            return fxRates.oficial
        case 'CRIPTO':
            return fxRates.cripto
        default:
            return fxRates.mep
    }
}
