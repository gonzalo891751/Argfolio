/**
 * Asset Valuation Engine
 * Computes asset metrics with correct FX application per asset class
 */

import type { FxQuotes, ValuationMode, FxKey } from '@/domain/fx/types'
import { toUsdFromArs, toArsFromUsd, getEffectiveRate } from '@/domain/fx/convert'
import type { AssetMetrics, AssetInput, AssetPrices, CedearDetails, PortfolioAssetTotals } from './types'

/**
 * FX labels for display
 */
const FX_LABELS: Record<FxKey, string> = {
    oficial: 'Dólar Oficial',
    mep: 'Dólar MEP',
    cripto: 'Dólar Cripto',
}

/**
 * Get the appropriate FX key for an asset class
 */
export function getFxKeyForAsset(category: string): FxKey {
    switch (category) {
        case 'CEDEAR':
            return 'mep'
        case 'CRYPTO':
        case 'STABLE':
            return 'cripto'
        case 'CASH_ARS':
        case 'ARS_CASH':
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
    if (value == null || base == null || base === 0 || !Number.isFinite(value) || !Number.isFinite(base)) {
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
    fxQuotes: FxQuotes,
    mode: ValuationMode
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

            // Convert to USD using MEP
            valUsdEq = toUsdFromArs(valArs, fx, mode)
            costUsdEq = toUsdFromArs(costArs, fx, mode)

            // Compute CEDEAR structural details
            cedearDetails = computeCedearDetails(
                asset.quantity,
                priceArs,
                prices.underlyingUsd ?? null,
                asset.cedearRatio ?? 1
            )
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

            // Primary valuation is USD, ARS is equivalent
            valUsdEq = valUsd
            valArs = toArsFromUsd(valUsd, fx, mode)

            // Cost was tracked in ARS, convert to USD
            costUsdEq = toUsdFromArs(costArs, fx, mode)
            break
        }

        case 'CASH_ARS': {
            // CASH_ARS: Quantity IS the ARS value
            valArs = asset.quantity
            valUsdEq = toUsdFromArs(valArs, fx, mode)
            costUsdEq = toUsdFromArs(costArs, fx, mode)
            break
        }

        case 'CASH_USD': {
            // CASH_USD: Quantity IS the USD value
            valUsdEq = asset.quantity
            valArs = toArsFromUsd(valUsdEq, fx, mode)
            costUsdEq = asset.quantity // Cost in USD = current value
            break
        }

        default: {
            // Generic handling based on native currency
            if (asset.nativeCurrency === 'USD') {
                const priceUsd = prices.currentPrice ?? 1
                valUsdEq = asset.quantity * priceUsd
                valArs = toArsFromUsd(valUsdEq, fx, mode)
                costUsdEq = toUsdFromArs(costArs, fx, mode)
            } else {
                const priceArs = prices.currentPrice ?? 1
                valArs = asset.quantity * priceArs
                valUsdEq = toUsdFromArs(valArs, fx, mode)
                costUsdEq = toUsdFromArs(costArs, fx, mode)
            }
        }
    }

    // Compute PnL
    const pnlArs = (valArs != null && costArs != null) ? valArs - costArs : null
    const pnlUsdEq = (valUsdEq != null && costUsdEq != null) ? valUsdEq - costUsdEq : null

    // safePct for ROI
    const pnlPct = safePct(pnlArs, costArs)
    const roiPct = pnlPct // ROI is essentially the PnL %

    // Get effective FX rate used
    const direction = asset.nativeCurrency === 'USD' ? 'usd-to-ars' : 'ars-to-usd'
    const fxRate = getEffectiveRate(fx, mode, direction)

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
        avgCost: asset.avgCostNative,
        avgCostUsdEq: asset.avgCostUsdEq, // Pass through historical USD cost
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

    return {
        totalArs,
        totalUsdEq,
        totalCostArs,
        totalCostUsdEq,
        totalPnlArs,
        totalPnlPct,
    }
}
