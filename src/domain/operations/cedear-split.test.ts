import { describe, it, expect } from 'vitest'
import { buildCedearSplitMovement } from './cedear-split'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { buildFifoLots } from '@/domain/portfolio/fifo'
import { getMovementCashDeltas } from '@/domain/portfolio/cash-ledger'
import type { Movement } from '@/domain/types'

const buy = (id: string, date: string, qty: number, price: number, mep: number): Movement => ({
    id, datetimeISO: date, type: 'BUY', assetClass: 'cedear', instrumentId: 'spy', accountId: 'galicia',
    ticker: 'SPY', quantity: qty, unitPrice: price, tradeCurrency: 'ARS',
    totalAmount: qty * price, netAmount: qty * price, totalARS: qty * price, totalUSD: (qty * price) / mep, fxAtTrade: mep,
})

describe('buildCedearSplitMovement', () => {
    const history = [
        buy('b1', '2025-01-04T12:00:00.000Z', 8, 33_000, 1_200),
        buy('b2', '2025-02-02T12:00:00.000Z', 4, 33_868.375, 1_220),
    ]
    const split = buildCedearSplitMovement({
        accountId: 'galicia', instrumentId: 'spy', symbol: 'SPY', name: 'SPDR S&P 500',
        heldQty: 12, ratio: 3, datetimeISO: '2026-10-30T12:00:00.000Z', fxRate: 1575,
    })

    it('adds the new units at zero cost and never touches cash', () => {
        expect(split.type).toBe('BUY')
        expect(split.quantity).toBe(24)
        expect(split.totalARS).toBe(0)
        expect(split.meta?.splitRatio).toBe(3)
        expect(getMovementCashDeltas(split)).toEqual([])
    })

    it('keeps total cost in pesos and in dollars (average cost)', () => {
        const before = computeAverageCost(history)
        const after = computeAverageCost([...history, split])
        expect(after.quantity).toBe(36)
        expect(after.costBasisArs).toBeCloseTo(before.costBasisArs, 6)
        expect(after.costBasisUsd).toBeCloseTo(before.costBasisUsd, 6)
        expect(after.avgCostArs).toBeCloseTo(before.avgCostArs / 3, 6)
    })

    it('rescales FIFO lots instead of adding a free lot', () => {
        const before = buildFifoLots(history)
        const after = buildFifoLots([...history, split])
        expect(after.lots).toHaveLength(2)
        expect(after.lots.map(l => l.quantity)).toEqual([24, 12])
        expect(after.lots[0].unitCostArs).toBeCloseTo(11_000, 6)
        expect(after.lots[0].fxAtTrade).toBe(1_200)
        expect(after.totalQuantity).toBe(36)
        expect(after.totalCostArs).toBeCloseTo(before.totalCostArs, 6)
        expect(after.totalCostUsd).toBeCloseTo(before.totalCostUsd, 6)
    })

    it('rejects nonsense', () => {
        expect(() => buildCedearSplitMovement({ accountId: 'a', instrumentId: 'i', symbol: 'S', name: 'S', heldQty: 0, ratio: 3, datetimeISO: '' })).toThrow()
        expect(() => buildCedearSplitMovement({ accountId: 'a', instrumentId: 'i', symbol: 'S', name: 'S', heldQty: 1, ratio: 1, datetimeISO: '' })).toThrow()
    })
})
