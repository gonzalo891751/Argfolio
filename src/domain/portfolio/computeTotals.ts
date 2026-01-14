import type {
    Holding,
    HoldingAggregated,
    CategorySummary,
    PortfolioTotals,
    FxRates,
    FxType,
    AssetCategory,
    Currency,
} from '@/domain/types'

const categoryLabels: Record<AssetCategory, string> = {
    CEDEAR: 'Cedears',
    CRYPTO: 'Criptomonedas',
    STABLE: 'Stablecoins',
    USD_CASH: 'Dólares',
    ARS_CASH: 'Pesos',
    FCI: 'Fondos Comunes',
    PF: 'Plazos Fijos',
    WALLET: 'Wallets',
    DEBT: 'Deudas',
}

interface ComputeTotalsInput {
    holdings: Holding[]
    currentPrices: Map<string, number>
    fxRates: FxRates
    baseFx: FxType
    stableFx: FxType
    cashBalances: Map<string, Map<string, number>>
    realizedPnL: number
}

/**
 * Compute portfolio totals including ARS/USD values, liquidity, and category breakdown.
 */
export function computeTotals(input: ComputeTotalsInput): PortfolioTotals {
    const { holdings, currentPrices, fxRates, baseFx, stableFx, cashBalances, realizedPnL } = input

    // Aggregate holdings by instrument
    const aggregatedMap = new Map<string, HoldingAggregated>()

    for (const h of holdings) {
        const existing = aggregatedMap.get(h.instrumentId)
        const price = currentPrices.get(h.instrumentId)

        if (existing) {
            existing.totalQuantity += h.quantity
            existing.totalCostBasis += h.costBasisNative
            existing.byAccount.push(h)
        } else {
            aggregatedMap.set(h.instrumentId, {
                instrumentId: h.instrumentId,
                instrument: h.instrument,
                totalQuantity: h.quantity,
                totalCostBasis: h.costBasisNative,
                avgCost: h.avgCostNative,
                currentPrice: price,
                byAccount: [h],
            })
        }
    }

    // Calculate values for each aggregated holding
    let totalARS = 0
    let totalUSD = 0
    let unrealizedPnL = 0

    for (const [, agg] of aggregatedMap) {
        agg.avgCost = agg.totalCostBasis / agg.totalQuantity

        if (agg.currentPrice !== undefined) {
            agg.currentValue = agg.totalQuantity * agg.currentPrice
            agg.unrealizedPnL = agg.currentValue - agg.totalCostBasis
            agg.unrealizedPnLPercent =
                agg.totalCostBasis > 0 ? (agg.unrealizedPnL / agg.totalCostBasis) * 100 : 0

            // Convert to ARS/USD based on instrument currency
            const fxRate = getConversionRate(agg.instrument.nativeCurrency, fxRates, baseFx, stableFx)

            agg.valueARS = agg.currentValue * fxRate
            agg.valueUSD = agg.currentValue / (agg.instrument.nativeCurrency === 'ARS' ? fxRate : 1)

            totalARS += agg.valueARS
            totalUSD += agg.valueUSD
            unrealizedPnL += agg.unrealizedPnL
        }
    }

    // Add cash balances to totals
    let liquidityARS = 0
    let liquidityUSD = 0

    for (const [, currencyBalances] of cashBalances) {
        for (const [currency, balance] of currencyBalances) {
            if (balance <= 0) continue

            const fxRate = getConversionRate(currency as Currency, fxRates, baseFx, stableFx)

            if (currency === 'ARS') {
                liquidityARS += balance
                liquidityUSD += balance / fxRate
            } else {
                liquidityARS += balance * fxRate
                liquidityUSD += balance
            }
        }
    }

    totalARS += liquidityARS
    totalUSD += liquidityUSD

    // Group by category
    const categoryMap = new Map<AssetCategory, HoldingAggregated[]>()

    for (const [, agg] of aggregatedMap) {
        const cat = agg.instrument.category
        if (!categoryMap.has(cat)) {
            categoryMap.set(cat, [])
        }
        categoryMap.get(cat)!.push(agg)
    }

    const categories: CategorySummary[] = []

    for (const [category, items] of categoryMap) {
        const catTotalARS = items.reduce((sum, i) => sum + (i.valueARS ?? 0), 0)
        const catTotalUSD = items.reduce((sum, i) => sum + (i.valueUSD ?? 0), 0)

        categories.push({
            category,
            label: categoryLabels[category] ?? category,
            totalARS: catTotalARS,
            totalUSD: catTotalUSD,
            items,
        })
    }

    // Add cash categories if there's liquidity
    if (liquidityARS > 0 || liquidityUSD > 0) {
        // We could break this down by ARS vs USD, but for simplicity, skip for now
    }

    // Top positions (sorted by value)
    const allAggregated = Array.from(aggregatedMap.values())
    const topPositions = allAggregated
        .filter((a) => a.valueARS !== undefined && a.valueARS > 0)
        .sort((a, b) => (b.valueARS ?? 0) - (a.valueARS ?? 0))
        .slice(0, 5)

    return {
        totalARS,
        totalUSD,
        liquidityARS,
        liquidityUSD,
        realizedPnL,
        unrealizedPnL,
        categories,
        topPositions,
    }
}

function getConversionRate(
    currency: Currency,
    fxRates: FxRates,
    baseFx: FxType,
    stableFx: FxType
): number {
    switch (currency) {
        case 'ARS':
            return 1
        case 'USD':
            return getFxRate(fxRates, baseFx)
        case 'USDT':
        case 'USDC':
            return getFxRate(fxRates, stableFx)
        case 'BTC':
        case 'ETH':
            // Crypto priced in USD
            return getFxRate(fxRates, baseFx)
        default:
            return getFxRate(fxRates, baseFx)
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
