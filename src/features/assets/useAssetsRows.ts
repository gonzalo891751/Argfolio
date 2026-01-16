/**
 * useAssetsRows Hook
 * Unified hook for "Mis Activos" page that combines holdings, prices, and FX
 * with support for Market and Liquidation valuation modes
 */

import { useMemo } from 'react'
import { useComputedPortfolio } from '@/hooks/use-computed-portfolio'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useCedearPrices } from '@/hooks/use-cedear-prices'
import { useCryptoPrices } from '@/hooks/use-crypto-prices'
import { useManualPrices } from '@/hooks/use-manual-prices'
import { useInstruments } from '@/hooks/use-instruments'
import { buildFxQuote } from '@/domain/fx/convert'
import { computeAssetMetrics, computePortfolioTotals } from '@/domain/assets/valuation'
import type { ValuationMode, FxQuotes } from '@/domain/fx/types'
import type { AssetRowMetrics, AssetInput, AssetPrices, PortfolioAssetTotals, AssetClass } from '@/domain/assets/types'
import type { HoldingAggregated, Holding } from '@/domain/types'

// Master data imports for CEDEAR ratios
import { getCedearMeta, type CedearMasterItem } from '@/domain/cedears/master'

export interface UseAssetsRowsOptions {
    mode: ValuationMode
    categoryFilter?: AssetClass | 'all'
    searchQuery?: string
}

export interface UseAssetsRowsResult {
    // Legacy rows (kept for potential other uses or type compat, but empty in this mode)
    rows: AssetRowMetrics[]
    // Grouped by Account ID
    groupedRows: Record<string, {
        accountName: string
        metrics: AssetRowMetrics[]
        totals: {
            valArs: number
            valUsd: number
            pnlArs: number
            pnlUsd: number
        }
    }>
    filteredRows: AssetRowMetrics[]
    totals: PortfolioAssetTotals
    fxQuotes: FxQuotes | null
    isLoading: boolean
    error: Error | null
    asOf: Date | null
}

function getUserPreferences(): { trackCash: boolean; cedearAuto: boolean } {
    const trackCash = localStorage.getItem('argfolio.trackCash') === 'true'
    const cedearAuto = localStorage.getItem('argfolio-settings-cedear-auto') !== 'false'
    return { trackCash, cedearAuto }
}

/**
 * Map asset category from domain types to AssetClass
 */
function mapCategory(category: string): AssetClass {
    switch (category) {
        case 'CEDEAR':
            return 'CEDEAR'
        case 'CRYPTO':
            return 'CRYPTO'
        case 'STABLE':
            return 'STABLE'
        case 'ARS_CASH':
            return 'CASH_ARS'
        case 'USD_CASH':
            return 'CASH_USD'
        case 'FCI':
            return 'FCI'
        default:
            return 'OTHER'
    }
}

/**
 * Get CEDEAR ratio from master data
 */
function getCedearRatioLocal(symbol: string): number {
    const entry: CedearMasterItem | null = getCedearMeta(symbol)
    return entry?.ratio ?? 1
}

/**
 * Main hook for assets page with valuation mode support
 */
export function useAssetsRows(options: UseAssetsRowsOptions): UseAssetsRowsResult {
    const { mode, categoryFilter = 'all', searchQuery = '' } = options
    const { trackCash, cedearAuto } = getUserPreferences()

    // Data sources
    const { data: portfolio, isLoading: portfolioLoading, error: portfolioError } = useComputedPortfolio()
    const { data: fxRates, isLoading: fxLoading } = useFxRates()
    useInstruments() // Keep query active for cache
    const { priceMap: manualPrices } = useManualPrices()

    // Get crypto symbols from portfolio
    const cryptoSymbols = useMemo(() => {
        if (!portfolio) return ['USDT', 'USDC'] // Defaults
        const symbols = new Set<string>()
        portfolio.categories.forEach(cat => {
            cat.items
                .filter(item => item.instrument.category === 'CRYPTO' || item.instrument.category === 'STABLE')
                .forEach(item => symbols.add(item.instrument.symbol.toUpperCase()))
        })
        symbols.add('USDT')
        symbols.add('USDC')
        return Array.from(symbols)
    }, [portfolio])

    const { data: cryptoPrices = {} } = useCryptoPrices(cryptoSymbols)
    const { data: cedearPrices = {} } = useCedearPrices(cedearAuto)

    // Build FX quotes from rates
    const fxQuotes = useMemo((): FxQuotes | null => {
        if (!fxRates) return null
        return {
            oficial: buildFxQuote(fxRates.oficial),
            mep: buildFxQuote(fxRates.mep),
            cripto: buildFxQuote(fxRates.cripto),
        }
    }, [fxRates])

    // Compute Grouped Rows
    const groupedRows = useMemo(() => {
        if (!portfolio || !fxQuotes) return {}

        // Structure: AccountID -> { accountName, metrics[], totals }
        const groups: Record<string, {
            accountName: string
            metrics: AssetRowMetrics[]
            totals: { valArs: number; valUsd: number; pnlArs: number; pnlUsd: number }
        }> = {}

        portfolio.categories.forEach(cat => {
            cat.items.forEach((aggregatedItem: HoldingAggregated) => {
                const category = mapCategory(aggregatedItem.instrument.category)

                // Skip CASH_ARS if trackCash is OFF
                if (category === 'CASH_ARS' && !trackCash) {
                    return
                }

                // Iterate over sub-holdings (per account)
                aggregatedItem.byAccount.forEach((holding: Holding) => {
                    const accountId = holding.accountId
                    const accountName = holding.account.name

                    // Build AssetInput from specific holding data
                    const assetInput: AssetInput = {
                        instrumentId: holding.instrumentId,
                        symbol: holding.instrument.symbol,
                        name: holding.instrument.name,
                        category,
                        nativeCurrency: holding.instrument.nativeCurrency,
                        quantity: holding.quantity,
                        avgCostNative: holding.avgCostNative,
                        avgCostUsdEq: holding.avgCostUsdEq,
                        costBasisArs: holding.costBasisArs,
                        cedearRatio: category === 'CEDEAR' ? getCedearRatioLocal(holding.instrument.symbol) : undefined,
                        underlyingSymbol: holding.instrument.underlyingSymbol,
                    }

                    // Build AssetPrices (same logic as before, shared across holdings of same instrument)
                    const sym = holding.instrument.symbol.toUpperCase()
                    let currentPrice: number | null = null
                    let underlyingUsd: number | null = null
                    let changePct1d: number | null = null

                    // Price logic
                    if (manualPrices.has(holding.instrumentId)) {
                        currentPrice = manualPrices.get(holding.instrumentId) ?? null
                    } else if (category === 'CEDEAR' && cedearPrices[sym]) {
                        currentPrice = cedearPrices[sym].lastPriceArs ?? null
                        changePct1d = cedearPrices[sym].changePct != null
                            ? cedearPrices[sym].changePct! / 100
                            : null
                    } else if ((category === 'CRYPTO' || category === 'STABLE') && cryptoPrices[sym] !== undefined) {
                        currentPrice = cryptoPrices[sym]
                    } else {
                        currentPrice = aggregatedItem.currentPrice ?? null
                    }

                    const assetPrices: AssetPrices = {
                        currentPrice,
                        underlyingUsd,
                        changePct1d,
                    }

                    // Compute Metrics
                    const metricsBase = computeAssetMetrics(assetInput, assetPrices, fxQuotes, mode)

                    // Augment with Account Info
                    const metrics: AssetRowMetrics = {
                        ...metricsBase,
                        accountId,
                        accountName
                    }

                    // Apply Filters (Category & Search)
                    // We filter individual holdings here to avoid empty groups later
                    let passesFilter = true
                    if (categoryFilter !== 'all' && metrics.category !== categoryFilter) passesFilter = false
                    if (searchQuery) {
                        const q = searchQuery.toLowerCase()
                        if (!metrics.symbol.toLowerCase().includes(q) && !metrics.name.toLowerCase().includes(q)) {
                            passesFilter = false
                        }
                    }

                    if (passesFilter) {
                        if (!groups[accountId]) {
                            groups[accountId] = {
                                accountName,
                                metrics: [],
                                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 }
                            }
                        }

                        groups[accountId].metrics.push(metrics)

                        // Accumulate Group Totals
                        groups[accountId].totals.valArs += metrics.valArs ?? 0
                        groups[accountId].totals.valUsd += metrics.valUsdEq ?? 0
                        groups[accountId].totals.pnlArs += metrics.pnlArs ?? 0
                        groups[accountId].totals.pnlUsd += metrics.pnlUsdEq ?? 0
                    }
                })
            })
        })

        return groups
    }, [portfolio, fxQuotes, mode, trackCash, manualPrices, cedearPrices, cryptoPrices, categoryFilter, searchQuery])

    // Compute Global Totals from Grouped Rows
    // We can just sum up the group totals or re-use existing logic if adapted
    const totals = useMemo(() => {
        const flatMetrics = Object.values(groupedRows).flatMap(g => g.metrics)
        return computePortfolioTotals(flatMetrics)
    }, [groupedRows])

    const isLoading = portfolioLoading || fxLoading
    const error = portfolioError as Error | null
    const asOf = fxRates ? new Date(fxRates.updatedAtISO) : null

    return {
        rows: [], // Deprecated/Unused in new view
        groupedRows,
        filteredRows: [], // Deprecated/Unused
        totals,
        fxQuotes,
        isLoading,
        error,
        asOf,
    }
}
