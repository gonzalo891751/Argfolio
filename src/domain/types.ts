// =============================================================================
// CORE DOMAIN TYPES — Argfolio Phase 2
// =============================================================================

// -----------------------------------------------------------------------------
// Enums / Union Types
// -----------------------------------------------------------------------------

export type Currency = 'ARS' | 'USD' | 'USDT' | 'USDC' | 'BTC' | 'ETH'

export type AssetCategory =
    | 'CEDEAR'
    | 'STOCK'
    | 'CRYPTO'
    | 'STABLE'
    | 'USD_CASH'
    | 'ARS_CASH'
    | 'FCI'
    | 'PF'
    | 'WALLET'
    | 'DEBT'
    | 'CURRENCY' // New for "Moneda / Dólares"

export type MovementType =
    | 'BUY'
    | 'SELL'
    | 'DEPOSIT'
    | 'WITHDRAW'
    | 'FEE'
    | 'DIVIDEND'
    | 'INTEREST'
    | 'TRANSFER_IN'
    | 'TRANSFER_OUT'
    | 'DEBT_ADD'
    | 'DEBT_PAY'
    // New specific types
    | 'BUY_USD'
    | 'SELL_USD'

export type AccountKind = 'BROKER' | 'EXCHANGE' | 'BANK' | 'WALLET' | 'OTHER'

export type FxType = 'MEP' | 'CCL' | 'OFICIAL' | 'CRIPTO'

export type DebtStatus = 'ACTIVE' | 'PAID' | 'CANCELLED'

// -----------------------------------------------------------------------------
// Entities
// -----------------------------------------------------------------------------

export interface Instrument {
    id: string
    symbol: string
    name: string
    category: AssetCategory
    nativeCurrency: Currency
    priceKey: string // key for mock price provider
    // Placeholders for future
    cedearRatio?: number
    underlyingSymbol?: string
    coingeckoId?: string // for real price fetching
}

export interface Account {
    id: string
    name: string
    kind: AccountKind
    defaultCurrency: Currency
}

export interface MovementFee {
    mode: 'PERCENT' | 'FIXED'
    percent?: number
    amount: number // value in native currency
    currency: Currency
}

export interface Movement {
    id: string
    datetimeISO: string
    type: MovementType
    assetClass?: 'cedear' | 'crypto' | 'fci' | 'pf' | 'currency' | 'wallet'
    instrumentId?: string // null for pure cash movements or new 'currency'/'wallet' flows
    accountId: string
    quantity?: number // null for fees, deposits of cash
    unitPrice?: number // null for deposits, withdraws
    tradeCurrency: Currency

    // Totals logic
    totalAmount: number // GROSS: qty * price (or raw amount for cash)
    fee?: MovementFee
    netAmount?: number // NET: gross +/- fee. This is the "real" money moved.

    // Historical valuation in base currencies (derived from NET)
    totalARS?: number
    totalUSD?: number

    fxAtTrade?: number // FX rate at time of trade (for historical accuracy)

    // Deprecated / Backwards Compat (can be derived from fee object)
    feeAmount?: number
    feeCurrency?: Currency

    notes?: string
    // For transfers
    toAccountId?: string
    // For debt payments
    debtId?: string
    // For import tracking
    importBatchId?: string

    // FX Snapshot (New for Step D)
    fx?: MovementFxSnapshot

    // Fallback fields for display when instrumentId is not resolvable
    ticker?: string
    assetName?: string

    // Plazo Fijo Specific Fields
    bank?: string
    alias?: string
    principalARS?: number
    termDays?: number
    tna?: number
    tea?: number
    startDate?: string // ISO
    maturityDate?: string // ISO
    expectedInterest?: number
    expectedTotal?: number
}

export interface MovementFxSnapshot {
    kind: FxType | 'NONE'
    side: 'buy' | 'sell' | 'mid'
    rate: number
    asOf: string // ISO timestamp
    source?: string
}

export interface Snapshot {
    id: string
    dateLocal: string // YYYY-MM-DD
    totalARS: number
    totalUSD: number
    fxUsed: {
        usdArs: number
        type: FxType
    }
    createdAtISO: string
}

export interface Debt {
    id: string
    name: string
    currency: Currency
    originalAmount: number
    currentBalance: number
    dueDateLocal: string // YYYY-MM-DD
    notes?: string
    status: DebtStatus
    createdAtISO: string
}

// -----------------------------------------------------------------------------
// Computed Types (Portfolio Engine Output)
// -----------------------------------------------------------------------------

export interface Holding {
    instrumentId: string
    accountId: string
    instrument: Instrument
    account: Account
    quantity: number
    costBasisNative: number // total cost in native currency (NET)
    costBasisArs: number    // total cost tracked in ARS
    costBasisUsd: number    // total cost tracked in USD
    avgCostNative: number   // cost basis / quantity
    avgCostArs: number
    avgCostUsd: number
    avgCostUsdEq: number // new: weighted average cost in historical USD
    currentPriceNative?: number
    currentValueNative?: number
    unrealizedPnLNative?: number
    unrealizedPnLPercent?: number
}

export interface HoldingAggregated {
    instrumentId: string
    instrument: Instrument
    totalQuantity: number
    totalCostBasis: number // native
    totalCostBasisArs: number
    totalCostBasisUsd: number
    avgCost: number // native
    avgCostArs: number
    avgCostUsd: number
    avgCostUsdEq: number // new: weighted average cost in historical USD
    currentPrice?: number
    currentValue?: number // native
    unrealizedPnL?: number // native
    unrealizedPnLPercent?: number // native

    // Explicit dual valuation
    valueARS?: number
    valueUSD?: number
    unrealizedPnL_ARS?: number
    unrealizedPnL_USD?: number

    // Daily Change
    changePct1dArs?: number
    changePct1dUsd?: number

    fxUsed?: FxType
    ruleApplied?: string
    byAccount: Holding[]
}

export interface CategorySummary {
    category: AssetCategory
    label: string
    totalARS: number
    totalUSD: number
    items: HoldingAggregated[]
}

export interface PortfolioTotals {
    totalARS: number
    totalUSD: number
    liquidityARS: number
    liquidityUSD: number
    changeToday?: number
    changeTodayPercent?: number
    pnlToday?: number
    pnlTotal?: number
    realizedPnL: number
    unrealizedPnL: number
    categories: CategorySummary[]
    topPositions: HoldingAggregated[]
}

// -----------------------------------------------------------------------------
// FX Rates (from mock provider)
// -----------------------------------------------------------------------------

export interface FxPair {
    buy: number | null
    sell: number | null
    mid?: number | null // optional midpoint if needed
}

export interface FxRates {
    oficial: FxPair
    blue: FxPair
    mep: FxPair
    ccl: FxPair
    cripto: FxPair
    updatedAtISO: string
    source: string
}

export interface PriceQuote {
    symbol: string
    priceUsd: number
    source: string
    updatedAtISO: string
}

export interface ManualPrice {
    instrumentId: string
    price: number
    updatedAtISO: string
}

// -----------------------------------------------------------------------------
// Valuation Rules
// -----------------------------------------------------------------------------

export interface ValuationResult {
    valueArs: number | null
    valueUsd: number | null
    fxUsed: FxType
    exchangeRate: number
    ruleApplied: string
}

// -----------------------------------------------------------------------------
// User Preferences
// -----------------------------------------------------------------------------

export interface UserPreferences {
    baseFxForUSD: FxType
    stablecoinFx: FxType
    theme: 'light' | 'dark' | 'system'
    autoRefreshEnabled: boolean
}
