/**
 * Asset Valuation Engine
 * Computes asset metrics with correct FX application per asset class
 */

import type { FxQuotes, FxKey } from '@/domain/fx/types'
import { toUsdFromArs, toArsFromUsd, getEffectiveRate } from '@/domain/fx/convert'
import type { AssetMetrics, AssetInput, AssetPrices, CedearDetails, PortfolioAssetTotals } from './types'

/**
 * FX labels for display
 */
const FX_LABELS: Record<FxKey, string> = {
    oficial: 'Oficial',
    mep: 'MEP',
    cripto: 'Cripto',
}

/**
 * Get the appropriate FX key for an asset class
 */
export function getFxKeyForAsset(category: string): FxKey {
    switch (category) {
        case 'CEDEAR':
            return 'mep'
        case 'FCI':
            return 'oficial'
        case 'CRYPTO':
        case 'STABLE':
            return 'cripto'
        case 'CASH_ARS':
        case 'CASH_USD':
        case 'ARS_CASH':
        case 'USD_CASH':
            return 'oficial'
        default:
            return 'mep'
    }
}

/**
 * Compute CEDEAR-specific details
 */
function computeCedearDetails(
    quantity: number,
    priceArs: number | null,
    underlyingUsd: number | null,
    ratio: number
): CedearDetails {
    let usdExposure: number | null = null
    let impliedFx: number | null = null

    if (underlyingUsd != null && underlyingUsd > 0 && ratio > 0) {
        // USD exposure = qty * (underlyingUsd / ratio)
        usdExposure = quantity * (underlyingUsd / ratio)

        // Implied FX = (priceArs * ratio) / underlyingUsd
        if (priceArs != null && priceArs > 0) {
            impliedFx = (priceArs * ratio) / underlyingUsd
        }
    }

    return {
        usdExposure,
        impliedFx,
        ratio,
        underlyingUsd,
        ratioText: `${ratio}:1`,
    }
}

/**
 * Safe percentage calculation
 */
function safePct(value: number | null, base: number | null): number | null {
    if (value == null || base == null || !Number.isFinite(value) || !Number.isFinite(base)) {
        return null
    }
    if (base <= 0 || Math.abs(base) < 1e-8) {
        return null
    }
    return value / base
}

/**
 * Compute metrics for a single asset
 */
export function computeAssetMetrics(
    asset: AssetInput,
    prices: AssetPrices,
    fxQuotes: FxQuotes
): AssetMetrics {
    const fxKey = getFxKeyForAsset(asset.category)
    const fx = fxQuotes[fxKey]

    let valArs: number | null = null
    let valUsdEq: number | null = null
    let costUsdEq: number | null = null
    let cedearDetails: CedearDetails | undefined

    const costArs = asset.costBasisArs

    // Category-specific valuation logic
    switch (asset.category) {
        case 'CEDEAR': {
            // CEDEAR: Native price is ARS
            const priceArs = prices.currentPrice

            if (priceArs != null && Number.isFinite(priceArs)) {
                valArs = asset.quantity * priceArs
            }

            // Convert to USD using MEP (Liquidation: Venta/Ask)
            valUsdEq = toUsdFromArs(valArs, fx)

            // Cost: Use historical USD cost if available (to fix drift)
            if (asset.costBasisUsdEq != null && asset.costBasisUsdEq !== 0) {
                costUsdEq = asset.costBasisUsdEq
            } else {
                costUsdEq = toUsdFromArs(costArs, fx)
            }

            // Compute CEDEAR structural details
            cedearDetails = computeCedearDetails(
                asset.quantity,
                priceArs,
                prices.underlyingUsd ?? null,
                asset.cedearRatio ?? 1
            )
            break
        }

        case 'FCI': {
            // FCI: Native price is typically ARS (VCP) and should use Oficial FX for USD equivalent.
            // IMPORTANT: never default price to 1. If market quote is missing, fallback to average cost
            // so we don't show absurdly low valuations (qty * 1) in dashboards.
            const qty = asset.quantity
            const costArs = asset.costBasisArs

            const fallbackUnit = (() => {
                const avg = asset.avgCostNative
                if (avg != null && Number.isFinite(avg) && avg > 0) return avg
                // For ARS-native FCI, we can derive an average unit cost from ARS basis.
                if (asset.nativeCurrency !== 'USD' && qty > 0 && costArs != null && Number.isFinite(costArs) && costArs > 0) {
                    return costArs / qty
                }
                return null
            })()

            if (asset.nativeCurrency === 'USD') {
                const priceUsd = (prices.currentPrice != null && Number.isFinite(prices.currentPrice) && prices.currentPrice > 0)
                    ? prices.currentPrice
                    : fallbackUnit

                if (priceUsd != null && Number.isFinite(priceUsd)) {
                    valUsdEq = qty * priceUsd
                    valArs = toArsFromUsd(valUsdEq, fx)
                }

                // Prefer historical USD cost if available, otherwise derive from ARS basis
                if (asset.costBasisUsdEq != null && asset.costBasisUsdEq !== 0) {
                    costUsdEq = asset.costBasisUsdEq
                } else {
                    costUsdEq = toUsdFromArs(costArs, fx)
                }
            } else {
                const priceArs = (prices.currentPrice != null && Number.isFinite(prices.currentPrice) && prices.currentPrice > 0)
                    ? prices.currentPrice
                    : fallbackUnit

                if (priceArs != null && Number.isFinite(priceArs)) {
                    valArs = qty * priceArs
                }

                // Convert to USD using Oficial (Liquidation: Ask/Sell)
                valUsdEq = toUsdFromArs(valArs, fx)

                // Force Oficial conversion for USD-equivalent cost (avoid mixing MEP here).
                costUsdEq = toUsdFromArs(costArs, fx)
            }
            break
        }

        case 'CRYPTO':
        case 'STABLE': {
            // CRYPTO/STABLE: Native price is USD
            const priceUsd = prices.currentPrice

            let valUsd: number | null = null
            if (priceUsd != null && Number.isFinite(priceUsd)) {
                valUsd = asset.quantity * priceUsd
            }

            // Primary valuation is USD, ARS is equivalent (Liquidation: Bid/Compra)
            valUsdEq = valUsd
            valArs = toArsFromUsd(valUsd, fx)

            // Cost: Use historical USD cost if available (fixes drift), otherwise fallback
            if (asset.costBasisUsdEq != null && asset.costBasisUsdEq !== 0) {
                costUsdEq = asset.costBasisUsdEq
            } else {
                costUsdEq = toUsdFromArs(costArs, fx)
            }
            break
        }

        case 'CASH_ARS': {
            // CASH_ARS: Quantity IS the ARS value
            valArs = asset.quantity
            valUsdEq = toUsdFromArs(valArs, fx)
            costUsdEq = toUsdFromArs(costArs, fx)
            break
        }

        case 'CASH_USD': {
            // CASH_USD: Quantity IS the USD value
            valUsdEq = asset.quantity
            valArs = toArsFromUsd(valUsdEq, fx)
            costUsdEq = asset.quantity // Cost in USD = current value
            break
        }

        default: {
            // Generic handling based on native currency
            if (asset.nativeCurrency === 'USD') {
                const priceUsd = (prices.currentPrice != null && Number.isFinite(prices.currentPrice) && prices.currentPrice > 0)
                    ? prices.currentPrice
                    : null
                if (priceUsd != null) {
                    valUsdEq = asset.quantity * priceUsd
                    valArs = toArsFromUsd(valUsdEq, fx)
                }

                if (asset.costBasisUsdEq != null && asset.costBasisUsdEq !== 0) {
                    costUsdEq = asset.costBasisUsdEq
                } else {
                    costUsdEq = toUsdFromArs(costArs, fx)
                }
            } else {
                const priceArs = (prices.currentPrice != null && Number.isFinite(prices.currentPrice) && prices.currentPrice > 0)
                    ? prices.currentPrice
                    : null
                if (priceArs != null) {
                    valArs = asset.quantity * priceArs
                    valUsdEq = toUsdFromArs(valArs, fx)
                }
                costUsdEq = toUsdFromArs(costArs, fx)
            }
        }
    }

    // Compute PnL
    const pnlArs = (valArs != null && costArs != null) ? valArs - costArs : null
    const pnlUsdEq = (valUsdEq != null && costUsdEq != null) ? valUsdEq - costUsdEq : null

    // PnL % / ROI logic:
    // For USD assets (Crypto/Stable), we want ROI in USD.
    // For ARS assets (Cedear, Cash ARS), we want ROI in ARS (usually).
    // Actually, prompt says: "% rendimiento coincide con USD real" for Crypto.
    let roiPct: number | null = null

    if (asset.nativeCurrency === 'USD') {
        // Use USD basis
        // EXCEPTION: USD Cash (category 'CASH_USD') should use ARS basis
        if (asset.category === 'CASH_USD') {
            roiPct = safePct(pnlArs, costArs)
        } else {
            roiPct = safePct(pnlUsdEq, costUsdEq)
        }
    } else {
        // Use ARS basis
        roiPct = safePct(pnlArs, costArs)
    }

    // Legacy pnlPct field (often same as ROI)
    const pnlPct = roiPct

    // Get effective FX rate used
    const direction = asset.nativeCurrency === 'USD' ? 'usd-to-ars' : 'ars-to-usd'
    const fxRate = getEffectiveRate(fx, direction)

    // Compute Daily Change in ARS
    let changeArs1d: number | null = null
    if (prices.changePct1d != null && valArs != null) {
        // change = current - prev
        // current = prev * (1 + pct) => prev = current / (1 + pct)
        // change = current - current/(1+pct)
        // This assumes the pct change applies to the ARS value directly (valid for CEDEARs)
        // For Crypto (USD change), this approximates the ARS change impact if FX is stable
        const pct = prices.changePct1d
        if (pct !== -1) { // Avoid division by zero if dropped 100%
            const prevArs = valArs / (1 + pct)
            changeArs1d = valArs - prevArs
        }
    }

    return {
        instrumentId: asset.instrumentId,
        symbol: asset.symbol,
        name: asset.name,
        category: asset.category,
        quantity: asset.quantity,
        valArs,
        valUsdEq,
        costArs,
        costUsdEq,
        pnlArs,
        pnlPct,
        pnlUsdEq,
        roiPct,
        fxKeyUsed: fxKey,
        fxUsedLabel: FX_LABELS[fxKey],
        fxRate,
        currentPrice: prices.currentPrice,
        // Force average cost calculation from basis to ensure consistency (especially for CEDEARs ARS vs USD)
        avgCost: asset.quantity > 0 ? (asset.category === 'CEDEAR' ? costArs / asset.quantity : asset.avgCostNative) : 0,
        avgCostUsdEq: (asset.quantity > 0 && costUsdEq != null) ? costUsdEq / asset.quantity : 0,
        investedArs: costArs,
        nativeCurrency: asset.nativeCurrency,
        cedearDetails,
        changePct1d: prices.changePct1d,
        changeArs1d,
    }
}

/**
 * Compute portfolio totals from asset rows
 */
export function computePortfolioTotals(rows: AssetMetrics[]): PortfolioAssetTotals {
    let totalArs = 0
    let totalUsdEq = 0
    let totalCostArs = 0
    let totalCostUsdEq = 0

    for (const row of rows) {
        if (row.valArs != null && Number.isFinite(row.valArs)) {
            totalArs += row.valArs
        }
        if (row.valUsdEq != null && Number.isFinite(row.valUsdEq)) {
            totalUsdEq += row.valUsdEq
        }
        if (row.costArs != null && Number.isFinite(row.costArs)) {
            totalCostArs += row.costArs
        }
        if (row.costUsdEq != null && Number.isFinite(row.costUsdEq)) {
            totalCostUsdEq += row.costUsdEq
        }
    }

    const totalPnlArs = totalArs - totalCostArs
    const totalPnlPct = totalCostArs > 0 ? totalPnlArs / totalCostArs : null

    // Compute Unrealized USD PnL
    const unrealizedPnlUsd = totalUsdEq - totalCostUsdEq

    return {
        totalArs,
        totalUsdEq,
        totalCostArs,
        totalCostUsdEq,
        totalPnlArs,
        totalPnlPct,
        unrealizedPnlArs: totalPnlArs,
        unrealizedPnlUsd,
        realizedPnlArs: 0, // Placeholder, injected by hook
        realizedPnlUsd: 0, // Placeholder
    }
}
