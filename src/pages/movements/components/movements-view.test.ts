/**
 * Fase 2 — Movimientos V2: filtros reales, agrupación y paginación.
 */

import { describe, it, expect } from 'vitest'
import { filterMovements, buildDisplayRows, paginateRows, movementMatchesType } from './movements-view'
import { DEFAULT_MOVEMENTS_FILTERS, getDateRange, type MovementsFilterState } from './movements-filter-state'
import type { Movement, Instrument, Account } from '@/domain/types'

const NOW = new Date('2026-07-09T12:00:00.000Z')

function mov(overrides: Partial<Movement>): Movement {
    return {
        id: crypto.randomUUID(),
        datetimeISO: '2026-07-01T10:00:00.000Z',
        type: 'BUY',
        accountId: 'binance',
        tradeCurrency: 'USD',
        totalAmount: 100,
        ...overrides,
    }
}

const instruments = new Map<string, Instrument>([
    ['btc', { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'bitcoin' }],
])
const accounts = new Map<string, Account>([
    ['binance', { id: 'binance', name: 'Binance', kind: 'EXCHANGE', defaultCurrency: 'USD' }],
    ['nexo', { id: 'nexo', name: 'Nexo', kind: 'EXCHANGE', defaultCurrency: 'USD' }],
])

describe('getDateRange', () => {
    it('"Últimos 30 días" produce un rango real de 30 días', () => {
        const { from, to } = getDateRange(DEFAULT_MOVEMENTS_FILTERS, NOW)
        expect(from).toBe(new Date(NOW.getTime() - 30 * 86400000).toISOString())
        expect(to).toBeNull()
    })

    it('"Todo" no acota el rango', () => {
        const { from, to } = getDateRange({ ...DEFAULT_MOVEMENTS_FILTERS, datePreset: 'all' }, NOW)
        expect(from).toBeNull()
        expect(to).toBeNull()
    })
})

describe('filterMovements', () => {
    const recent = mov({ id: 'recent', datetimeISO: '2026-07-01T10:00:00.000Z', instrumentId: 'btc' })
    const old = mov({ id: 'old', datetimeISO: '2026-01-01T10:00:00.000Z', instrumentId: 'btc' })
    const nexoDeposit = mov({ id: 'dep', datetimeISO: '2026-07-05T10:00:00.000Z', type: 'DEPOSIT', accountId: 'nexo' })

    it('el filtro de 30 días excluye movimientos viejos (filtro real, no decorativo)', () => {
        const result = filterMovements([recent, old, nexoDeposit], DEFAULT_MOVEMENTS_FILTERS, instruments, accounts, NOW)
        expect(result.map(m => m.id).sort()).toEqual(['dep', 'recent'])
    })

    it('filtra por cuenta', () => {
        const state: MovementsFilterState = { ...DEFAULT_MOVEMENTS_FILTERS, accountId: 'nexo' }
        const result = filterMovements([recent, nexoDeposit], state, instruments, accounts, NOW)
        expect(result.map(m => m.id)).toEqual(['dep'])
    })

    it('filtra por activo (instrumentId)', () => {
        const state: MovementsFilterState = { ...DEFAULT_MOVEMENTS_FILTERS, assetKey: 'btc' }
        const result = filterMovements([recent, nexoDeposit], state, instruments, accounts, NOW)
        expect(result.map(m => m.id)).toEqual(['recent'])
    })

    it('filtra por tipo transferencia y swap', () => {
        const transferOut = mov({ id: 't-out', type: 'TRANSFER_OUT', datetimeISO: '2026-07-02T10:00:00.000Z' })
        const swapLeg = mov({
            id: 's-leg',
            type: 'SELL',
            datetimeISO: '2026-07-02T11:00:00.000Z',
            meta: { operationId: 'op1', operationKind: 'swap' },
        })

        expect(movementMatchesType(transferOut, 'transfer')).toBe(true)
        expect(movementMatchesType(swapLeg, 'swap')).toBe(true)
        expect(movementMatchesType(recent, 'transfer')).toBe(false)

        const state: MovementsFilterState = { ...DEFAULT_MOVEMENTS_FILTERS, type: 'swap' }
        const result = filterMovements([recent, transferOut, swapLeg], state, instruments, accounts, NOW)
        expect(result.map(m => m.id)).toEqual(['s-leg'])
    })

    it('busca por texto libre en ticker, cuenta y notas', () => {
        const withNote = mov({ id: 'note', datetimeISO: '2026-07-03T10:00:00.000Z', notes: 'retiro hacia ledger' })
        const state: MovementsFilterState = { ...DEFAULT_MOVEMENTS_FILTERS, search: 'ledger' }
        const result = filterMovements([recent, withNote], state, instruments, accounts, NOW)
        expect(result.map(m => m.id)).toEqual(['note'])
    })

    it('muestra sólo activos por defecto y permite incluir todo el histórico', () => {
        const posted = mov({ id: 'posted' })
        const superseded = mov({ id: 'superseded', meta: { operationStatus: 'superseded' } })
        const voided = mov({ id: 'voided', meta: { operationStatus: 'voided' } })

        expect(filterMovements(
            [posted, superseded, voided],
            DEFAULT_MOVEMENTS_FILTERS,
            instruments,
            accounts,
            NOW,
        ).map(m => m.id)).toEqual(['posted'])

        expect(filterMovements(
            [posted, superseded, voided],
            { ...DEFAULT_MOVEMENTS_FILTERS, status: 'all' },
            instruments,
            accounts,
            NOW,
        ).map(m => m.id)).toEqual(['posted', 'superseded', 'voided'])
    })
})

describe('buildDisplayRows — agrupación por operación', () => {
    it('las patas con el mismo operationId colapsan en un grupo', () => {
        const opId = 'op-transfer-1'
        const out = mov({
            id: 'out', type: 'TRANSFER_OUT', accountId: 'binance', ticker: 'BTC',
            datetimeISO: '2026-07-01T10:00:00.000Z',
            meta: { operationId: opId, operationKind: 'transfer', legRole: 'source' },
        })
        const inn = mov({
            id: 'in', type: 'TRANSFER_IN', accountId: 'nexo', ticker: 'BTC',
            datetimeISO: '2026-07-01T10:00:00.000Z',
            meta: { operationId: opId, operationKind: 'transfer', legRole: 'destination' },
        })
        const single = mov({ id: 'single', datetimeISO: '2026-07-02T10:00:00.000Z' })

        const rows = buildDisplayRows([out, inn, single])
        expect(rows).toHaveLength(2)
        expect(rows[0].kind).toBe('single') // más reciente primero
        expect(rows[1].kind).toBe('group')
        if (rows[1].kind === 'group') {
            expect(rows[1].group.legs).toHaveLength(2)
            expect(rows[1].group.kind).toBe('transfer')
        }
    })

    it('las transferencias legacy de billeteras (meta.transferGroupId) también se agrupan', () => {
        const gid = 'legacy-wallet-transfer'
        const out = mov({
            id: 'w-out', type: 'TRANSFER_OUT', accountId: 'binance',
            meta: { transferGroupId: gid, direction: 'out' },
        })
        const inn = mov({
            id: 'w-in', type: 'TRANSFER_IN', accountId: 'nexo',
            meta: { transferGroupId: gid, direction: 'in' },
        })

        const rows = buildDisplayRows([out, inn])
        expect(rows).toHaveLength(1)
        expect(rows[0].kind).toBe('group')
    })

    it('linkedMovementId groups the referenced parent with its child leg', () => {
        const parent = mov({ id: 'legacy-parent', type: 'SELL', ticker: 'BTC' })
        const child = mov({
            id: 'legacy-child',
            type: 'BUY',
            ticker: 'USDT',
            linkedMovementId: parent.id,
            reason: 'auto_usdt_balance',
        })

        const rows = buildDisplayRows([parent, child])
        expect(rows).toHaveLength(1)
        expect(rows[0].kind).toBe('group')
        if (rows[0].kind === 'group') {
            expect(rows[0].group.operationId).toBe(parent.id)
            expect(rows[0].group.legs.map(leg => leg.id).sort()).toEqual(['legacy-child', 'legacy-parent'])
        }
    })

    it('exposes a mixed status when only one legacy leg was superseded', () => {
        const parent = mov({ id: 'mixed-parent', type: 'SELL', ticker: 'BTC' })
        const child = mov({
            id: 'mixed-child',
            type: 'BUY',
            ticker: 'USDT',
            linkedMovementId: parent.id,
            meta: { operationStatus: 'superseded' },
        })

        const rows = buildDisplayRows([parent, child])
        expect(rows[0].kind).toBe('group')
        if (rows[0].kind === 'group') expect(rows[0].group.status).toBe('mixed')
    })

    it('un groupId huérfano (una sola pata) queda como fila simple', () => {
        const orphan = mov({ id: 'orphan', groupId: 'lonely-group' })
        const rows = buildDisplayRows([orphan])
        expect(rows).toHaveLength(1)
        expect(rows[0].kind).toBe('single')
    })
})

describe('paginateRows', () => {
    it('limita las filas visibles y reporta si hay más', () => {
        const rows = buildDisplayRows(
            Array.from({ length: 120 }, (_, i) =>
                mov({ id: `m${i}`, datetimeISO: new Date(NOW.getTime() - i * 3600000).toISOString() })
            )
        )
        const { visible, hasMore } = paginateRows(rows, 50)
        expect(visible).toHaveLength(50)
        expect(hasMore).toBe(true)

        const all = paginateRows(rows, 200)
        expect(all.visible).toHaveLength(120)
        expect(all.hasMore).toBe(false)
    })
})
