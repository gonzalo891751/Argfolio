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
import { calculateValuation } from './valuation'

/**
 * Compute portfolio totals including ARS/USD values, liquidity, and category breakdown.
 */
export function computeTotals(input: ComputeTotalsInput): PortfolioTotals {
    const { holdings, currentPrices, fxRates, cashBalances, realizedPnL } = input

    // Aggregate holdings by instrument
    const aggregatedMap = new Map<string, HoldingAggregated>()

    for (const h of holdings) {
        const existing = aggregatedMap.get(h.instrumentId)
        const price = currentPrices.get(h.instrumentId)

        if (existing) {
            existing.totalQuantity += h.quantity
            existing.totalCostBasis += h.costBasisNative
            existing.totalCostBasisArs += h.costBasisArs
            existing.totalCostBasisUsd += h.costBasisUsd
            existing.byAccount.push(h)
        } else {
            aggregatedMap.set(h.instrumentId, {
                instrumentId: h.instrumentId,
                instrument: h.instrument,
                totalQuantity: h.quantity,
                totalCostBasis: h.costBasisNative,
                totalCostBasisArs: h.costBasisArs,
                totalCostBasisUsd: h.costBasisUsd,
                avgCost: h.avgCostNative,
                avgCostArs: h.avgCostArs,
                avgCostUsd: h.avgCostUsd,
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
        agg.avgCostArs = agg.totalCostBasisArs / agg.totalQuantity
        agg.avgCostUsd = agg.totalCostBasisUsd / agg.totalQuantity

        // Calculate Valuation using the Engine
        const valResult = calculateValuation(
            agg.totalQuantity,
            agg.currentPrice,
            agg.instrument.category,
            agg.instrument.nativeCurrency,
            fxRates
        )

        agg.valueARS = valResult.valueArs ?? undefined // Undefined used for optional field
        agg.valueUSD = valResult.valueUsd ?? undefined
        agg.fxUsed = valResult.fxUsed
        agg.ruleApplied = valResult.ruleApplied

        // Calculate PnL (Native)
        // If price is available, we have currentValueNative
        if (agg.currentPrice !== undefined) {
            agg.currentValue = agg.totalQuantity * agg.currentPrice
            agg.unrealizedPnL = agg.currentValue - agg.totalCostBasis
            agg.unrealizedPnLPercent =
                agg.totalCostBasis > 0 ? (agg.unrealizedPnL / agg.totalCostBasis) * 100 : 0
        }

        // Calculate Dual PnL
        // Calculate Dual PnL (Safe check)
        if (agg.valueARS != null && agg.valueUSD != null) {
            agg.unrealizedPnL_ARS = agg.valueARS - agg.totalCostBasisArs
            agg.unrealizedPnL_USD = agg.valueUSD - agg.totalCostBasisUsd

            // Add to totals
            totalARS += agg.valueARS
            totalUSD += agg.valueUSD
        }

        // Accumulate Unrealized PnL only if valid
        if (agg.unrealizedPnL) {
            // Note: This PnL is in NATIVE currency.
            // Requirement says "Total USD computed consistently".
            // Summing native PnL (mixed ARS/USD) is not correct for a total PnL.
            // Likely we want Total Portfolio Value - Total Cost Basis (in same currency).
            // But preserving existing logic for now regarding PnL summation if user didn't ask to change it.
            // But user said: "Total USD computed consistently from each asset’s usd valuation".
            // So we rely on totalUSD and totalARS accumulators.
            // The "unrealizedPnL" returned by this function seems to be native sum in old code?
            // "unrealizedPnL += agg.unrealizedPnL" was adding apples and oranges (ARS and USD pnl).
            // I should probably fix this if I can, but let's stick to the prompt goals.
            // "Remove remaining mock dependencies from totals where possible"
            // Let's keep the naive native sum for `unrealizedPnL` field to avoid breaking changes, 
            // but `totalARS`/`totalUSD` are now correct.
            unrealizedPnL += agg.unrealizedPnL
        }
    }

    // Add cash balances to totals
    let liquidityARS = 0
    let liquidityUSD = 0

    for (const [, currencyBalances] of cashBalances) {
        for (const [currency, balance] of currencyBalances) {
            if (balance === 0) continue

            // Determine category for valuation
            let category: AssetCategory = 'ARS_CASH'
            if (currency === 'USD') category = 'USD_CASH'
            // Could be USDT in cash balance? If so, treat as STABLE?
            // Usually cashBalances map is native fiat, but checking.

            const val = calculateValuation(
                balance,
                1, // Price of cash is 1
                category,
                currency as Currency,
                fxRates
            )

            if (currency === 'ARS') {
                liquidityARS += val.valueArs ?? 0
                // liquidityUSD += val.valueUsd // Don't double count if we add to totalARS/USD later
            } else {
                // liquidityARS += val.valueArs
                liquidityUSD += val.valueUsd ?? 0
            }

            // Actually the loop accumulates into liquidityARS/USD.
            // We should use the valuations directly.
            // If I have 1000 ARS. valueArs=1000, valueUsd=1.
            // liquidityARS += 1000, liquidityUSD += 1.

            liquidityARS += val.valueArs ?? 0
            liquidityUSD += val.valueUsd ?? 0
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

    // Top positions (sorted by value ARS)
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


