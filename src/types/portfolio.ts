// Currency types
export type Currency = 'ARS' | 'USD' | 'USDT' | 'USDC' | 'BTC' | 'ETH'
export type FiatCurrency = 'ARS' | 'USD'
export type FxType = 'oficial' | 'blue' | 'mep' | 'ccl' | 'cripto'

// FX Rates
export interface FxRate {
    type: FxType
    name: string
    buy: number
    sell: number
    spread?: number
    timestamp: Date
}

export interface FxRates {
    oficial: FxRate
    blue: FxRate
    mep: FxRate
    ccl: FxRate
    cripto: FxRate
    lastUpdated: Date
}

// Asset types
export type AssetCategory =
    | 'cedear'
    | 'crypto'
    | 'stablecoin'
    | 'fci'
    | 'plazo_fijo'
    | 'wallet'
    | 'cash'

export interface Asset {
    id: string
    category: AssetCategory
    symbol: string
    name: string
    amount: number
    nativeCurrency: Currency
    platform?: string
    avgCost?: number
    currentPrice?: number
}

export interface Holding extends Asset {
    valueArs: number
    valueUsd: number
    changeToday: number
    changeTodayPercent: number
    pnl: number
    pnlPercent: number
}

// Portfolio
export interface CategorySummary {
    category: AssetCategory
    label: string
    totalArs: number
    totalUsd: number
    changeToday: number
    changeTodayPercent: number
    items: Holding[]
}

export interface PortfolioSnapshot {
    totalArs: number
    totalUsd: number
    changeToday: number
    changeTodayPercent: number
    liquidityArs: number
    liquidityUsd: number
    pnlToday: number
    pnlTotal: number
    categories: CategorySummary[]
    lastUpdated: Date
}

// Historical data
export interface TimeseriesPoint {
    date: Date
    valueArs: number
    valueUsd: number
}

export type TimeRange = 'day' | 'month' | 'year'

// Market / Ticker
export interface TickerItem {
    symbol: string
    name: string
    price: number
    currency: Currency
    change: number
    changePercent: number
    category: 'cedear' | 'crypto'
}

// Debts
export interface Debt {
    id: string
    description: string
    creditor: string
    amount: number
    currency: Currency
    dueDate: Date
    isPaid: boolean
}

export interface DebtSummary {
    totalArs: number
    totalUsd: number
    nextDue: Debt | null
    items: Debt[]
}

// User preferences
export interface UserPreferences {
    fxConversion: 'mep' | 'ccl'
    autoRefresh: boolean
    theme: 'light' | 'dark' | 'system'
}
