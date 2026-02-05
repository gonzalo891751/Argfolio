/**
 * Lot Allocation Engine
 *
 * Given open lots and a quantity to sell, allocates cost
 * according to the selected costing method:
 *   PPP      — Weighted average cost (pooled)
 *   FIFO     — First-In, First-Out (oldest lots first)
 *   LIFO     — Last-In, First-Out (newest lots first)
 *   CHEAPEST — Lowest unit cost first (tie-break by date asc)
 *   MANUAL   — User-specified per-lot quantities
 */

import type { LotDetail } from '@/features/portfolioV2/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostingMethod = 'PPP' | 'FIFO' | 'LIFO' | 'CHEAPEST' | 'MANUAL'

export interface AllocationEntry {
    lotId: string
    qty: number
    costUsd: number
}

export interface ManualAllocation {
    lotId: string
    qty: number
}

export interface SaleAllocation {
    allocations: AllocationEntry[]
    totalQtySold: number
    totalCostUsd: number
    totalProceedsUsd: number
    realizedPnlUsd: number
    realizedPnlPct: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Simulate a sale allocation without mutating lots.
 *
 * @param lots       Current open lots (from FIFO engine)
 * @param qtyToSell  Quantity the user wants to sell (capped at total holding)
 * @param priceUsd   Sale price per unit (USD)
 * @param method     Costing method
 * @param manual     Manual allocations (only used when method === 'MANUAL')
 */
export function allocateSale(
    lots: LotDetail[],
    qtyToSell: number,
    priceUsd: number,
    method: CostingMethod,
    manual?: ManualAllocation[],
): SaleAllocation {
    if (lots.length === 0) {
        return emptyAllocation()
    }

    // MANUAL: user-provided per-lot quantities (qty comes from allocations, not qtyToSell)
    if (method === 'MANUAL' && manual && manual.length > 0) {
        return allocateManual(lots, manual, priceUsd)
    }

    const totalHolding = lots.reduce((s, l) => s + l.qty, 0)
    const safeSellQty = Math.min(Math.max(qtyToSell, 0), totalHolding)

    if (safeSellQty <= 0) {
        return emptyAllocation()
    }

    // PPP: cost = qty × weighted-average unit cost
    if (method === 'PPP') {
        return allocatePPP(lots, safeSellQty, priceUsd)
    }

    // FIFO / LIFO / CHEAPEST: sort lots then consume in order
    const sorted = sortLotsForMethod(lots, method === 'MANUAL' ? 'FIFO' : method)
    return allocateOrdered(sorted, safeSellQty, priceUsd)
}

// ---------------------------------------------------------------------------
// Costing Method Label Helpers
// ---------------------------------------------------------------------------

export const COSTING_METHODS: { value: CostingMethod; label: string; short: string; description: string }[] = [
    { value: 'PPP',      label: 'PPP',              short: 'PPP',     description: 'Precio Promedio Ponderado: costo = qty × promedio' },
    { value: 'FIFO',     label: 'PEPS (FIFO)',      short: 'PEPS',    description: 'Primeras Entradas, Primeras Salidas' },
    { value: 'LIFO',     label: 'UEPS (LIFO)',      short: 'UEPS',    description: 'Últimas Entradas, Primeras Salidas' },
    { value: 'CHEAPEST', label: 'Baratos primero',  short: 'Baratos', description: 'Consume lotes con menor precio de compra primero' },
    { value: 'MANUAL',   label: 'Manual',           short: 'Manual',  description: 'Seleccioná qué lotes vender y cuánto' },
]

// ---------------------------------------------------------------------------
// Internal: PPP allocation
// ---------------------------------------------------------------------------

function allocatePPP(lots: LotDetail[], qty: number, priceUsd: number): SaleAllocation {
    const totalQty = lots.reduce((s, l) => s + l.qty, 0)
    const totalCostAll = lots.reduce((s, l) => s + l.totalCostNative, 0)
    const avgCost = totalQty > 0 ? totalCostAll / totalQty : 0

    const costAssigned = qty * avgCost
    const proceeds = qty * priceUsd

    return {
        allocations: [], // PPP doesn't allocate to specific lots
        totalQtySold: qty,
        totalCostUsd: costAssigned,
        totalProceedsUsd: proceeds,
        realizedPnlUsd: proceeds - costAssigned,
        realizedPnlPct: costAssigned > 0 ? (proceeds - costAssigned) / costAssigned : 0,
    }
}

// ---------------------------------------------------------------------------
// Internal: Ordered allocation (FIFO / LIFO / CHEAPEST)
// ---------------------------------------------------------------------------

function sortLotsForMethod(
    lots: LotDetail[],
    method: 'FIFO' | 'LIFO' | 'CHEAPEST',
): LotDetail[] {
    const copy = [...lots]
    switch (method) {
        case 'FIFO':
            return copy.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
        case 'LIFO':
            return copy.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime())
        case 'CHEAPEST':
            return copy.sort((a, b) => {
                const diff = a.unitCostNative - b.unitCostNative
                if (diff !== 0) return diff
                // Tie-break: oldest first
                return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
            })
    }
}

function allocateOrdered(
    sortedLots: LotDetail[],
    qtyToSell: number,
    priceUsd: number,
): SaleAllocation {
    const allocations: AllocationEntry[] = []
    let remaining = qtyToSell

    for (const lot of sortedLots) {
        if (remaining <= 0) break
        const take = Math.min(lot.qty, remaining)
        allocations.push({
            lotId: lot.id,
            qty: take,
            costUsd: take * lot.unitCostNative,
        })
        remaining -= take
    }

    const totalCost = allocations.reduce((s, a) => s + a.costUsd, 0)
    const totalQtySold = allocations.reduce((s, a) => s + a.qty, 0)
    const proceeds = totalQtySold * priceUsd

    return {
        allocations,
        totalQtySold,
        totalCostUsd: totalCost,
        totalProceedsUsd: proceeds,
        realizedPnlUsd: proceeds - totalCost,
        realizedPnlPct: totalCost > 0 ? (proceeds - totalCost) / totalCost : 0,
    }
}

// ---------------------------------------------------------------------------
// Internal: Manual allocation
// ---------------------------------------------------------------------------

function allocateManual(
    lots: LotDetail[],
    manualAllocs: ManualAllocation[],
    priceUsd: number,
): SaleAllocation {
    const lotMap = new Map(lots.map(l => [l.id, l]))
    const allocations: AllocationEntry[] = []

    for (const ma of manualAllocs) {
        const lot = lotMap.get(ma.lotId)
        if (!lot) continue
        const take = Math.min(Math.max(ma.qty, 0), lot.qty)
        if (take <= 0) continue
        allocations.push({
            lotId: lot.id,
            qty: take,
            costUsd: take * lot.unitCostNative,
        })
    }

    const totalCost = allocations.reduce((s, a) => s + a.costUsd, 0)
    const totalQtySold = allocations.reduce((s, a) => s + a.qty, 0)
    const proceeds = totalQtySold * priceUsd

    return {
        allocations,
        totalQtySold,
        totalCostUsd: totalCost,
        totalProceedsUsd: proceeds,
        realizedPnlUsd: proceeds - totalCost,
        realizedPnlPct: totalCost > 0 ? (proceeds - totalCost) / totalCost : 0,
    }
}

// ---------------------------------------------------------------------------
// Internal: Empty result
// ---------------------------------------------------------------------------

function emptyAllocation(): SaleAllocation {
    return {
        allocations: [],
        totalQtySold: 0,
        totalCostUsd: 0,
        totalProceedsUsd: 0,
        realizedPnlUsd: 0,
        realizedPnlPct: 0,
    }
}
