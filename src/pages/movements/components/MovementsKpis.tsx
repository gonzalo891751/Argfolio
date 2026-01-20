import { useMemo } from 'react'
import { TrendingUp, TrendingDown, ArrowDownRight } from 'lucide-react'
import type { Movement } from '@/domain/types'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'

interface MovementsKpisProps {
    movements: Movement[]
    fxMep?: number
}

export function MovementsKpis({ movements, fxMep = 1180 }: MovementsKpisProps) {
    const stats = useMemo(() => {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

        const thisMonthMovements = movements.filter(
            m => new Date(m.datetimeISO) >= startOfMonth
        )

        const buys = thisMonthMovements.filter(m => m.type === 'BUY' && m.assetClass !== 'pf')
        const sells = thisMonthMovements.filter(m => m.type === 'SELL' && m.assetClass !== 'pf')

        const buyTotalARS = buys.reduce((acc, m) => {
            if (m.tradeCurrency === 'ARS') return acc + m.totalAmount
            return acc + m.totalAmount * (m.fxAtTrade ?? fxMep)
        }, 0)

        const sellTotalARS = sells.reduce((acc, m) => {
            if (m.tradeCurrency === 'ARS') return acc + m.totalAmount
            return acc + m.totalAmount * (m.fxAtTrade ?? fxMep)
        }, 0)

        const totalFees = thisMonthMovements.reduce((acc, m) => acc + (m.feeAmount ?? 0), 0)
        const avgFeePercent = buyTotalARS + sellTotalARS > 0
            ? (totalFees / (buyTotalARS + sellTotalARS)) * 100
            : 0

        // Collect FX rates used
        const fxUsed = new Map<string, number[]>()
        thisMonthMovements.forEach(m => {
            if (m.fx?.kind && m.fx.kind !== 'NONE') {
                const key = m.fx.kind
                const rates = fxUsed.get(key) || []
                rates.push(m.fx.rate)
                fxUsed.set(key, rates)
            }
        })

        const fxAverages: { label: string; rate: number }[] = []
        fxUsed.forEach((rates, key) => {
            const avg = rates.reduce((a, b) => a + b, 0) / rates.length
            fxAverages.push({ label: key, rate: Math.round(avg) })
        })

        return {
            buyTotalARS,
            buyTotalUSD: buyTotalARS / fxMep,
            sellTotalARS,
            sellTotalUSD: sellTotalARS / fxMep,
            totalFees,
            avgFeePercent,
            fxAverages,
        }
    }, [movements, fxMep])

    const formatK = (value: number) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
        if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
        return value.toFixed(0)
    }

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Purchases */}
            <div className="glass-panel p-4 rounded-xl border-t border-white/10 relative overflow-hidden group hover:border-white/20 transition">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                    <TrendingUp className="w-12 h-12 text-emerald-500" />
                </div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Compras (Mes)
                </div>
                <div className="font-mono text-lg md:text-xl text-white font-medium">
                    $ {formatK(stats.buyTotalARS)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                    {formatMoneyUSD(stats.buyTotalUSD)} equiv.
                </div>
            </div>

            {/* Sales */}
            <div className="glass-panel p-4 rounded-xl border-t border-white/10 relative overflow-hidden group hover:border-white/20 transition">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition">
                    <TrendingDown className="w-12 h-12 text-rose-500" />
                </div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Ventas (Mes)
                </div>
                <div className="font-mono text-lg md:text-xl text-white font-medium">
                    $ {formatK(stats.sellTotalARS)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                    {formatMoneyUSD(stats.sellTotalUSD)} equiv.
                </div>
            </div>

            {/* Commissions */}
            <div className="glass-panel p-4 rounded-xl border-t border-white/10 relative overflow-hidden group hover:border-white/20 transition">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                    Comisiones
                </div>
                <div className="font-mono text-lg md:text-xl text-slate-200 font-medium">
                    {formatMoneyARS(stats.totalFees)}
                </div>
                <div className="text-[10px] text-rose-500 mt-1 flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" />
                    {stats.avgFeePercent.toFixed(2)}% avg
                </div>
            </div>

            {/* FX Used */}
            <div className="glass-panel p-4 rounded-xl border-t border-white/10 flex flex-col justify-center gap-2">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    FX Promedio
                </div>
                <div className="flex flex-wrap gap-2">
                    {stats.fxAverages.length > 0 ? (
                        stats.fxAverages.map(fx => (
                            <span
                                key={fx.label}
                                className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300"
                            >
                                {fx.label} ${fx.rate}
                            </span>
                        ))
                    ) : (
                        <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300">
                            MEP ${Math.round(fxMep)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
