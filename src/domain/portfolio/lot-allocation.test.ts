import { describe, it, expect } from 'vitest'
import { allocateSale } from './lot-allocation'
import type { LotDetail } from '@/features/portfolioV2/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLot(overrides: Partial<LotDetail> & { id: string; dateISO: string; qty: number; unitCostNative: number }): LotDetail {
    const totalCost = overrides.qty * overrides.unitCostNative
    return {
        id: overrides.id,
        dateISO: overrides.dateISO,
        qty: overrides.qty,
        unitCostNative: overrides.unitCostNative,
        totalCostNative: totalCost,
        currentValueNative: overrides.currentValueNative ?? totalCost,
        pnlNative: (overrides.currentValueNative ?? totalCost) - totalCost,
        pnlPct: totalCost > 0 ? ((overrides.currentValueNative ?? totalCost) - totalCost) / totalCost : 0,
    }
}

// Shared test lots
const lots: LotDetail[] = [
    makeLot({ id: 'L1', dateISO: '2025-01-15', qty: 0.5, unitCostNative: 40000 }),  // oldest, mid-price
    makeLot({ id: 'L2', dateISO: '2025-06-01', qty: 0.3, unitCostNative: 60000 }),  // mid-date, expensive
    makeLot({ id: 'L3', dateISO: '2025-09-20', qty: 0.2, unitCostNative: 30000 }),  // newest, cheapest
]
// Total qty: 1.0 BTC
// Total cost: 0.5*40000 + 0.3*60000 + 0.2*30000 = 20000 + 18000 + 6000 = 44000
// Avg cost (PPP): 44000 / 1.0 = 44000

const SELL_PRICE = 50000

// ---------------------------------------------------------------------------
// PPP Tests
// ---------------------------------------------------------------------------

describe('allocateSale — PPP', () => {
    it('uses weighted average cost for full sale', () => {
        const result = allocateSale(lots, 1.0, SELL_PRICE, 'PPP')
        expect(result.totalQtySold).toBe(1.0)
        expect(result.totalCostUsd).toBeCloseTo(44000, 2)
        expect(result.totalProceedsUsd).toBeCloseTo(50000, 2)
        expect(result.realizedPnlUsd).toBeCloseTo(6000, 2)
        expect(result.allocations).toHaveLength(0) // PPP = pooled, no individual lot allocation
    })

    it('uses weighted average cost for partial sale', () => {
        const result = allocateSale(lots, 0.5, SELL_PRICE, 'PPP')
        expect(result.totalQtySold).toBe(0.5)
        expect(result.totalCostUsd).toBeCloseTo(22000, 2) // 0.5 * 44000
        expect(result.totalProceedsUsd).toBeCloseTo(25000, 2)
        expect(result.realizedPnlUsd).toBeCloseTo(3000, 2)
    })

    it('caps quantity at total holding', () => {
        const result = allocateSale(lots, 999, SELL_PRICE, 'PPP')
        expect(result.totalQtySold).toBe(1.0)
    })
})

// ---------------------------------------------------------------------------
// FIFO Tests
// ---------------------------------------------------------------------------

describe('allocateSale — FIFO', () => {
    it('consumes oldest lot first (full sale)', () => {
        const result = allocateSale(lots, 1.0, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBe(1.0)
        // L1 (0.5 @ 40k) + L2 (0.3 @ 60k) + L3 (0.2 @ 30k) = all
        expect(result.allocations).toHaveLength(3)
        expect(result.allocations[0].lotId).toBe('L1')
        expect(result.allocations[1].lotId).toBe('L2')
        expect(result.allocations[2].lotId).toBe('L3')
        expect(result.totalCostUsd).toBeCloseTo(44000, 2)
    })

    it('consumes oldest lot first (partial — 0.6 BTC)', () => {
        const result = allocateSale(lots, 0.6, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBeCloseTo(0.6, 8)
        // L1 fully consumed (0.5 @ 40k = 20000) + L2 partially (0.1 @ 60k = 6000)
        expect(result.allocations).toHaveLength(2)
        expect(result.allocations[0]).toEqual({ lotId: 'L1', qty: 0.5, costUsd: 20000 })
        expect(result.allocations[1].lotId).toBe('L2')
        expect(result.allocations[1].qty).toBeCloseTo(0.1, 8)
        expect(result.allocations[1].costUsd).toBeCloseTo(6000, 2)
        expect(result.totalCostUsd).toBeCloseTo(26000, 2)
    })
})

// ---------------------------------------------------------------------------
// LIFO Tests
// ---------------------------------------------------------------------------

describe('allocateSale — LIFO', () => {
    it('consumes newest lot first', () => {
        const result = allocateSale(lots, 0.5, SELL_PRICE, 'LIFO')
        // L3 (newest, 0.2 @ 30k) + L2 (0.3 @ 60k) = 0.5
        expect(result.allocations).toHaveLength(2)
        expect(result.allocations[0].lotId).toBe('L3')
        expect(result.allocations[0].qty).toBe(0.2)
        expect(result.allocations[1].lotId).toBe('L2')
        expect(result.allocations[1].qty).toBe(0.3)
        // Cost: 0.2*30000 + 0.3*60000 = 6000 + 18000 = 24000
        expect(result.totalCostUsd).toBeCloseTo(24000, 2)
    })

    it('handles partial consumption of newest lot', () => {
        const result = allocateSale(lots, 0.1, SELL_PRICE, 'LIFO')
        expect(result.allocations).toHaveLength(1)
        expect(result.allocations[0].lotId).toBe('L3')
        expect(result.allocations[0].qty).toBe(0.1)
        expect(result.allocations[0].costUsd).toBeCloseTo(3000, 2)
    })
})

// ---------------------------------------------------------------------------
// CHEAPEST Tests
// ---------------------------------------------------------------------------

describe('allocateSale — CHEAPEST (Baratos primero)', () => {
    it('consumes cheapest lot first', () => {
        const result = allocateSale(lots, 0.5, SELL_PRICE, 'CHEAPEST')
        // Sorted by unitCost asc: L3 (30k), L1 (40k), L2 (60k)
        // L3 (0.2 @ 30k) + L1 (0.3 @ 40k) = 0.5
        expect(result.allocations).toHaveLength(2)
        expect(result.allocations[0].lotId).toBe('L3')
        expect(result.allocations[0].qty).toBe(0.2)
        expect(result.allocations[1].lotId).toBe('L1')
        expect(result.allocations[1].qty).toBeCloseTo(0.3, 8)
        // Cost: 0.2*30000 + 0.3*40000 = 6000 + 12000 = 18000
        expect(result.totalCostUsd).toBeCloseTo(18000, 2)
    })

    it('tie-break by date asc when same cost', () => {
        const sameCostLots = [
            makeLot({ id: 'A', dateISO: '2025-03-01', qty: 1, unitCostNative: 100 }),
            makeLot({ id: 'B', dateISO: '2025-01-01', qty: 1, unitCostNative: 100 }),
        ]
        const result = allocateSale(sameCostLots, 1, 200, 'CHEAPEST')
        // Same cost — oldest first (B before A)
        expect(result.allocations[0].lotId).toBe('B')
    })
})

// ---------------------------------------------------------------------------
// MANUAL Tests
// ---------------------------------------------------------------------------

describe('allocateSale — MANUAL', () => {
    it('allocates according to user selection', () => {
        const manual = [
            { lotId: 'L2', qty: 0.1 },
            { lotId: 'L3', qty: 0.15 },
        ]
        const result = allocateSale(lots, 0, SELL_PRICE, 'MANUAL', manual)
        expect(result.totalQtySold).toBeCloseTo(0.25, 8)
        expect(result.allocations).toHaveLength(2)
        expect(result.allocations[0]).toEqual({ lotId: 'L2', qty: 0.1, costUsd: 6000 })
        expect(result.allocations[1].lotId).toBe('L3')
        expect(result.allocations[1].qty).toBeCloseTo(0.15, 8)
    })

    it('caps per-lot qty at lot holding', () => {
        const manual = [{ lotId: 'L3', qty: 999 }]
        const result = allocateSale(lots, 0, SELL_PRICE, 'MANUAL', manual)
        expect(result.totalQtySold).toBe(0.2) // L3 only has 0.2
    })

    it('ignores unknown lot IDs', () => {
        const manual = [{ lotId: 'NONEXISTENT', qty: 1 }]
        const result = allocateSale(lots, 0, SELL_PRICE, 'MANUAL', manual)
        expect(result.totalQtySold).toBe(0)
        expect(result.allocations).toHaveLength(0)
    })

    it('falls back to FIFO when no manual allocations provided', () => {
        const result = allocateSale(lots, 0.5, SELL_PRICE, 'MANUAL')
        // Without manual, MANUAL falls back to FIFO
        expect(result.allocations[0].lotId).toBe('L1')
    })
})

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('allocateSale — Edge Cases', () => {
    it('returns empty allocation for zero qty', () => {
        const result = allocateSale(lots, 0, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBe(0)
        expect(result.allocations).toHaveLength(0)
    })

    it('returns empty allocation for negative qty', () => {
        const result = allocateSale(lots, -5, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBe(0)
    })

    it('returns empty allocation for empty lots', () => {
        const result = allocateSale([], 1, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBe(0)
    })

    it('calculates PnL percentage correctly', () => {
        // Sell 0.5 @ 50000 via FIFO → L1 (0.5 @ 40000)
        const result = allocateSale(lots, 0.5, SELL_PRICE, 'FIFO')
        // Cost: 20000, Proceeds: 25000, PnL: 5000
        expect(result.realizedPnlPct).toBeCloseTo(0.25, 4) // 25%
    })

    it('handles single lot partial sale', () => {
        const singleLot = [makeLot({ id: 'S1', dateISO: '2025-01-01', qty: 1, unitCostNative: 10000 })]
        const result = allocateSale(singleLot, 0.3, 15000, 'FIFO')
        expect(result.totalQtySold).toBe(0.3)
        expect(result.totalCostUsd).toBeCloseTo(3000, 2)
        expect(result.totalProceedsUsd).toBeCloseTo(4500, 2)
        expect(result.realizedPnlUsd).toBeCloseTo(1500, 2)
    })

    it('handles total liquidation (sell all)', () => {
        const result = allocateSale(lots, 1.0, SELL_PRICE, 'FIFO')
        expect(result.totalQtySold).toBe(1.0)
        expect(result.allocations).toHaveLength(3)
        const allocQtySum = result.allocations.reduce((s, a) => s + a.qty, 0)
        expect(allocQtySum).toBeCloseTo(1.0, 8)
    })
})
