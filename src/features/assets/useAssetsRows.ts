/**
 * useAssetsRows Hook
 * Unified hook for "Mis Activos" page that combines holdings, prices, and FX
 * with support for Liquidation valuation ONLY.
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
import type { FxQuotes } from '@/domain/fx/types'
import type { AssetRowMetrics, AssetInput, AssetPrices, PortfolioAssetTotals, AssetClass } from '@/domain/assets/types'
import type { HoldingAggregated, Holding } from '@/domain/types'

// Master data imports for CEDEAR ratios
import { getCedearMeta, type CedearMasterItem } from '@/domain/cedears/master'

export interface UseAssetsRowsOptions {
    categoryFilter?: AssetClass | 'all'
    searchQuery?: string
}

export interface UseAssetsRowsResult {
    rows: AssetRowMetrics[] // Kept for compatibility if needed
    // Grouped by Account ID
    groupedRows: Record<string, {
        accountName: string
        metrics: AssetRowMetrics[]
        totals: {
            valArs: number
            valUsd: number
            pnlArs: number
            pnlUsd: number
            totalCostArs: number
            totalCostUsdEq: number
            // New breakdown
            pnlUsdReal: number // For CRYPTO
            pnlUsdFx: number   // For STABLE
        }
    }>
    filteredRows: AssetRowMetrics[] // Kept for compatibility
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
        case 'CURRENCY':
            return 'CASH_USD'
        case 'FCI':
            return 'FCI'
        case 'PF':
        case 'pf':
            return 'PF'
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
 * Main hook for assets page
 */
export function useAssetsRows(options: UseAssetsRowsOptions): UseAssetsRowsResult {
    const { categoryFilter = 'all', searchQuery = '' } = options
    const { trackCash, cedearAuto } = getUserPreferences()

    // Data sources
    const { data: portfolio, isLoading: portfolioLoading, error: portfolioError } = useComputedPortfolio()
    const { data: fxRates, isLoading: fxLoading } = useFxRates()
    useInstruments() // Keep query active for cache
    const { priceMap: manualPrices } = useManualPrices()

    // Get crypto symbols from portfolio
    const cryptoSymbols = useMemo(() => {
        if (!portfolio) return ['USDT', 'USDC']
        const symbols = new Set<string>()

        // Traverse portfolio categories to find cryptos
        portfolio.categories.forEach(cat => {
            cat.items.forEach(agg => {
                if (agg.instrument.category === 'CRYPTO' || agg.instrument.category === 'STABLE') {
                    symbols.add(agg.instrument.symbol.toUpperCase())
                }
            })
        })

        symbols.add('USDT')
        symbols.add('USDC')
        return Array.from(symbols)
    }, [portfolio])

    const { data: cryptoPrices = {}, isLoading: isCryptoLoading } = useCryptoPrices(cryptoSymbols)
    const { data: cedearPrices = {}, isLoading: isCedearLoading } = useCedearPrices(cedearAuto)

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
            totals: {
                valArs: number
                valUsd: number
                pnlArs: number
                pnlUsd: number
                totalCostArs: number
                totalCostUsdEq: number
                pnlUsdReal: number
                pnlUsdFx: number
            }
        }> = {}

        portfolio.categories.forEach(cat => {
            cat.items.forEach((aggregatedItem: HoldingAggregated) => {
                const category = mapCategory(aggregatedItem.instrument.category)

                // Always include CASH assets


                // Iterate over sub-holdings (per account)
                aggregatedItem.byAccount.forEach((holding: Holding) => {
                    const accountId = holding.accountId
                    const accountName = holding.account.name

                    // Build AssetInput from specific holding data
                    const assetInput: AssetInput = {
                        instrumentId: holding.instrumentId,
                        symbol: holding.instrument.symbol,
                        name: holding.instrument.name,
                        category: category, // Use mapped AssetClass (CASH_USD, etc.)
                        nativeCurrency: holding.instrument.nativeCurrency as any,
                        quantity: holding.quantity,
                        avgCostNative: holding.avgCostNative,
                        avgCostUsdEq: holding.avgCostUsdEq,
                        costBasisArs: holding.costBasisArs,
                        costBasisUsdEq: holding.costBasisUsd, // Pass historical USD cost
                        cedearRatio: category === 'CEDEAR' ? getCedearRatioLocal(holding.instrument.symbol) : undefined,
                        underlyingSymbol: holding.instrument.underlyingSymbol,
                    }

                    // Build AssetPrices
                    const sym = holding.instrument.symbol.toUpperCase()
                    let currentPrice: number | null = null
                    let underlyingUsd: number | null = null
                    let changePct1d: number | null = null

                    // Price logic
                    if (manualPrices.has(holding.instrumentId)) {
                        currentPrice = manualPrices.get(holding.instrumentId) ?? null
                    } else if (category === 'CEDEAR' && cedearPrices[sym]) {
                        currentPrice = cedearPrices[sym].lastPriceArs ?? null
                        underlyingUsd = cedearPrices[sym].underlyingPrice ?? null
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

                    // Compute Metrics (NO MODE PASSED)
                    const metricsBase = computeAssetMetrics(assetInput, assetPrices, fxQuotes)

                    // Augment with Account Info
                    const metrics: AssetRowMetrics = {
                        ...metricsBase,
                        accountId,
                        accountName
                    }

                    // Apply Filters (Category & Search)
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
                                totals: {
                                    valArs: 0,
                                    valUsd: 0,
                                    pnlArs: 0,
                                    pnlUsd: 0,
                                    totalCostArs: 0,
                                    totalCostUsdEq: 0,
                                    pnlUsdReal: 0,
                                    pnlUsdFx: 0
                                }
                            }
                        }

                        groups[accountId].metrics.push(metrics)

                        // Accumulate Group Totals
                        groups[accountId].totals.valArs += metrics.valArs ?? 0
                        groups[accountId].totals.valUsd += metrics.valUsdEq ?? 0
                        groups[accountId].totals.pnlArs += metrics.pnlArs ?? 0
                        groups[accountId].totals.pnlUsd += metrics.pnlUsdEq ?? 0
                        groups[accountId].totals.totalCostArs += metrics.costArs ?? 0
                        groups[accountId].totals.totalCostUsdEq += metrics.costUsdEq ?? 0

                        // Bucket PnL
                        if (metrics.category === 'CRYPTO') {
                            groups[accountId].totals.pnlUsdReal += metrics.pnlUsdEq ?? 0
                        } else if (metrics.category === 'STABLE') {
                            groups[accountId].totals.pnlUsdFx += metrics.pnlUsdEq ?? 0
                        }
                    }
                })
            })
        })

        return groups
    }, [portfolio, fxQuotes, trackCash, manualPrices, cedearPrices, cryptoPrices, categoryFilter, searchQuery])

    // Compute Global Totals from Grouped Rows
    const totals = useMemo(() => {
        const flatMetrics = Object.values(groupedRows).flatMap(g => g.metrics)
        return computePortfolioTotals(flatMetrics)
    }, [groupedRows])

    const isLoading = portfolioLoading || fxLoading || isCedearLoading || isCryptoLoading
    const error = portfolioError as Error | null
    const asOf = fxRates ? new Date(fxRates.updatedAtISO) : null

    return {
        rows: [],
        groupedRows,
        filteredRows: [],
        totals,
        fxQuotes,
        isLoading,
        error,
        asOf,
    }
}
