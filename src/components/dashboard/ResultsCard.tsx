import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Clock, X, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDeltaMoneyARS, formatDeltaMoneyUSD, formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import type { Snapshot } from '@/domain/types'
import type { PortfolioV2 } from '@/features/portfolioV2'
import { computeResultsCardModel } from '@/features/dashboardV2/results-service'
import {
    RESULTS_PERIODS,
    type ResultsCardModel,
    type ResultsCategoryRow,
    type ResultsPeriodKey,
} from '@/features/dashboardV2/results-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pnlColor(value: number | null): string {
    if (value === null) return 'text-slate-400'
    if (value > 0.01) return 'text-emerald-400'
    if (value < -0.01) return 'text-rose-400'
    return 'text-slate-400'
}

function pnlColorSecondary(value: number | null): string {
    if (value === null) return 'text-slate-500'
    if (value > 0.01) return 'text-emerald-400/80'
    if (value < -0.01) return 'text-rose-400/80'
    return 'text-slate-500'
}

function formatPnlArs(value: number | null): string {
    if (value === null) return 'N/A'
    return formatDeltaMoneyARS(value)
}

function formatPnlUsd(value: number | null): string {
    if (value === null) return 'N/A'
    return formatDeltaMoneyUSD(value)
}

function statusBadge(status: ResultsCardModel['meta']['snapshotStatus']) {
    switch (status) {
        case 'ok':
            return { label: 'Snapshot OK', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
        case 'fallback_cost':
            return { label: 'Desde Costo', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
        case 'insufficient':
            return { label: 'Datos Insuficientes', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
        case 'error':
            return { label: 'Error', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' }
    }
}

function categoryInitial(title: string): string {
    return title.charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ResultsCardProps {
    portfolio: PortfolioV2
    snapshots: Snapshot[]
}

export function ResultsCard({ portfolio, snapshots }: ResultsCardProps) {
    const [periodKey, setPeriodKey] = useState<ResultsPeriodKey>('TOTAL')
    const [selectedCategory, setSelectedCategory] = useState<ResultsCategoryRow | null>(null)

    const model = useMemo(() => {
        if (portfolio.isLoading) return null
        return computeResultsCardModel({ portfolio, snapshots, periodKey })
    }, [portfolio, snapshots, periodKey])

    if (!model) return null

    const badge = statusBadge(model.meta.snapshotStatus)

    return (
        <>
            <section className="glass-panel rounded-2xl p-6 shadow-lg relative overflow-hidden">
                {/* Decorative glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none -translate-y-1/2 translate-x-1/2" />

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 relative z-10">
                    <div>
                        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                            Resultados
                            <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border uppercase transition-colors',
                                badge.cls,
                            )}>
                                {badge.label}
                            </span>
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            {model.meta.snapshotStatus === 'ok'
                                ? 'P&L excluyendo movimientos.'
                                : model.meta.note ?? 'Basado en snapshots disponibles.'}
                        </p>
                    </div>

                    {/* Period toggles */}
                    <div className="flex bg-slate-950/50 p-1 rounded-lg border border-white/10 w-full sm:w-auto overflow-x-auto hide-scrollbar">
                        {RESULTS_PERIODS.map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriodKey(p)}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all w-full sm:w-auto shrink-0',
                                    periodKey === p
                                        ? 'font-bold bg-white/10 text-white shadow-sm'
                                        : 'text-slate-400 hover:text-white',
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main metric */}
                <div className="mb-8 relative z-10">
                    <div className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-widest">P&L Neto</div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-baseline gap-3">
                            <h3 className={cn(
                                'font-mono text-4xl sm:text-5xl font-bold tracking-tight',
                                pnlColor(model.totals.pnl.ars),
                            )}>
                                {formatPnlArs(model.totals.pnl.ars)}
                            </h3>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h4 className={cn(
                                'font-mono text-xl sm:text-2xl font-semibold tracking-tight',
                                pnlColorSecondary(model.totals.pnl.usd),
                            )}>
                                {formatPnlUsd(model.totals.pnl.usd)}
                            </h4>
                        </div>
                    </div>

                    {model.meta.startISO && (
                        <div className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            Desde: <span className="font-mono text-slate-400">{model.meta.startISO}</span>
                        </div>
                    )}
                </div>

                {/* Breakdown list */}
                <div className="space-y-1 relative z-10">
                    <div className="flex justify-between items-end mb-3 px-2">
                        <h4 className="text-xs font-display font-semibold text-slate-400 uppercase tracking-wider">Desglose por rubro</h4>
                        <span className="text-[10px] text-slate-500 font-mono">Click para ver detalle</span>
                    </div>

                    <div className="bg-slate-900/30 rounded-xl border border-white/5 overflow-hidden flex flex-col divide-y divide-white/5">
                        {model.categories.map((cat) => (
                            <CategoryRow
                                key={cat.key}
                                category={cat}
                                isCrypto={cat.key === 'crypto'}
                                onClick={() => setSelectedCategory(cat)}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {selectedCategory && (
                <CategoryDetailModal
                    category={selectedCategory}
                    periodKey={model.periodKey}
                    onClose={() => setSelectedCategory(null)}
                />
            )}
        </>
    )
}

// ---------------------------------------------------------------------------
// Category Row (breakdown list item)
// ---------------------------------------------------------------------------

function CategoryRow({
    category,
    isCrypto,
    onClick,
}: {
    category: ResultsCategoryRow
    isCrypto: boolean
    onClick: () => void
}) {
    const arsStr = formatPnlArs(category.pnl.ars)
    const usdStr = formatPnlUsd(category.pnl.usd)
    const colorArs = pnlColor(category.pnl.ars)
    const colorUsd = pnlColor(category.pnl.usd)
    const hasPositiveBar = (category.pnl.ars ?? 0) > 0.01
    const hasNegativeBar = (category.pnl.ars ?? 0) < -0.01

    // For crypto, USD line is primary and ARS is secondary (inverted order)
    const primaryStr = isCrypto ? usdStr : arsStr
    const secondaryStr = isCrypto ? arsStr : usdStr
    const primaryColor = isCrypto ? colorUsd : colorArs
    const secondaryColor = isCrypto ? colorArs : colorUsd

    return (
        <button
            className="w-full text-left flex items-center justify-between p-3 sm:px-4 hover:bg-white/[0.04] transition-colors focus:outline-none focus:bg-white/[0.06] group"
            onClick={onClick}
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-white/5 group-hover:border-white/20 transition-colors">
                    <span className="font-display font-medium text-xs">
                        {categoryInitial(category.title)}
                    </span>
                </div>
                <div>
                    <div className="text-sm font-medium text-white">{category.title}</div>
                    {category.subtitle && (
                        <div className="text-xs text-slate-500">{category.subtitle}</div>
                    )}
                </div>
            </div>
            <div className="text-right">
                <div className={cn('font-mono text-sm sm:text-base font-medium', primaryColor)}>
                    {primaryStr}
                </div>
                <div className={cn('font-mono text-[10px] sm:text-xs mt-0.5 opacity-80', secondaryColor)}>
                    {secondaryStr}
                </div>
                {/* Mini bar indicator */}
                <div className="h-1 w-full bg-slate-800 mt-1.5 rounded overflow-hidden flex justify-end">
                    <div
                        className={cn(
                            'h-full',
                            hasPositiveBar ? 'bg-emerald-500/50' : hasNegativeBar ? 'bg-rose-500/50' : 'bg-transparent',
                        )}
                        style={{ width: hasPositiveBar || hasNegativeBar ? '100%' : '0%' }}
                    />
                </div>
            </div>
        </button>
    )
}

// ---------------------------------------------------------------------------
// Category Detail Modal
// ---------------------------------------------------------------------------

function CategoryDetailModal({
    category,
    periodKey,
    onClose,
}: {
    category: ResultsCategoryRow
    periodKey: ResultsPeriodKey
    onClose: () => void
}) {
    const [mounted, setMounted] = useState(false)
    const [active, setActive] = useState(false)

    useEffect(() => {
        setMounted(true)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setActive(true))
        })
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    const handleClose = useCallback(() => {
        setActive(false)
        setTimeout(onClose, 300)
    }, [onClose])

    if (!mounted) return null

    const subtotalPnlArs = category.items.reduce((sum, item) => sum + (item.pnl.ars ?? 0), 0)
    const subtotalPnlUsd = category.items.reduce((sum, item) => sum + (item.pnl.usd ?? 0), 0)
    const isCrypto = category.key === 'crypto'

    return createPortal(
        <div
            className={cn(
                'fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300',
                active ? 'opacity-100' : 'opacity-0',
            )}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Content */}
            <div
                className={cn(
                    'relative bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col transition-transform duration-300',
                    active ? 'scale-100' : 'scale-95',
                )}
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center bg-slate-800/50 shrink-0 rounded-t-2xl">
                    <div>
                        <h3 className="font-display font-bold text-lg text-white">
                            Detalle: {category.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {category.tableLabels
                                ? `${category.tableLabels.col3} = ${category.tableLabels.col2} - ${category.tableLabels.col1} | Periodo: ${periodKey}`
                                : `P&L = Valor Actual - Invertido | Periodo: ${periodKey}`}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-white p-2 rounded-md hover:bg-white/10 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-0 overflow-y-auto flex-1 bg-[#0B1121]/50">
                    {category.items.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                            <p>Sin datos de activos para este rubro.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-md z-10 border-b border-white/10 shadow-sm">
                                <tr className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                                    <th className="py-4 px-6 font-medium">Activo</th>
                                    <th className="py-4 px-6 font-medium text-right">{category.tableLabels?.col1 ?? 'Invertido'}</th>
                                    <th className="py-4 px-6 font-medium text-right">{category.tableLabels?.col2 ?? 'Actual'}</th>
                                    <th className="py-4 px-6 font-medium text-right">{category.tableLabels?.col3 ?? 'Resultado (P&L)'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                                {category.items.map((item) => {
                                    const color = pnlColor(item.pnl.ars)
                                    const colorUsd = pnlColor(item.pnl.usd)

                                    return (
                                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="font-medium text-white">{item.title}</div>
                                                {item.subtitle && (
                                                    <div className="text-xs text-slate-500 mt-1">{item.subtitle}</div>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                {isCrypto ? (
                                                    <>
                                                        <div className="font-mono text-sm text-slate-300">{formatMoneyUSD(item.invested.usd)}</div>
                                                        <div className="font-mono text-xs text-slate-500 mt-1">{formatMoneyARS(item.invested.ars)}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="font-mono text-sm text-slate-300">{formatMoneyARS(item.invested.ars)}</div>
                                                        <div className="font-mono text-xs text-slate-500 mt-1">{formatMoneyUSD(item.invested.usd)}</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                {isCrypto ? (
                                                    <>
                                                        <div className="font-mono text-sm text-slate-300">{formatMoneyUSD(item.value.usd)}</div>
                                                        <div className="font-mono text-xs text-slate-500 mt-1">{formatMoneyARS(item.value.ars)}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="font-mono text-sm text-slate-300">{formatMoneyARS(item.value.ars)}</div>
                                                        <div className="font-mono text-xs text-slate-500 mt-1">{formatMoneyUSD(item.value.usd)}</div>
                                                    </>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                {isCrypto ? (
                                                    <>
                                                        <div className={cn('font-mono text-sm font-medium', colorUsd)}>
                                                            {formatPnlUsd(item.pnl.usd)}
                                                        </div>
                                                        <div className={cn('font-mono text-xs mt-1', color)}>
                                                            {formatPnlArs(item.pnl.ars)}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className={cn('font-mono text-sm font-medium', color)}>
                                                            {formatPnlArs(item.pnl.ars)}
                                                        </div>
                                                        <div className={cn('font-mono text-xs mt-1', colorUsd)}>
                                                            {formatPnlUsd(item.pnl.usd)}
                                                        </div>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-[#0f172a] border-t border-white/10 shrink-0 rounded-b-2xl">
                    <div className="flex justify-between items-center">
                        <div className="text-sm font-display text-slate-400 uppercase tracking-widest font-semibold">
                            Subtotal Rubro
                        </div>
                        <div className="text-right">
                            {isCrypto ? (
                                <>
                                    <div className={cn('font-mono text-lg font-bold', pnlColor(subtotalPnlUsd))}>
                                        {formatPnlUsd(subtotalPnlUsd)}
                                    </div>
                                    <div className={cn('font-mono text-sm font-medium mt-1', pnlColor(subtotalPnlArs))}>
                                        {formatPnlArs(subtotalPnlArs)}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className={cn('font-mono text-lg font-bold', pnlColor(subtotalPnlArs))}>
                                        {formatPnlArs(subtotalPnlArs)}
                                    </div>
                                    <div className={cn('font-mono text-sm font-medium mt-1', pnlColor(subtotalPnlUsd))}>
                                        {formatPnlUsd(subtotalPnlUsd)}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
