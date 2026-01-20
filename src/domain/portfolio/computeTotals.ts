import type {
    Holding,
    HoldingAggregated,
    CategorySummary,
    PortfolioTotals,
    FxRates,
    FxType,
    AssetCategory,
    Currency,
    Instrument,
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
    STOCK: 'Acciones',
    CURRENCY: 'Moneda',
}

interface ComputeTotalsInput {
    holdings: Holding[]
    currentPrices: Map<string, number>
    priceChanges: Map<string, number> // 1d change percent (0.01 = 1%)
    fxRates: FxRates
    baseFx: FxType
    stableFx: FxType
    cashBalances: Map<string, Map<string, number>>
    realizedPnLArs: number
    realizedPnLUsd: number
    realizedPnLByAccount: Record<string, { ars: number; usd: number }>
}

import { getFxDailyChangePct } from '@/lib/daily-snapshot'
import { calculateValuation } from './valuation'
import { computeExposure } from './currencyExposure'

/**
 * Compute portfolio totals including ARS/USD values, liquidity, and category breakdown.
 */
export function computeTotals(input: ComputeTotalsInput): PortfolioTotals {
    const { holdings, currentPrices, priceChanges, fxRates, cashBalances, realizedPnLArs, realizedPnLUsd, realizedPnLByAccount } = input

    // Aggregate holdings by instrument
    const aggregatedMap = new Map<string, HoldingAggregated>()

    // 1. Process regular holdings
    for (const h of holdings) {
        // Skip explicitly tracked cash instruments in holdings to avoid double-counting with cashBalances
        // (Assuming cashBalances gives the authoritative "Money Flow" balance)
        if (h.instrument.category === 'ARS_CASH' || h.instrument.category === 'USD_CASH' || h.instrument.category === 'CURRENCY') {
            continue
        }

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
                avgCostUsdEq: h.avgCostUsdEq,
                currentPrice: price,
                byAccount: [h],
            })
        }
    }

    // 2. Inject Cash Balances as Held Assets
    for (const [accountId, balances] of cashBalances) {
        for (const [currency, balance] of balances) {
            if (Math.abs(balance) < 0.01) continue

            const isArs = currency === 'ARS'
            const category: AssetCategory = isArs ? 'ARS_CASH' : 'USD_CASH'
            const symbol = isArs ? 'ARS' : 'USD'
            const name = isArs ? 'Pesos Argentinos' : 'Dólar Estadounidense'

            // We use a synthetic ID for aggregation. 
            // Ideally we group all ARS separate from all USD.
            // But aggregatedMap keys are instrumentIds.
            // We need a canonical "cash-ars" instrument Id.
            const instrumentId = isArs ? 'canonical-cash-ars' : 'canonical-cash-usd'

            // Mock Instrument
            const instrument: Instrument = {
                id: instrumentId,
                symbol,
                name,
                category,
                nativeCurrency: currency as Currency,
                priceKey: symbol.toLowerCase(),
            }

            // Create Holding structure
            // Cash Cost Basis? 
            // If we treat Cash as having Cost Basis (Money In), we assume 1:1 for now or 0 PnL natively.
            // Real PnL comes from FX changes (USD held).
            const holding: Holding = {
                instrumentId,
                accountId,
                instrument,
                account: { id: accountId, name: 'Account', kind: 'BROKER', defaultCurrency: 'ARS' }, // Mock account object if needed
                quantity: balance,
                costBasisNative: balance,
                costBasisArs: isArs ? balance : 0, // Simplified: ARS cost of USD is unknown here without history
                costBasisUsd: isArs ? 0 : balance,
                avgCostNative: 1,
                avgCostArs: isArs ? 1 : 0,
                avgCostUsd: isArs ? 0 : 1,
                avgCostUsdEq: isArs ? 0 : 1,
            }

            const existing = aggregatedMap.get(instrumentId)
            if (existing) {
                existing.totalQuantity += balance
                // Accumulate cost basis? 
                // For cash, cost basis ~ quantity unless obtained via FX.
                // Sticking to 1:1 for simplicity in this aggregated view.
                existing.totalCostBasis += balance
                existing.totalCostBasisArs += holding.costBasisArs
                existing.totalCostBasisUsd += holding.costBasisUsd
                existing.byAccount.push(holding)
            } else {
                aggregatedMap.set(instrumentId, {
                    instrumentId,
                    instrument,
                    totalQuantity: balance,
                    totalCostBasis: balance,
                    totalCostBasisArs: holding.costBasisArs,
                    totalCostBasisUsd: holding.costBasisUsd,
                    avgCost: 1,
                    avgCostArs: holding.avgCostArs,
                    avgCostUsd: holding.avgCostUsd,
                    avgCostUsdEq: holding.avgCostUsdEq,
                    currentPrice: 1, // Cash price is 1
                    byAccount: [holding]
                })
            }
        }
    }


    // Calculate values for each aggregated holding
    let totalARS = 0
    let totalUSD = 0
    let unrealizedPnLArs = 0
    let unrealizedPnLUsd = 0
    let liquidityARS = 0
    let liquidityUSD = 0

    for (const [, agg] of aggregatedMap) {
        agg.avgCost = agg.totalQuantity !== 0 ? agg.totalCostBasis / agg.totalQuantity : 0
        agg.avgCostArs = agg.totalQuantity !== 0 ? agg.totalCostBasisArs / agg.totalQuantity : 0
        agg.avgCostUsd = agg.totalQuantity !== 0 ? agg.totalCostBasisUsd / agg.totalQuantity : 0
        agg.avgCostUsdEq = agg.totalQuantity !== 0 ? agg.totalCostBasisUsd / agg.totalQuantity : 0

        // Calculate Valuation
        const valResult = calculateValuation(
            agg.totalQuantity,
            agg.currentPrice,
            agg.instrument.category,
            agg.instrument.nativeCurrency,
            fxRates
        )

        agg.valueARS = valResult.valueArs ?? undefined
        agg.valueUSD = valResult.valueUsd ?? undefined
        agg.fxUsed = valResult.fxUsed
        agg.ruleApplied = valResult.ruleApplied

        // Calculate PnL (Native)
        if (agg.currentPrice !== undefined) {
            agg.currentValue = agg.totalQuantity * agg.currentPrice
            agg.unrealizedPnL = agg.currentValue - agg.totalCostBasis
            agg.unrealizedPnLPercent =
                agg.totalCostBasis > 0 ? (agg.unrealizedPnL / agg.totalCostBasis) * 100 : 0
        }

        // Calculate Dual PnL (Global Aggregation)
        if (agg.valueARS != null && agg.valueUSD != null) {
            // For Cash, Cost Basis ARS might be 0 if we assume pure inputs
            // But valueARS for USD cash is (Qty * Fx).
            // PnL = (Qty * Fx) - CostARS.
            // If CostARS is 0 (missing), PnL is huge.
            // For Cash injections, we set CostARS = 0 for USD?
            // Yes, above: `costBasisArs: isArs ? balance : 0`.
            // So USD Cash will show large Unrealized ARS PnL (Currency Gain).
            // This is actually correct for "Patrimonio" view if we consider the holding source unknown (pure asset).
            // However, typical user might expect Neutral PnL for cash "just sitting there".
            // If Cost Basis is missing, we might want to suppress PnL.
            // But we can't distinguish "Missing" vs "Zero Cost Gift".
            // Let's keep it raw.

            agg.unrealizedPnL_ARS = agg.valueARS - agg.totalCostBasisArs
            agg.unrealizedPnL_USD = agg.valueUSD - agg.totalCostBasisUsd

            totalARS += agg.valueARS
            totalUSD += agg.valueUSD

            // Only add to Unrealized PnL if it's NOT cash (optional logic), or user specifically wants to see FX gain.
            // User: "PnL no realizado (ARS + USD)".
            // Let's include everything.
            unrealizedPnLArs += agg.unrealizedPnL_ARS
            unrealizedPnLUsd += agg.unrealizedPnL_USD
        }

        // Liquidity sums
        if (agg.instrument.category === 'ARS_CASH') {
            liquidityARS += agg.valueARS ?? 0
        } else if (agg.instrument.category === 'USD_CASH') {
            liquidityUSD += agg.valueUSD ?? 0
        }

        // --- Calculate Daily Change ---
        const changePctArs = priceChanges.get(agg.instrumentId)
        if (changePctArs !== undefined) {
            agg.changePct1dArs = changePctArs
            if (agg.fxUsed) {
                const fxKey = agg.fxUsed.toLowerCase() as keyof FxRates
                const currentFxRate = fxRates[fxKey]
                if (typeof currentFxRate === 'number') {
                    const fxChangePct = getFxDailyChangePct(currentFxRate, fxKey)
                    if (fxChangePct != null) {
                        const onePlusArs = 1 + (changePctArs / 100)
                        const onePlusFx = 1 + fxChangePct
                        const usdChange = (onePlusArs / onePlusFx) - 1
                        agg.changePct1dUsd = usdChange * 100
                    }
                }
            }
        }
    }

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

    // Top positions
    const allAggregated = Array.from(aggregatedMap.values())
    const topPositions = allAggregated
        .filter((a) => a.valueARS !== undefined && a.valueARS > 0 && a.instrument.category !== 'ARS_CASH' && a.instrument.category !== 'USD_CASH')
        .sort((a, b) => (b.valueARS ?? 0) - (a.valueARS ?? 0))
        .slice(0, 5)

    // Compute Exposure
    // Use MEP Buy as per requirement (conservative/market buy side)
    const exposure = computeExposure(
        allAggregated,
        fxRates.mep.buy ?? fxRates.mep.sell ?? 0
    )

    return {
        totalARS,
        totalUSD,
        liquidityARS,
        liquidityUSD,
        realizedPnLArs,
        realizedPnLUsd,
        realizedPnLByAccount,
        unrealizedPnLArs,
        unrealizedPnLUsd,
        exposure,
        categories,
        topPositions,
    }
}
