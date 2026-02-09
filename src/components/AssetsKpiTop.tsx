/**
 * AssetsKpiTop — Premium KPI dashboard cards for Mis Activos V2
 *
 * 4 cards: Patrimonio Total, Exposición Moneda, Resultado (P&L), Distribución
 * Matches the Dash.html prototype design (glass-panel, typography, donut SVG).
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatNumberAR, formatMoneyARS, formatMoneyUSD, formatDeltaMoneyARS, formatDeltaMoneyUSD } from '@/lib/format'
import type { PortfolioKPIs, RubroV2, RubroId, FxRatesSnapshot } from '@/features/portfolioV2'
import { computeCurrencyExposureSummary } from '@/features/dashboardV2/currency-exposure'

// ─── Constants ─────────────────────────────────────────────────────────────

const GLASS = 'bg-[rgba(21,30,50,0.7)] backdrop-blur-[12px] border border-white/[0.08] shadow-md rounded-2xl p-6 relative'

const DONUT_CATEGORIES: { rubroIds: RubroId[]; label: string; color: string }[] = [
    { rubroIds: ['wallets', 'frascos'], label: 'Billeteras', color: '#0EA5E9' },
    { rubroIds: ['plazos'], label: 'Plazos Fijos', color: '#3B82F6' },
    { rubroIds: ['cedears'], label: 'CEDEARs', color: '#10B981' },
    { rubroIds: ['crypto'], label: 'Cripto', color: '#F59E0B' },
    { rubroIds: ['fci'], label: 'Fondos', color: '#6366F1' },
]

const CIRCUMFERENCE = 2 * Math.PI * 40 // ≈ 251.327

// ─── Props ─────────────────────────────────────────────────────────────────

interface AssetsKpiTopProps {
    kpis: PortfolioKPIs
    fx: FxRatesSnapshot
    rubros: RubroV2[]
}

// ─── Main Component ────────────────────────────────────────────────────────

export function AssetsKpiTop({ kpis, fx, rubros }: AssetsKpiTopProps) {
    // Exposure calculation (Card 2)
    const exposure = useMemo(() => computeCurrencyExposureSummary(rubros, fx), [rubros, fx])

    // Donut data (Card 4)
    const donutSlices = useMemo(() => {
        const rubroMap = new Map<RubroId, RubroV2>()
        for (const r of rubros) rubroMap.set(r.id, r)

        const raw = DONUT_CATEGORIES.map(cat => {
            let valueUsd = 0
            for (const rid of cat.rubroIds) {
                const r = rubroMap.get(rid)
                if (r) valueUsd += r.totals.usd
            }
            return { label: cat.label, color: cat.color, valueUsd }
        })

        const totalUsd = raw.reduce((s, sl) => s + sl.valueUsd, 0)
        return raw
            .map(sl => ({
                ...sl,
                pct: totalUsd > 0 ? (sl.valueUsd / totalUsd) * 100 : 0,
            }))
            .filter(sl => sl.valueUsd > 0.01)
    }, [rubros])

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <PatrimonioCard kpis={kpis} />
            <ExposicionCard exposure={exposure} />
            <ResultadoCard kpis={kpis} />
            <DistribucionCard slices={donutSlices} />
        </div>
    )
}

// ─── Card 1: Patrimonio Total ──────────────────────────────────────────────

function PatrimonioCard({ kpis }: { kpis: PortfolioKPIs }) {
    return (
        <article className={cn(GLASS, 'group flex flex-col justify-between h-64')}>
            <div>
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-gray-400 font-display text-sm uppercase tracking-wide">
                        Patrimonio Total
                    </h3>
                    <span className="bg-primary/20 text-primary text-[10px] font-mono px-2 py-0.5 rounded-full border border-primary/20">
                        CONSOLIDADO
                    </span>
                </div>

                <div className="mb-2">
                    <span className="text-gray-500 text-2xl font-light mr-1">$</span>
                    <span className="text-4xl font-mono font-bold text-white tracking-tighter">
                        {formatNumberAR(kpis.totalArs)}
                    </span>
                </div>

                <div className="flex items-center gap-2 text-gray-400">
                    <span className="text-sm">≈ US$</span>
                    <span className="font-mono text-lg text-gray-300">
                        {formatNumberAR(kpis.totalUsd)}
                    </span>
                </div>
            </div>

            <div className="mt-auto pt-4 border-t border-white/5">
                <p className="text-xs text-gray-500">
                    Consolidado ARS + USD convertido al TC de referencia (
                    <span className="text-sky-500">MEP</span>).
                </p>
            </div>

            {/* Tooltip */}
            <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 pointer-events-none absolute top-2 right-2 w-64 p-4 bg-[#0B1121]/95 rounded-xl border border-white/10 z-20 shadow-2xl">
                <p className="text-xs text-gray-300 mb-2 font-bold">Cálculo Patrimonio:</p>
                <ul className="text-[10px] text-gray-400 space-y-1 list-disc pl-3">
                    <li>Suma activos en Pesos.</li>
                    <li>Suma activos en Dólares (convertidos a ARS según TC).</li>
                    <li>Total = ARS + (USD × TC).</li>
                </ul>
            </div>
        </article>
    )
}

// ─── Card 2: Exposición Moneda ─────────────────────────────────────────────

interface ExposureData {
    softArs: number
    hardUsd: number
    tcRef: number
    pctSoft: number
    pctHard: number
}

function ExposicionCard({ exposure }: { exposure: ExposureData }) {
    return (
        <article className={cn(GLASS, 'group flex flex-col justify-between h-64')}>
            <div className="w-full">
                <h3 className="text-gray-400 font-display text-sm uppercase tracking-wide mb-6">
                    Exposición Moneda
                </h3>

                <div className="flex justify-between items-end mb-2 font-mono">
                    <div className="text-sky-500">
                        <span className="text-xs">ARS</span>
                        <div className="text-2xl font-bold">{exposure.pctSoft.toFixed(1)}%</div>
                    </div>
                    <div className="text-emerald-500 text-right">
                        <span className="text-xs">USD / HARD</span>
                        <div className="text-2xl font-bold">{exposure.pctHard.toFixed(1)}%</div>
                    </div>
                </div>

                <div className="h-4 w-full bg-[#1E293B] rounded-full overflow-hidden flex">
                    <div
                        className="h-full bg-sky-500 transition-all duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                        style={{ width: `${exposure.pctSoft}%` }}
                    />
                    <div
                        className="h-full bg-emerald-500 transition-all duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
                        style={{ width: `${exposure.pctHard}%` }}
                    />
                </div>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-4 pt-4 border-t border-white/5 text-xs">
                <div>
                    <div className="text-gray-500 mb-1">Total ARS</div>
                    <div className="font-mono text-gray-200">{formatMoneyARS(exposure.softArs)}</div>
                </div>
                <div className="text-right">
                    <div className="text-gray-500 mb-1">Total USD</div>
                    <div className="font-mono text-gray-200">{formatMoneyUSD(exposure.hardUsd)}</div>
                </div>
            </div>

            {/* Tooltip */}
            <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 w-64 p-3 bg-[#0B1121] rounded-xl border border-white/10 z-20 shadow-2xl">
                <div className="text-[10px] text-gray-400">
                    <span className="text-sky-500 font-bold">ARS:</span> Billeteras, PF, FCI Pesos.
                    <br />
                    <span className="text-emerald-500 font-bold">USD:</span> Cash USD, Crypto, CEDEARs.
                </div>
            </div>
        </article>
    )
}

// ─── Card 3: Resultado (P&L) ───────────────────────────────────────────────

function ResultadoCard({ kpis }: { kpis: PortfolioKPIs }) {
    const pnlArs = kpis.pnlUnrealizedArs
    const pnlUsd = kpis.pnlUnrealizedUsd

    const arsState: PnlState = pnlArs > 0.01 ? 'positive' : pnlArs < -0.01 ? 'negative' : 'neutral'
    const usdState: PnlState = pnlUsd > 0.01 ? 'positive' : pnlUsd < -0.01 ? 'negative' : 'neutral'

    return (
        <article className={cn(GLASS, 'group flex flex-col justify-between h-64')}>
            <div>
                <h3 className="text-gray-400 font-display text-sm uppercase tracking-wide mb-4">
                    Resultado (P&L)
                </h3>

                <PnlRow
                    label="En Pesos (ARS)"
                    value={pnlArs}
                    state={arsState}
                    formatter={formatDeltaMoneyARS}
                />

                <PnlRow
                    label="En Dólares (USD)"
                    value={pnlUsd}
                    state={usdState}
                    formatter={formatDeltaMoneyUSD}
                />
            </div>

            {/* Tooltip */}
            <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible translate-y-2 group-hover:translate-y-0 transition-all duration-200 pointer-events-none absolute top-2 right-2 w-48 p-3 bg-[#0B1121] rounded-xl border border-white/10 z-20 shadow-2xl">
                <p className="text-[10px] text-gray-300">
                    Diferencia entre valor actual y costo de adquisición.
                    <br />
                    <span className="text-gray-500">Calculado por separado para activos ARS y USD.</span>
                </p>
            </div>
        </article>
    )
}

type PnlState = 'positive' | 'negative' | 'neutral'

const BADGE: Record<PnlState, { text: string; cls: string }> = {
    positive: { text: 'GANANCIA', cls: 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/20' },
    negative: { text: 'PÉRDIDA', cls: 'bg-rose-500/20 text-rose-500 border border-rose-500/20' },
    neutral: { text: 'NEUTRO', cls: 'bg-gray-800 text-gray-400' },
}

const INDICATOR: Record<PnlState, string> = {
    positive: 'h-8 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
    negative: 'h-8 w-1.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]',
    neutral: 'h-8 w-1 rounded-full bg-gray-700',
}

const VALUE_COLOR: Record<PnlState, string> = {
    positive: 'text-emerald-500',
    negative: 'text-rose-500',
    neutral: 'text-white',
}

function PnlRow({ label, value, state, formatter }: {
    label: string
    value: number
    state: PnlState
    formatter: (v: number) => string
}) {
    const badge = BADGE[state]

    return (
        <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{label}</span>
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', badge.cls)}>
                    {badge.text}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <div className={cn(INDICATOR[state], 'transition-colors duration-300')} />
                <span className={cn('text-2xl font-mono font-medium', VALUE_COLOR[state])}>
                    {formatter(value)}
                </span>
            </div>
        </div>
    )
}

// ─── Card 4: Distribución (Donut) ──────────────────────────────────────────

interface DonutSlice {
    label: string
    color: string
    valueUsd: number
    pct: number
}

function DistribucionCard({ slices }: { slices: DonutSlice[] }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

    const segments = useMemo(() => {
        let offset = 0
        return slices.map(sl => {
            const length = (sl.pct / 100) * CIRCUMFERENCE
            const seg = { length, offset }
            offset += length
            return seg
        })
    }, [slices])

    return (
        <article className={cn(GLASS, 'flex flex-col h-64')}>
            <h3 className="text-gray-400 font-display text-sm uppercase tracking-wide mb-2">
                Distribución
            </h3>

            <div className="flex items-center h-full gap-4">
                {/* Donut SVG */}
                <div className="relative w-32 h-32 flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle
                            cx="50" cy="50" r="40"
                            fill="transparent"
                            stroke="#1E293B"
                            strokeWidth="12"
                        />
                        {segments.map((seg, i) => (
                            <circle
                                key={slices[i].label}
                                cx="50" cy="50" r="40"
                                fill="transparent"
                                stroke={slices[i].color}
                                strokeWidth="12"
                                strokeDasharray={`${seg.length} ${CIRCUMFERENCE}`}
                                strokeDashoffset={-seg.offset}
                                className={cn(
                                    'transition-all duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer',
                                    hoveredIdx !== null && hoveredIdx !== i && 'opacity-40'
                                )}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            />
                        ))}
                    </svg>
                    {/* Center label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {hoveredIdx !== null && slices[hoveredIdx] ? (
                            <div className="text-center">
                                <div className="text-[9px] text-gray-400 truncate max-w-[70px]">
                                    {slices[hoveredIdx].label}
                                </div>
                                <div className="text-sm font-mono font-bold text-white">
                                    {slices[hoveredIdx].pct.toFixed(1)}%
                                </div>
                            </div>
                        ) : (
                            <span className="text-[10px] text-gray-500 font-mono">ASSETS</span>
                        )}
                    </div>
                </div>

                {/* Legend */}
                <div className="flex-1 overflow-y-auto pr-1">
                    <ul className="space-y-2 text-xs">
                        {slices.map((sl, i) => (
                            <li
                                key={sl.label}
                                className="flex justify-between items-center cursor-pointer"
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{
                                            backgroundColor: sl.color,
                                            boxShadow: `0 0 8px ${sl.color}`,
                                        }}
                                    />
                                    <span className={cn(
                                        'text-gray-400 transition-colors',
                                        hoveredIdx === i && 'text-white'
                                    )}>
                                        {sl.label}
                                    </span>
                                </div>
                                <span className="font-mono text-[10px] text-gray-500">
                                    {sl.pct.toFixed(1)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Hover tooltip with USD amount */}
            {hoveredIdx !== null && slices[hoveredIdx] && (
                <div className="absolute top-6 right-6 bg-[#0B1121] border border-white/20 p-2 rounded-lg z-50 text-xs shadow-xl pointer-events-none">
                    <div className="font-bold text-white">{slices[hoveredIdx].label}</div>
                    <div className="font-mono text-gray-300">
                        {formatMoneyUSD(slices[hoveredIdx].valueUsd)}
                    </div>
                    <div className="text-sky-500">{slices[hoveredIdx].pct.toFixed(1)}%</div>
                </div>
            )}
        </article>
    )
}
