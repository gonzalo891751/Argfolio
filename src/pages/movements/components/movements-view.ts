/**
 * Pure view-model logic for Movimientos V2 (Fase 2):
 * filtering (date / account / asset / type / text), operation grouping
 * and pagination. Extracted from the page component to be testable.
 */

import type { Movement, Instrument, Account } from '@/domain/types'
import { getMovementStatus, groupMovementsByOperation, type OperationGroup } from '@/domain/operations/operation'
import { getDateRange, type MovementsFilterState, type TypeFilter } from './movements-filter-state'

export type DisplayRow =
    | { kind: 'single'; movement: Movement; datetimeISO: string }
    | { kind: 'group'; group: OperationGroup; datetimeISO: string }

export function movementMatchesType(m: Movement, type: TypeFilter): boolean {
    switch (type) {
        case 'all':
            return true
        case 'buy':
            return m.type === 'BUY' && m.assetClass !== 'pf'
        case 'sell':
            return m.type === 'SELL' && m.assetClass !== 'pf'
        case 'transfer':
            return m.type === 'TRANSFER_IN'
                || m.type === 'TRANSFER_OUT'
                || m.meta?.operationKind === 'transfer'
        case 'swap':
            return m.meta?.operationKind === 'swap'
        case 'deposit':
            return m.type === 'DEPOSIT'
        case 'withdraw':
            return m.type === 'WITHDRAW'
        case 'interest':
            return m.type === 'INTEREST' || m.type === 'DIVIDEND'
        case 'pf':
            return m.assetClass === 'pf'
        default:
            return true
    }
}

export function filterMovements(
    movements: Movement[],
    state: MovementsFilterState,
    instruments: Map<string, Instrument>,
    accounts: Map<string, Account>,
    now = new Date()
): Movement[] {
    const { from, to } = getDateRange(state, now)
    const searchLower = state.search.trim().toLowerCase()

    return movements.filter(m => {
        const movementStatus = getMovementStatus(m)
        if (state.status === 'active' && movementStatus !== 'posted') return false
        if (state.status === 'superseded' && movementStatus !== 'superseded') return false
        if (state.status === 'voided' && movementStatus !== 'voided') return false

        // Date range
        if (from && m.datetimeISO < from) return false
        if (to && m.datetimeISO > to) return false

        // Account
        if (state.accountId !== 'all' && m.accountId !== state.accountId) return false

        // Asset (instrumentId or ticker fallback)
        if (state.assetKey !== 'all') {
            const matchesInstrument = m.instrumentId === state.assetKey
            const instrument = instruments.get(state.assetKey)
            const matchesTicker = instrument != null && m.ticker != null
                && m.ticker.toUpperCase() === instrument.symbol.toUpperCase()
            if (!matchesInstrument && !matchesTicker) return false
        }

        // Type
        if (!movementMatchesType(m, state.type)) return false

        // Free text
        if (searchLower) {
            const instrument = m.instrumentId ? instruments.get(m.instrumentId) : null
            const account = accounts.get(m.accountId)
            const haystack = [
                instrument?.symbol,
                instrument?.name,
                account?.name,
                m.ticker,
                m.assetName,
                m.notes,
                m.meta?.operationId,
                m.meta?.repairPlanId,
            ].filter(Boolean).join(' ').toLowerCase()
            if (!haystack.includes(searchLower)) return false
        }

        return true
    })
}

/**
 * Build display rows: multi-leg operations collapse into one group row,
 * everything else stays as single rows. Sorted by datetime descending.
 */
export function buildDisplayRows(movements: Movement[]): DisplayRow[] {
    const { groups, singles } = groupMovementsByOperation(movements)

    const rows: DisplayRow[] = [
        ...groups.map(group => ({
            kind: 'group' as const,
            group,
            // Groups sort by their most recent leg
            datetimeISO: group.legs[group.legs.length - 1].datetimeISO,
        })),
        ...singles.map(movement => ({
            kind: 'single' as const,
            movement,
            datetimeISO: movement.datetimeISO,
        })),
    ]

    rows.sort((a, b) => new Date(b.datetimeISO).getTime() - new Date(a.datetimeISO).getTime())
    return rows
}

export const MOVEMENTS_PAGE_SIZE = 50

export function paginateRows(rows: DisplayRow[], visibleCount: number): { visible: DisplayRow[]; hasMore: boolean } {
    return {
        visible: rows.slice(0, visibleCount),
        hasMore: rows.length > visibleCount,
    }
}
