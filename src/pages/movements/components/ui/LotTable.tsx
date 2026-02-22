/**
 * Shared LotTable Component
 *
 * Reusable table for displaying FIFO lots during sell operations.
 * Used by CEDEAR, Crypto, and FCI wizards.
 *
 * Shows available lots with per-lot consumption based on the selected
 * costing method (PPP/PEPS/UEPS/Baratos/Manual).
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { allocateSale, type CostingMethod, type ManualAllocation } from '@/domain/portfolio/lot-allocation'
import type { LotDetail } from '@/features/portfolioV2/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LotTableProps {
    lots: LotDetail[]
    qty: number
    costingMethod: CostingMethod
    manualAllocations: ManualAllocation[]
    onManualChange: (allocs: ManualAllocation[]) => void
    currSymbol: string
    /** If true, manual qty inputs allow decimals (e.g. FCI cuotapartes). Default: false (integer only, e.g. CEDEAR) */
    allowDecimalQty?: boolean
    /** Max fraction digits for qty display. Default: 2 */
    qtyFractionDigits?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt2 = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'

const fmtQty = (n: number, fractionDigits: number) =>
    Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: fractionDigits, minimumFractionDigits: 0 }) : '—'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LotTable({
    lots,
    qty,
    costingMethod,
    manualAllocations,
    onManualChange,
    currSymbol,
    allowDecimalQty = false,
    qtyFractionDigits = 2,
}: LotTableProps) {
    // Compute auto-selected lots for FIFO/LIFO/CHEAPEST
    const autoSelected = useMemo(() => {
        if (costingMethod === 'MANUAL' || costingMethod === 'PPP') return new Map<string, number>()
        const alloc = allocateSale(lots, qty, 0, costingMethod)
        const map = new Map<string, number>()
        alloc.allocations.forEach(a => map.set(a.lotId, a.qty))
        return map
    }, [lots, qty, costingMethod])

    const handleManualInput = (lotId: string, value: number, maxQty: number) => {
        const capped = allowDecimalQty
            ? Math.min(Math.max(value, 0), maxQty)
            : Math.min(Math.max(Math.floor(value), 0), Math.floor(maxQty))
        const existing = manualAllocations.filter(a => a.lotId !== lotId)
        if (capped > 0) {
            existing.push({ lotId, qty: capped })
        }
        onManualChange(existing)
    }

    return (
        <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-500 font-mono uppercase">
                    <tr>
                        <th className="px-4 py-2 font-normal">Fecha</th>
                        <th className="px-4 py-2 font-normal text-right">Disp.</th>
                        <th className="px-4 py-2 font-normal text-right">Costo Unit.</th>
                        <th className="px-4 py-2 font-normal text-right">A Vender</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-900/30">
                    {lots.map(lot => {
                        const autoQty = autoSelected.get(lot.id) || 0
                        const manualQty = manualAllocations.find(a => a.lotId === lot.id)?.qty || 0
                        const isConsumed = costingMethod !== 'MANUAL' && costingMethod !== 'PPP' && autoQty > 0
                        const isManualActive = costingMethod === 'MANUAL' && manualQty > 0

                        return (
                            <tr
                                key={lot.id}
                                className={cn(
                                    'transition-colors',
                                    (isConsumed || isManualActive) && 'bg-indigo-500/10'
                                )}
                            >
                                <td className="px-4 py-2 text-slate-300 font-mono">
                                    {new Date(lot.dateISO).toLocaleDateString('es-AR')}
                                </td>
                                <td className="px-4 py-2 text-slate-300 text-right font-mono">
                                    {fmtQty(lot.qty, qtyFractionDigits)}
                                </td>
                                <td className="px-4 py-2 text-slate-400 text-right font-mono text-[10px]">
                                    {currSymbol} {fmt2(lot.unitCostNative)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    {costingMethod === 'MANUAL' ? (
                                        <input
                                            type="number"
                                            min="0"
                                            max={allowDecimalQty ? lot.qty : Math.floor(lot.qty)}
                                            step={allowDecimalQty ? 'any' : '1'}
                                            value={manualQty || ''}
                                            onChange={e => handleManualInput(
                                                lot.id,
                                                parseFloat(e.target.value) || 0,
                                                lot.qty,
                                            )}
                                            className="w-20 bg-slate-950 border border-white/10 rounded px-2 py-1 text-right text-white text-xs focus:border-indigo-500 focus:outline-none"
                                        />
                                    ) : isConsumed ? (
                                        <span className="text-indigo-400 font-bold">
                                            -{fmtQty(autoQty, qtyFractionDigits)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-600">-</span>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
