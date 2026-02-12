import type { RubroId } from '@/features/portfolioV2'

// ---------------------------------------------------------------------------
// Results Card — data contract
// ---------------------------------------------------------------------------

export type ResultsPeriodKey = 'TOTAL' | '1D' | '7D' | '30D' | '90D' | '1Y'

export interface Money {
    ars: number | null
    usd: number | null
}

export type ResultsCategoryKey = 'cedears' | 'crypto' | 'fci' | 'wallets' | 'plazos'

export interface ResultsCategoryItem {
    id: string
    title: string
    subtitle?: string
    invested: Money
    value: Money
    pnl: Money
}

export interface ResultsCategoryRow {
    key: ResultsCategoryKey
    rubroId: RubroId
    title: string
    subtitle?: string
    pnl: Money
    items: ResultsCategoryItem[]
    /** Custom column labels for the detail modal (used by wallets) */
    tableLabels?: { col1: string; col2: string; col3: string }
    /** True when wallet TOTAL=0 but yield accounts exist with TNA+balance */
    walletEmptyStateHint?: boolean
    /** True when values are TNA-based estimates, not real movements */
    isEstimated?: boolean
}

export type ResultsSnapshotStatus = 'ok' | 'insufficient' | 'fallback_cost' | 'error'

export interface ResultsMeta {
    snapshotStatus: ResultsSnapshotStatus
    asOfISO?: string
    startISO?: string
    endISO?: string
    note?: string
}

export interface ResultsCardModel {
    periodKey: ResultsPeriodKey
    totals: { pnl: Money }
    categories: ResultsCategoryRow[]
    meta: ResultsMeta
}

export const RESULTS_PERIODS: ResultsPeriodKey[] = ['TOTAL', '1D', '7D', '30D', '90D', '1Y']

export const RESULTS_CATEGORY_CONFIG: Array<{
    key: ResultsCategoryKey
    rubroId: RubroId
    label: string
    sub: string
}> = [
    { key: 'cedears', rubroId: 'cedears', label: 'CEDEARs', sub: 'activos' },
    { key: 'crypto', rubroId: 'crypto', label: 'Cripto', sub: 'activos' },
    { key: 'fci', rubroId: 'fci', label: 'Fondos (FCI)', sub: 'fondos' },
    { key: 'wallets', rubroId: 'wallets', label: 'Billeteras', sub: 'cuentas' },
    { key: 'plazos', rubroId: 'plazos', label: 'Plazos Fijos', sub: 'activos' },
]
