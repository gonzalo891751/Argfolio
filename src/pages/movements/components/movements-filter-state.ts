/**
 * Filter state model for Movimientos V2 (Fase 2).
 * Kept outside the component file so react-refresh stays happy and the
 * pure logic is directly testable.
 */

export type TypeFilter =
    | 'all'
    | 'buy'
    | 'sell'
    | 'transfer'
    | 'swap'
    | 'deposit'
    | 'withdraw'
    | 'interest'
    | 'pf'

export type DatePreset = '30d' | '90d' | 'ytd' | 'all' | 'custom'
export type StatusFilter = 'active' | 'superseded' | 'voided' | 'all'

export interface MovementsFilterState {
    search: string
    type: TypeFilter
    accountId: string | 'all'
    assetKey: string | 'all' // instrumentId or ticker
    datePreset: DatePreset
    dateFrom: string // YYYY-MM-DD (custom)
    dateTo: string   // YYYY-MM-DD (custom)
    status: StatusFilter
}

export const DEFAULT_MOVEMENTS_FILTERS: MovementsFilterState = {
    search: '',
    type: 'all',
    accountId: 'all',
    assetKey: 'all',
    datePreset: '30d',
    dateFrom: '',
    dateTo: '',
    status: 'active',
}

/** Compute the [from, to] ISO range for the current filter state (null = unbounded). */
export function getDateRange(state: MovementsFilterState, now = new Date()): { from: string | null; to: string | null } {
    switch (state.datePreset) {
        case '30d': {
            const from = new Date(now.getTime() - 30 * 86400000)
            return { from: from.toISOString(), to: null }
        }
        case '90d': {
            const from = new Date(now.getTime() - 90 * 86400000)
            return { from: from.toISOString(), to: null }
        }
        case 'ytd': {
            const from = new Date(now.getFullYear(), 0, 1)
            return { from: from.toISOString(), to: null }
        }
        case 'custom': {
            const from = state.dateFrom ? new Date(`${state.dateFrom}T00:00:00`).toISOString() : null
            const to = state.dateTo ? new Date(`${state.dateTo}T23:59:59.999`).toISOString() : null
            return { from, to }
        }
        case 'all':
        default:
            return { from: null, to: null }
    }
}
