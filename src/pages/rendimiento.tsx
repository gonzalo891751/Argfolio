/**
 * Rendimiento — what each investment returned: what you put in vs what it is
 * worth today. CEDEARs show the dollars you bought (MEP of each purchase) vs
 * the dollars they are worth now, and split the peso gain into "por la acción"
 * and "por el dólar".
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { buildOverview } from '@/features/overview/overview-model'
import { buildPerformance, type PerformanceGroup, type PerformanceRow } from '@/features/overview/performance-model'
import { fmtArs, fmtDateISO, fmtPct, fmtQty, fmtRate, fmtSignedArs, fmtSignedUsd, fmtUsd, toneClass } from '@/features/overview/format'

const ASSET_COLOR = '#6366f1'
const FX_COLOR = '#10b981'

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return <section className={cn('rounded-2xl border bg-card p-5 shadow-sm sm:p-6', className)}>{children}</section>
}

function Result({ row }: { row: PerformanceRow }) {
    const isUsd = row.currency === 'USD'
    const value = isUsd ? row.resultUsd : row.resultArs
    if (row.group === 'intereses' && !(value > 0)) {
        return <p className="shrink-0 text-right text-sm text-muted-foreground">Sin intereses todavía</p>
    }
    return (
        <div className={cn('shrink-0 whitespace-nowrap text-right tabular-nums', toneClass(value))}>
            <p className="font-semibold">{isUsd ? fmtSignedUsd(value) : fmtSignedArs(value)}</p>
            {/* For accounts the TNA says it better than a % over an unknown period */}
            {row.resultPct != null && row.group !== 'intereses' && <p className="text-sm">{fmtPct(row.resultPct)}</p>}
        </div>
    )
}

/** Two-part bar: how much of the peso gain came from the stock and how much from the dollar. */
function SplitBar({ fromAsset, fromFx }: { fromAsset: number; fromFx: number }) {
    const a = Math.max(0, fromAsset)
    const f = Math.max(0, fromFx)
    const total = a + f
    if (total <= 0) return null
    return (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div style={{ width: `${(a / total) * 100}%`, background: ASSET_COLOR }} />
            <div style={{ width: `${(f / total) * 100}%`, background: FX_COLOR }} />
        </div>
    )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
    return (
        <p className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="text-muted-foreground">{label}</span>
            <span className={cn('ml-auto whitespace-nowrap font-medium tabular-nums', toneClass(value))}>{fmtSignedArs(value)}</span>
        </p>
    )
}

function RowShell({ row, children }: { row: PerformanceRow; children: React.ReactNode }) {
    const className = 'block rounded-xl border p-4 transition-colors'
    return row.href ? (
        <Link to={row.href} className={cn(className, 'hover:bg-muted/50')}>{children}</Link>
    ) : (
        <div className={className}>{children}</div>
    )
}

function RowHeader({ row }: { row: PerformanceRow }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="truncate font-semibold">{row.label}</p>
                <p className="text-sm text-muted-foreground">
                    {row.sublabel}
                    {row.qty != null && row.group !== 'intereses' && ` · ${fmtQty(row.qty, 4)}`}
                    {row.sinceISO && ` · desde ${fmtDateISO(row.sinceISO)}`}
                </p>
            </div>
            <Result row={row} />
        </div>
    )
}

function CedearRow({ row }: { row: PerformanceRow }) {
    const c = row.cedear
    return (
        <RowShell row={row}>
            <RowHeader row={row} />
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">Pagaste</p>
                    <p className="font-medium tabular-nums">{fmtArs(row.investedArs)}</p>
                    {c && <p className="text-xs text-muted-foreground tabular-nums">= {fmtUsd(row.investedUsd)} a MEP {fmtRate(c.fxBuy)}</p>}
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-xs text-muted-foreground">Vale hoy</p>
                    <p className="font-medium tabular-nums">{fmtArs(row.valueArs)}</p>
                    {c && <p className="text-xs text-muted-foreground tabular-nums">= {fmtUsd(row.valueUsd)} a MEP {fmtRate(c.fxNow)}</p>}
                </div>
            </div>
            {c ? (
                <div className="mt-3 space-y-1.5">
                    <p className="text-sm">
                        Ganancia en pesos <span className={cn('font-semibold tabular-nums', toneClass(row.resultArs))}>{fmtSignedArs(row.resultArs)}</span>
                    </p>
                    <SplitBar fromAsset={c.fromAssetArs} fromFx={c.fromFxArs} />
                    <Legend color={ASSET_COLOR} label="Por la acción" value={c.fromAssetArs} />
                    <Legend color={FX_COLOR} label={`Por el dólar (${fmtPct(c.fxChangePct)})`} value={c.fromFxArs} />
                </div>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">Falta el dólar del día de alguna compra: el resultado se muestra solo en pesos.</p>
            )}
        </RowShell>
    )
}

function PlainRow({ row }: { row: PerformanceRow }) {
    const isUsd = row.currency === 'USD'
    return (
        <RowShell row={row}>
            <RowHeader row={row} />
            <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                {row.group === 'intereses' ? (
                    <>
                        {row.tna ? `TNA ${fmtPct(row.tna / 100, { signed: false, decimals: 1 })} · ` : ''}
                        Hoy {fmtArs(row.valueArs)}
                        {row.interest30dArs ? ` · en 30 días ${fmtSignedArs(row.interest30dArs)}` : ''}
                    </>
                ) : isUsd ? (
                    <>Pusiste {fmtUsd(row.investedUsd)} → hoy {fmtUsd(row.valueUsd)} · {fmtSignedArs(row.resultArs)} en pesos</>
                ) : (
                    <>Pusiste {fmtArs(row.investedArs)} → hoy {fmtArs(row.valueArs)}</>
                )}
            </p>
        </RowShell>
    )
}

function GroupCard({ group }: { group: PerformanceGroup }) {
    const t = group.totals
    const isUsd = group.currency === 'USD'
    const headline = isUsd ? t.resultUsd : t.resultArs
    const invested = isUsd ? t.investedUsd : t.investedArs
    const subtitle = group.id === 'intereses'
        ? 'Intereses ganados hasta hoy'
        : isUsd
            ? `Pusiste ${fmtUsd(t.investedUsd)} · hoy valen ${fmtUsd(t.valueUsd)}`
            : `Pusiste ${fmtArs(t.investedArs)} · hoy valen ${fmtArs(t.valueArs)}`

    return (
        <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{group.label}</h2>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
                <div className={cn('shrink-0 whitespace-nowrap text-right tabular-nums', toneClass(headline))}>
                    <p className="text-lg font-semibold">{isUsd ? fmtSignedUsd(headline) : fmtSignedArs(headline)}</p>
                    {invested > 0 && group.id !== 'intereses' && <p className="text-sm">{fmtPct(headline / invested)}</p>}
                </div>
            </div>

            {group.cedear && (
                <div className="space-y-1.5 rounded-xl bg-muted/50 p-3">
                    <p className="text-sm">
                        En pesos ganaste <span className={cn('font-semibold tabular-nums', toneClass(t.resultArs))}>{fmtSignedArs(t.resultArs)}</span>.
                        Así se reparte:
                    </p>
                    <SplitBar fromAsset={group.cedear.fromAssetArs} fromFx={group.cedear.fromFxArs} />
                    <Legend color={ASSET_COLOR} label="Porque subió la acción (en dólares)" value={group.cedear.fromAssetArs} />
                    <Legend color={FX_COLOR} label="Porque subió el dólar MEP" value={group.cedear.fromFxArs} />
                </div>
            )}

            <div className="space-y-2">
                {group.rows.map(row => group.id === 'cedears'
                    ? <CedearRow key={row.id} row={row} />
                    : <PlainRow key={row.id} row={row} />)}
            </div>
        </Card>
    )
}

export function RendimientoPage() {
    const portfolio = usePortfolioV2()
    const performance = useMemo(() => buildPerformance(buildOverview(portfolio), portfolio), [portfolio])
    const loading = !portfolio || portfolio.isLoading
    const t = performance.totals

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Rendimiento</h1>
                <p className="text-sm text-muted-foreground">Lo que pusiste en cada inversión contra lo que vale hoy.</p>
            </div>

            {loading ? (
                <Card><div className="h-24 animate-pulse rounded-lg bg-muted" /></Card>
            ) : performance.groups.length === 0 ? (
                <Card>
                    <p className="text-muted-foreground">Todavía no hay inversiones con costo para comparar. Cargá tus compras desde “Cargar”.</p>
                </Card>
            ) : (
                <>
                    <Card className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Ganancia en dólares</p>
                            <p className={cn('whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl', toneClass(t.resultUsd))}>{fmtSignedUsd(t.resultUsd)}</p>
                            {t.investedUsd > 0 && <p className={cn('text-sm tabular-nums', toneClass(t.resultUsd))}>{fmtPct(t.resultUsd / t.investedUsd)}</p>}
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Ganancia en pesos</p>
                            <p className={cn('whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl', toneClass(t.resultArs))}>{fmtSignedArs(t.resultArs)}</p>
                            {t.investedArs > 0 && <p className={cn('text-sm tabular-nums', toneClass(t.resultArs))}>{fmtPct(t.resultArs / t.investedArs)}</p>}
                        </div>
                        <p className="col-span-2 text-xs text-muted-foreground">
                            Sobre {fmtArs(t.investedArs)} invertidos ({fmtUsd(t.investedUsd)} al dólar de cada compra). No incluye efectivo ni dólares sin costo cargado.
                        </p>
                    </Card>

                    {performance.missingPriceCount > 0 && (
                        <Link to="/activos" className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                            <span className="flex-1">
                                {performance.missingPriceCount === 1 ? '1 activo no tiene cotización' : `${performance.missingPriceCount} activos no tienen cotización`} y no se incluye.
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0" />
                        </Link>
                    )}

                    {performance.groups.map(group => <GroupCard key={group.id} group={group} />)}

                    <Link to="/history" className="flex items-center justify-between rounded-2xl border bg-card p-4 text-sm font-medium text-primary shadow-sm hover:bg-muted/50">
                        Ver cómo fue cambiando día a día
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </>
            )}
        </div>
    )
}
