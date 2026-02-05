/**
 * Portfolio V2 Types
 * 
 * Data structures for the new Mis Activos V2 page.
 * These types represent the transformed/aggregated data shape
 * consumed by the V2 UI components.
 */

// =============================================================================
// Core Value Objects
// =============================================================================

export interface MoneyPair {
    ars: number
    usd: number
}

/**
 * FX metadata for TC chip display in UI
 */
export interface FxMeta {
    /** FX family used for valuation */
    family: 'Oficial' | 'MEP' | 'Cripto'
    /** Side: Compra (C) or Venta (V) */
    side: 'C' | 'V'
    /** Actual rate used */
    rate: number
}

export interface FxRatesSnapshot {
    officialSell: number
    officialBuy: number
    mepSell: number
    mepBuy: number
    cclSell: number
    cclBuy: number
    cryptoSell: number
    cryptoBuy: number
    updatedAtISO: string
}

// =============================================================================
// KPI Dashboard Types
// =============================================================================

export interface ExposureBucket {
    /** USD "efectivo" - real USD (crypto native + billete) */
    usdHard: number
    /** USD "equivalente" - ARS convertido a USD */
    usdEquivalent: number
    /** ARS efectivo */
    arsReal: number
}

export interface PortfolioKPIs {
    /** Total patrimonio en ARS */
    totalArs: number
    /** Total patrimonio equivalente en USD (using base FX) */
    totalUsdEq: number

    /** Unrealized PnL */
    pnlUnrealizedArs: number
    pnlUnrealizedUsdEq: number

    /** Realized PnL (optional, may not be computed) */
    pnlRealizedArs?: number
    pnlRealizedUsdEq?: number

    /** Currency exposure buckets */
    exposure: ExposureBucket

    /** Percentage breakdown */
    pctUsdHard: number
    pctUsdEq: number
    pctArs: number
}

// =============================================================================
// Rubro / Provider / Item Hierarchy
// =============================================================================

export type RubroId = 'wallets' | 'frascos' | 'plazos' | 'cedears' | 'crypto' | 'fci'

export type FxPolicyLabel = 'Oficial Venta' | 'MEP' | 'Cripto' | 'VCP'

export interface RubroV2 {
    id: RubroId
    name: string
    icon: string // Lucide icon name
    fxPolicy: FxPolicyLabel
    totals: MoneyPair
    pnl: MoneyPair
    providers: ProviderV2[]
    /** FX metadata for the rubro (if single TC) or undefined (mixed) */
    fxMeta?: FxMeta
}

export interface ProviderV2 {
    id: string // accountId
    name: string
    totals: MoneyPair
    pnl: MoneyPair
    commissions?: CommissionSettings
    items: ItemV2[]
    /** FX metadata for the provider (if single TC) or undefined (mixed) */
    fxMeta?: FxMeta
}

export interface CommissionSettings {
    buyPct: number
    sellPct: number
    fixedArs?: number
    fixedUsd?: number
}

export type ItemKind =
    | 'cash_ars'
    | 'cash_usd'
    | 'wallet_yield'
    | 'frasco'
    | 'plazo_fijo'
    | 'cedear'
    | 'crypto'
    | 'stable'
    | 'fci'

export interface ItemV2 {
    id: string
    kind: ItemKind
    symbol: string
    label: string

    /** Quantity held (shares, coins, cuotapartes) */
    qty?: number

    /** Current valuation */
    valArs: number
    valUsd: number

    /** Unrealized PnL */
    pnlArs?: number
    pnlUsd?: number
    pnlPct?: number

    /** For yield-bearing items */
    yieldMeta?: {
        tna: number
        tea?: number
        lastAccruedISO?: string
    }

    /** For plazos fijos */
    pfMeta?: {
        startDateISO: string
        maturityDateISO: string
        daysRemaining: number
        capitalArs: number
        expectedInterestArs: number
        expectedTotalArs: number
    }

    /** FX metadata for TC chip display */
    fxMeta?: FxMeta

    /** Reference to source data */
    accountId: string
    instrumentId?: string
}

// =============================================================================
// Detail Overlays
// =============================================================================

export interface LotDetail {
    id: string
    dateISO: string
    qty: number
    unitCostNative: number
    totalCostNative: number
    currentValueNative: number
    pnlNative: number
    pnlPct: number
}

export interface WalletDetail {
    accountId: string
    accountName: string
    cashBalanceArs: number
    cashBalanceUsd: number
    yieldEnabled: boolean
    tna?: number
    tea?: number
    interestTodayArs?: number
    interestMonthArs?: number
    interestYtdArs?: number
    projectedMonthEndArs?: number
    projectedYearEndArs?: number
    recentInterestMovements: Array<{
        dateISO: string
        amountArs: number
    }>
}

export interface FixedDepositDetail {
    movementId: string
    pfCode: string
    bank: string
    alias?: string
    status: 'active' | 'matured' | 'settled'
    capitalArs: number
    tna: number
    tea?: number
    termDays: number
    startDateISO: string
    maturityDateISO: string
    daysRemaining: number
    daysElapsed: number
    expectedInterestArs: number
    expectedTotalArs: number
    accruedInterestArs: number
    fxAtConstituteOficial?: number
}

export interface CedearLotDetail {
    id: string
    dateISO: string
    qty: number
    unitCostArs: number
    unitCostUsd: number
    totalCostArs: number
    totalCostUsd: number
    currentValueArs: number
    currentValueUsd: number
    pnlArs: number
    pnlUsd: number
    pnlPctArs: number
    pnlPctUsd: number
    fxAtTrade: number
    fxMissing?: boolean
}

export interface CedearDetail {
    instrumentId: string
    symbol: string
    name: string
    underlyingSymbol?: string
    ratio: number
    totalQty: number
    totalCostArs: number
    totalCostUsd: number
    avgCostArs: number
    avgCostUsd: number
    currentPriceArs: number
    currentPriceUsd: number
    currentValueArs: number
    currentValueUsd: number
    pnlArs: number
    pnlUsd: number
    pnlPctArs: number
    pnlPctUsd: number
    lots: CedearLotDetail[]
    fxUsed: 'MEP'
}

export interface CryptoDetail {
    instrumentId: string
    symbol: string
    name: string
    totalQty: number
    totalCostUsd: number
    avgCostUsd: number
    currentPriceUsd: number
    currentValueUsd: number
    currentValueArs: number
    pnlUsd: number
    pnlArs: number
    pnlPct: number
    lots: LotDetail[]
    fxUsed: 'Cripto'
}

// =============================================================================
// Main Portfolio V2 Structure
// =============================================================================

export interface PortfolioV2 {
    /** Whether data is still loading */
    isLoading: boolean

    /** Error if any */
    error?: string

    /** Timestamp of data */
    asOfISO: string

    /** FX rates used */
    fx: FxRatesSnapshot

    /** KPI Dashboard data */
    kpis: PortfolioKPIs

    /** Alert flags */
    flags: {
        /** Number of positions with inferred opening balance */
        inferredBalanceCount: number
        /** Message to show if > 0 */
        inferredMessage?: string
    }

    /** Rubros hierarchy */
    rubros: RubroV2[]

    /** Pre-computed details for overlays (keyed by item id) */
    walletDetails: Map<string, WalletDetail>
    fixedDepositDetails: Map<string, FixedDepositDetail>
    cedearDetails: Map<string, CedearDetail>
    cryptoDetails: Map<string, CryptoDetail>
}

// =============================================================================
// Builder Input Types (from existing hooks)
// =============================================================================

export interface BuilderInput {
    // From useComputedPortfolio
    portfolioTotals: import('@/domain/types').PortfolioTotals | null

    // From useFxRates
    fxRates: import('@/domain/types').FxRates | null

    // From useAccounts
    accounts: import('@/domain/types').Account[]

    // From useAssetsRows
    groupedRows: Record<string, {
        accountName: string
        metrics: Array<{
            id: string
            instrumentId: string
            symbol: string
            name: string
            category: string
            qty: number
            valArs: number
            valUsd: number
            pnlArs: number
            pnlUsd: number
            pnlPct: number
            avgCostArs?: number
            avgCostUsd?: number
            currentPriceArs?: number
            currentPriceUsd?: number
        }>
        totals: {
            valArs: number
            valUsd: number
            pnlArs: number
            pnlUsd: number
        }
    }>

    // From usePF
    pfData?: {
        active: Array<import('@/domain/types').Movement>
        matured: Array<import('@/domain/types').Movement>
        totals: {
            totalActiveARS: number
            totalMaturedARS: number
            totalActiveInterestARS: number
        }
    }

    // From movements (for interest history)
    movements: import('@/domain/types').Movement[]
}
