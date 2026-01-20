/**
 * Asset Valuation Types
 * Types for computed asset metrics with dual currency support
 */

import type { FxKey } from '@/domain/fx/types'

/**
 * Asset class categories for valuation rules
 */
export type AssetClass = 'CEDEAR' | 'CRYPTO' | 'CASH_ARS' | 'CASH_USD' | 'STABLE' | 'FCI' | 'PF' | 'OTHER'

/**
 * CEDEAR-specific structural information
 */
export interface CedearDetails {
    /** USD exposure = qty * (underlyingUsd / ratio) */
    usdExposure: number | null
    /** Implied FX = (priceArs * ratio) / underlyingUsd */
    impliedFx: number | null
    /** CEDEAR ratio (e.g., 10 for AAPL) */
    ratio: number
    /** Underlying asset price in USD */
    underlyingUsd: number | null
    /** Ratio display text (e.g., "10:1") */
    ratioText: string
}

/**
 * Computed metrics for a single asset row
 */
/**
 * Computed metrics for a single asset (base without account context)
 */
export interface AssetMetrics {
    // Identity
    instrumentId: string
    symbol: string
    name: string
    category: AssetClass

    // Quantity
    quantity: number

    // Current Valuations
    valArs: number | null
    valUsdEq: number | null

    // Cost Basis
    costArs: number | null
    costUsdEq: number | null

    // PnL
    pnlArs: number | null
    pnlPct: number | null
    pnlUsdEq: number | null // New field: Unrealized PnL in USD (Valuation - FIFO Cost)
    roiPct: number | null // New field: Return % (PnL / Cost)

    // FX Information
    fxKeyUsed: FxKey
    fxUsedLabel: string
    fxRate: number | null

    // Price Information
    currentPrice: number | null
    avgCost: number | null
    avgCostUsdEq?: number | null // New field
    investedArs: number | null
    nativeCurrency: string

    // CEDEAR-specific (only populated for CEDEARs)
    cedearDetails?: CedearDetails

    // Daily Change
    changePct1d?: number | null
    changeArs1d?: number | null
}

/**
 * Full asset row metrics including account context
 */
export interface AssetRowMetrics extends AssetMetrics {
    // Account Info
    accountId: string
    accountName: string
}

/**
 * Asset input data for valuation computation
 */
export interface AssetInput {
    instrumentId: string
    symbol: string
    name: string
    category: AssetClass
    nativeCurrency: string
    quantity: number
    avgCostNative: number
    avgCostUsdEq?: number // New field

    costBasisArs: number
    costBasisUsdEq?: number // New field: Historical Total USD Cost

    // CEDEAR-specific
    cedearRatio?: number
    underlyingSymbol?: string
}

/**
 * Price data for an asset
 */
export interface AssetPrices {
    /** Current price in native currency (ARS for CEDEAR, USD for CRYPTO) */
    currentPrice: number | null
    /** Underlying USD price (for CEDEARs) */
    underlyingUsd?: number | null
    /** Daily change percentage */
    changePct1d?: number | null
}

/**
 * Portfolio totals computed from all assets
 */
export interface PortfolioAssetTotals {
    totalArs: number
    totalUsdEq: number
    totalCostArs: number
    totalCostUsdEq: number
    totalPnlArs: number
    totalPnlPct: number | null
    realizedPnlArs: number
    realizedPnlUsd: number
    unrealizedPnlArs: number
    unrealizedPnlUsd: number
}
