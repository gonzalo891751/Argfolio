/**
 * FciHoldingsTable
 * 
 * Displays a table of FCI holdings for a specific account.
 * Similar to CedearHoldingsTable but optimized for FCI fields (VCP, Manager).
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatQty, formatPercent, formatDeltaMoneyARS, formatDeltaMoneyUSD } from '@/lib/format'
import type { AssetRowMetrics } from '@/domain/assets/types'
import type { FciPrice } from '@/hooks/useFciPrices'
import type { FxPair } from '@/domain/types'

interface FciHoldingsTableProps {
    assets: AssetRowMetrics[]
    prices: Map<string, FciPrice>
    mepRate?: FxPair
    onRowClick?: (asset: AssetRowMetrics) => void
}

export function FciHoldingsTable({ assets, prices, mepRate, onRowClick }: FciHoldingsTableProps) {
    const computedRows = useMemo(() => {
        return assets.map(h => {
            const price = prices.get(h.instrumentId)
            const vcpUnit = price?.vcp || 0
            const quantity = h.quantity || 0

            // Native Currency from Price Map (reliable) or Holding
            const currency = price?.currency || h.nativeCurrency || 'ARS'
            const isUSD = currency === 'USD'

            // Current Value logic: Quantity * VCP (Unit)
            const curValNative = quantity * vcpUnit

            // Dual Valuation Rules
            let curValArs = 0
            let curValUsd = 0

            if (isUSD) {
                curValUsd = curValNative
                curValArs = curValUsd * (mepRate?.buy || 0) // Valuation in ARS using MEP Buy (conservative)
            } else {
                curValArs = curValNative
                curValUsd = curValArs / (mepRate?.sell || 1) // Valuation in USD using MEP Sell
            }

            // Invested (Historical)
            const investedArs = h.costArs || 0
            const investedUsd = h.costUsdEq || 0

            // Average Cost Logic
            // If ARS fund: Invested ARS / Quantity
            // If USD fund: Invested USD / Quantity
            // This approximates the "Original Currency Average Cost"
            const avgCost = quantity ? (isUSD ? investedUsd / quantity : investedArs / quantity) : 0

            // PnL Logic
            const pnlArs = curValArs - investedArs
            const pnlUsd = curValUsd - investedUsd
            const pnlPct = investedArs > 0 ? (pnlArs / investedArs) : 0

            return {
                ...h,
                price,
                currency,
                isUSD,
                curValArs,
                curValUsd,
                investedArs,
                investedUsd,
                avgCost,
                pnlArs,
                pnlUsd,
                pnlPct
            }
        }).sort((a, b) => b.curValArs - a.curValArs)
    }, [assets, prices, mepRate])

    // Totals
    const totals = useMemo(() => {
        return computedRows.reduce((acc, row) => ({
            investedArs: acc.investedArs + row.investedArs,
            investedUsd: acc.investedUsd + row.investedUsd,
            valueArs: acc.valueArs + row.curValArs,
            valueUsd: acc.valueUsd + row.curValUsd,
            pnlArs: acc.pnlArs + row.pnlArs,
            pnlUsd: acc.pnlUsd + row.pnlUsd,
        }), { investedArs: 0, investedUsd: 0, valueArs: 0, valueUsd: 0, pnlArs: 0, pnlUsd: 0 })
    }, [computedRows])

    const totalPnlPct = totals.investedArs ? (totals.pnlArs / totals.investedArs) : 0

    return (
        <div className="border rounded-xl number-font overflow-hidden bg-background/50 shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                        <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wider font-medium">
                            {/* 1. Fondo */}
                            <th className="text-left p-4 w-[30%]">Fondo</th>
                            {/* 2. Cuotapartes */}
                            <th className="text-right p-4">Cuotapartes</th>
                            {/* 3. Costo prom. */}
                            <th className="text-right p-4">Costo prom.</th>
                            {/* 4. Invertido */}
                            <th className="text-right p-4">Invertido</th>
                            {/* 5. VCP actual */}
                            <th className="text-right p-4">VCP actual</th>
                            {/* 6. Valor actual */}
                            <th className="text-right p-4">Valor actual</th>
                            {/* 7. Resultado */}
                            <th className="text-right p-4 w-[15%]">Resultado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {computedRows.map(row => {
                            const pnlColor = row.pnlArs >= 0 ? "text-emerald-500" : "text-rose-500"
                            const pnlUsdColor = row.pnlUsd >= 0 ? "text-emerald-500" : "text-rose-500"

                            return (
                                <tr
                                    key={row.instrumentId}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors group"
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {/* 1. Fondo */}
                                    <td className="p-4 align-top">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                                                {row.name}
                                            </span>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                <span>{row.price?.manager || 'FCI'}</span>
                                                {row.price?.category && (
                                                    <span className="px-1.5 py-0 rounded bg-muted text-[10px] uppercase border border-border/50">
                                                        {row.price.category}
                                                    </span>
                                                )}
                                                {row.isUSD && (
                                                    <span className="px-1.5 py-0 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold">
                                                        USD
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* 2. Cuotapartes */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <span className="font-numeric font-medium text-foreground">
                                            {formatQty(row.quantity)}
                                        </span>
                                    </td>

                                    {/* 3. Costo prom. */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <span className="font-numeric text-muted-foreground">
                                            {row.isUSD ? formatMoneyUSD(row.avgCost) : formatMoneyARS(row.avgCost)}
                                        </span>
                                    </td>

                                    {/* 4. Invertido */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="font-numeric">
                                                {formatMoneyARS(row.investedArs)}
                                            </span>
                                            <span className="font-numeric text-xs text-sky-500">
                                                {formatMoneyUSD(row.investedUsd)}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 5. VCP actual */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="font-numeric font-medium">
                                                {row.isUSD ? formatMoneyUSD(row.price?.vcp || 0) : formatMoneyARS(row.price?.vcp || 0)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/60 font-mono">
                                                {row.price?.date ? new Date(row.price.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '-'}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 6. Valor actual */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <span className="font-numeric font-bold text-foreground">
                                                {formatMoneyARS(row.curValArs)}
                                            </span>
                                            <span className="font-numeric text-xs text-sky-500">
                                                {formatMoneyUSD(row.curValUsd)}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 7. Resultado */}
                                    <td className="p-4 text-right align-top pt-4">
                                        <div className="flex flex-col items-end gap-0.5">
                                            <div className={cn("flex items-center justify-end gap-1.5 font-numeric font-medium", pnlColor)}>
                                                {formatDeltaMoneyARS(row.pnlArs)}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className={cn("font-numeric opacity-90", pnlUsdColor)}>
                                                    {formatDeltaMoneyUSD(row.pnlUsd)}
                                                </span>
                                                <span className={cn("font-bold", pnlColor)}>
                                                    {formatPercent(row.pnlPct)}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    {/* Footer Totals */}
                    <tfoot className="border-t-2 border-border/50 bg-muted/20">
                        <tr className="font-medium">
                            <td colSpan={3} className="text-right p-4 text-muted-foreground text-xs uppercase tracking-wider">Total FCI</td>
                            {/* Invertido Total */}
                            <td className="text-right p-4">
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-numeric text-muted-foreground">{formatMoneyARS(totals.investedArs)}</span>
                                    <span className="font-numeric text-xs text-sky-500/70">{formatMoneyUSD(totals.investedUsd)}</span>
                                </div>
                            </td>
                            <td></td>
                            {/* Valor Actual Total */}
                            <td className="text-right p-4">
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-numeric text-foreground font-bold">{formatMoneyARS(totals.valueArs)}</span>
                                    <span className="font-numeric text-xs text-sky-500">{formatMoneyUSD(totals.valueUsd)}</span>
                                </div>
                            </td>
                            {/* Resultado Total */}
                            <td className="text-right p-4">
                                <div className="flex flex-col items-end gap-0.5">
                                    <span className={cn("font-numeric font-bold", totals.pnlArs >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                        {formatDeltaMoneyARS(totals.pnlArs)}
                                    </span>
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className={cn("font-numeric opacity-90", totals.pnlUsd >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                            {formatDeltaMoneyUSD(totals.pnlUsd)}
                                        </span>
                                        <span className={cn("font-bold", totalPnlPct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                            {formatPercent(totalPnlPct)}
                                        </span>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
