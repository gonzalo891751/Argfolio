/**
 * Inicio — what you have, split in real pesos and real dollars, how it went,
 * and what your pesos will earn. Everything else lives one tap away.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useSnapshots } from '@/hooks/use-snapshots'
import { useMovements } from '@/hooks/use-movements'
import { useRefreshAll } from '@/hooks/use-portfolio'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useQuickEntry } from '@/features/quick-entry/QuickEntryContext'
import { buildOverview, type OverviewBucket, type OverviewPosition } from '@/features/overview/overview-model'
import { buildDailySeries, computePeriodChange } from '@/features/overview/history-model'
import { fmtArs, fmtDayKey, fmtPct, fmtRate, fmtSignedArs, fmtSignedUsd, fmtUsd, toneClass } from '@/features/overview/format'

type Range = 7 | 30 | 90 | 365

const RANGES: Array<{ value: Range; label: string }> = [
    { value: 7, label: '7 días' },
    { value: 30, label: '30 días' },
    { value: 90, label: '3 meses' },
    { value: 365, label: '1 año' },
]

const PESOS_COLOR = '#0ea5e9'
const DOLARES_COLOR = '#10b981'

function readUserName(): string {
    try {
        const first = localStorage.getItem('argfolio.user.firstName')?.trim()
        if (first) return first
        return localStorage.getItem('argfolio.user.name')?.trim().split(' ')[0] ?? ''
    } catch {
        return ''
    }
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return <section className={cn('rounded-2xl border bg-card p-5 shadow-sm sm:p-6', className)}>{children}</section>
}

function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-lg bg-muted', className)} />
}

// ---------------------------------------------------------------------------

function Hero({ totalArs, totalUsd, pesos, dolares }: { totalArs: number; totalUsd: number; pesos: OverviewBucket; dolares: OverviewBucket }) {
    return (
        <Card className="space-y-5">
            <div>
                <p className="text-sm text-muted-foreground">Tenés en total</p>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{fmtArs(totalArs)}</p>
                <p className="mt-1 text-lg text-muted-foreground tabular-nums">≈ {fmtUsd(totalUsd)}</p>
            </div>

            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div style={{ width: `${pesos.sharePct}%`, background: PESOS_COLOR }} />
                <div style={{ width: `${dolares.sharePct}%`, background: DOLARES_COLOR }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <a href="#pesos" className="rounded-xl bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PESOS_COLOR }} />
                        En pesos · {fmtPct(pesos.sharePct / 100, { signed: false, decimals: 0 })}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{fmtArs(pesos.totalArs)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">≈ {fmtUsd(pesos.totalUsd)}</p>
                </a>
                <a href="#dolares" className="rounded-xl bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: DOLARES_COLOR }} />
                        En dólares · {fmtPct(dolares.sharePct / 100, { signed: false, decimals: 0 })}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{fmtUsd(dolares.totalUsd)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">≈ {fmtArs(dolares.totalArs)}</p>
                </a>
            </div>
        </Card>
    )
}

// ---------------------------------------------------------------------------

function Performance({
    current,
    snapshots,
    movements,
    fx,
}: {
    current: { ars: number; usd: number; fxMep?: number }
    snapshots: ReturnType<typeof useSnapshots>['data']
    movements: ReturnType<typeof useMovements>['data']
    fx: { officialSell: number; mepSell: number; cryptoSell: number }
}) {
    const [range, setRange] = useState<Range>(30)
    const [currency, setCurrency] = useState<'ARS' | 'USD'>('USD')

    const change = useMemo(
        () => computePeriodChange(snapshots ?? [], movements ?? [], current, range, fx),
        [snapshots, movements, current, range, fx],
    )
    const series = useMemo(
        () => buildDailySeries(snapshots ?? [], current, range),
        [snapshots, current, range],
    )
    const chartData = series.map(p => ({ day: p.dateKey, value: currency === 'ARS' ? p.ars : p.usd }))
    const color = currency === 'ARS' ? PESOS_COLOR : DOLARES_COLOR

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Cómo te fue</h2>
                <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
                    {RANGES.map(r => (
                        <button
                            key={r.value}
                            type="button"
                            onClick={() => setRange(r.value)}
                            className={cn('rounded-md px-2.5 py-1', range === r.value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {change ? (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-sm text-muted-foreground">Ganancia en dólares</p>
                            <p className={cn('whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl', toneClass(change.gainUsd))}>{fmtSignedUsd(change.gainUsd)}</p>
                            <p className={cn('text-sm tabular-nums', toneClass(change.gainUsd))}>{fmtPct(change.gainPctUsd)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Ganancia en pesos</p>
                            <p className={cn('whitespace-nowrap text-xl font-semibold tabular-nums sm:text-2xl', toneClass(change.gainArs))}>{fmtSignedArs(change.gainArs)}</p>
                            <p className={cn('text-sm tabular-nums', toneClass(change.gainArs))}>{fmtPct(change.gainPctArs)}</p>
                        </div>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                            Desde el {fmtDayKey(change.fromDateKey)}
                            {change.days < range && ' (es el registro más viejo)'}
                            {Math.abs(change.netFlowsArs) >= 1 && (
                                <> · sin contar {fmtSignedArs(change.netFlowsArs)} que {change.netFlowsArs > 0 ? 'ingresaste' : 'retiraste'}</>
                            )}
                        </p>
                        {change.fxStart && change.fxEnd && (
                            <p>
                                Dólar MEP: {fmtRate(change.fxStart)} → {fmtRate(change.fxEnd)}{' '}
                                <span className="tabular-nums">({fmtPct(change.fxChangePct)})</span>
                            </p>
                        )}
                    </div>
                </>
            ) : (
                <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                    Todavía no hay historial para comparar. Argfolio guarda una foto de tu patrimonio cada día que lo abrís;
                    mañana ya vas a ver cómo te fue.
                </p>
            )}

            <Link to="/rendimiento" className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-sm font-medium hover:bg-muted">
                Cuánto rindió cada inversión
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>

            {chartData.length > 1 && (
                <div>
                    <div className="mb-2 flex justify-end">
                        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
                            {(['USD', 'ARS'] as const).map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCurrency(c)}
                                    className={cn('rounded-md px-2 py-0.5', currency === c ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
                                >
                                    {c === 'USD' ? 'En dólares' : 'En pesos'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="inicio-area" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="day" hide />
                                <YAxis hide domain={['dataMin', 'dataMax']} />
                                <Tooltip
                                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
                                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))', fontSize: 12 }}
                                    labelFormatter={(day: string) => fmtDayKey(day)}
                                    formatter={(value: number) => [currency === 'ARS' ? fmtArs(value) : fmtUsd(value), 'Total']}
                                />
                                <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#inicio-area)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </Card>
    )
}

// ---------------------------------------------------------------------------

function PositionLine({ p, currency }: { p: OverviewPosition; currency: 'ARS' | 'USD' }) {
    const detail = (() => {
        if (p.valueMissing) return <span className="text-amber-600 dark:text-amber-400">Sin cotización</span>
        if (p.pf) return <>Vence {p.pf.daysRemaining > 0 ? `en ${p.pf.daysRemaining} días` : 'hoy'}{p.tna ? ` · TNA ${fmtPct(p.tna / 100, { signed: false, decimals: 1 })}` : ''}</>
        if (p.tna) return <>TNA {fmtPct(p.tna / 100, { signed: false, decimals: 1 })}</>
        if (currency === 'USD' && p.resultUsd != null && Math.abs(p.resultUsd) >= 0.01) {
            return <span className={toneClass(p.resultUsd)}>{fmtSignedUsd(p.resultUsd)} {p.resultPct != null && `(${fmtPct(p.resultPct)})`}</span>
        }
        return p.sublabel
    })()

    const content = (
        <>
            <div className="min-w-0">
                <p className="truncate font-medium">{p.label}</p>
                <p className="truncate text-sm text-muted-foreground">{detail}</p>
            </div>
            <p className="shrink-0 font-medium tabular-nums">
                {p.valueMissing ? '—' : currency === 'ARS' ? fmtArs(p.valueArs) : fmtUsd(p.valueUsd)}
            </p>
        </>
    )

    return p.href ? (
        <Link to={p.href} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">{content}</Link>
    ) : (
        <div className="flex items-center justify-between gap-3 py-2.5">{content}</div>
    )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-muted/50 p-2.5 sm:p-3">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums sm:text-base', tone)}>{value}</p>
        </div>
    )
}

function BucketCard({ bucket }: { bucket: OverviewBucket }) {
    const isPesos = bucket.id === 'pesos'
    const positions = bucket.groups.flatMap(g => g.positions).sort((a, b) => b.valueArs - a.valueArs)
    const top = positions.slice(0, 5)

    return (
        <Card className="space-y-4" >
            <div id={bucket.id} className="scroll-mt-24 flex items-baseline justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: isPesos ? PESOS_COLOR : DOLARES_COLOR }} />
                    {isPesos ? 'Tus pesos' : 'Tus dólares'}
                </h2>
                <p className="text-lg font-semibold tabular-nums">{isPesos ? fmtArs(bucket.totalArs) : fmtUsd(bucket.totalUsd)}</p>
            </div>

            {isPesos ? (
                <div className="grid grid-cols-3 gap-2">
                    <Stat label="Mañana" value={fmtSignedArs(bucket.interestTomorrowArs)} tone={toneClass(bucket.interestTomorrowArs)} />
                    <Stat label="En 30 días" value={fmtSignedArs(bucket.interest30dArs)} tone={toneClass(bucket.interest30dArs)} />
                    <Stat label="Ya ganaste" value={fmtArs(bucket.interestEarnedArs)} />
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <Stat label="Resultado en dólares" value={fmtSignedUsd(bucket.resultUsd)} tone={toneClass(bucket.resultUsd)} />
                    <Stat label="Resultado en pesos" value={fmtSignedArs(bucket.resultArs)} tone={toneClass(bucket.resultArs)} />
                </div>
            )}

            {top.length > 0 ? (
                <div className="divide-y divide-border/60">
                    {top.map(p => <PositionLine key={p.id} p={p} currency={isPesos ? 'ARS' : 'USD'} />)}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">{isPesos ? 'No cargaste pesos todavía.' : 'No cargaste dólares ni inversiones en dólares todavía.'}</p>
            )}

            <Link to={`/activos#${bucket.id}`} className="flex items-center justify-between rounded-lg px-1 text-sm font-medium text-primary">
                {positions.length > top.length ? `Ver los ${positions.length}` : 'Ver detalle'}
                <ArrowRight className="h-4 w-4" />
            </Link>
        </Card>
    )
}

// ---------------------------------------------------------------------------

function EmptyState() {
    const { openQuickEntry } = useQuickEntry()
    return (
        <Card className="space-y-4 text-center">
            <h2 className="text-xl font-semibold">Empecemos por lo que tenés</h2>
            <p className="text-muted-foreground">Cargá tus saldos y tus compras. Las cotizaciones se actualizan solas.</p>
            <div className="mx-auto grid max-w-md gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => openQuickEntry({ mode: 'balance' })} className="rounded-xl border p-4 text-left hover:bg-muted">
                    <p className="font-medium">Una billetera o frasco</p>
                    <p className="text-sm text-muted-foreground">Mercado Pago, Naranja X, banco…</p>
                </button>
                <button type="button" onClick={() => openQuickEntry({ mode: 'trade' })} className="rounded-xl border p-4 text-left hover:bg-muted">
                    <p className="font-medium">Una compra</p>
                    <p className="text-sm text-muted-foreground">Bitcoin, USDT, CEDEARs…</p>
                </button>
            </div>
        </Card>
    )
}

export function InicioPage() {
    const portfolio = usePortfolioV2()
    const { data: snapshots } = useSnapshots()
    const { data: movements } = useMovements()
    const refreshAll = useRefreshAll()
    const { lastRefreshTime } = useAutoRefresh()
    const { openQuickEntry } = useQuickEntry()
    const [refreshing, setRefreshing] = useState(false)
    const name = useMemo(readUserName, [])

    const overview = useMemo(() => buildOverview(portfolio), [portfolio])
    const current = useMemo(
        () => ({ ars: overview.totalArs, usd: overview.totalUsd, fxMep: overview.fx.mep || undefined }),
        [overview.totalArs, overview.totalUsd, overview.fx.mep],
    )
    const fxContext = useMemo(() => ({
        officialSell: portfolio?.fx.officialSell ?? 0,
        mepSell: portfolio?.fx.mepSell ?? 0,
        cryptoSell: portfolio?.fx.cryptoSell ?? 0,
    }), [portfolio?.fx.officialSell, portfolio?.fx.mepSell, portfolio?.fx.cryptoSell])

    const missing = useMemo(
        () => [...overview.pesos.groups, ...overview.dolares.groups].flatMap(g => g.positions).filter(p => p.valueMissing),
        [overview],
    )

    const loading = !portfolio || portfolio.isLoading

    const onRefresh = async () => {
        setRefreshing(true)
        try {
            await refreshAll()
        } finally {
            setRefreshing(false)
        }
    }

    return (
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">{name ? `Hola, ${name}` : 'Tu plata'}</h1>
                    <button type="button" onClick={onRefresh} className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                        {lastRefreshTime
                            ? `Cotizaciones de las ${lastRefreshTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                            : 'Actualizar cotizaciones'}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => openQuickEntry()}
                    className="hidden items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground shadow-sm hover:opacity-90 lg:flex"
                >
                    <Plus className="h-4 w-4" /> Cargar
                </button>
            </div>

            {loading ? (
                <Card className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-3 w-full" />
                    <div className="grid grid-cols-2 gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
                </Card>
            ) : !overview.hasPositions ? (
                <EmptyState />
            ) : (
                <>
                    <Hero totalArs={overview.totalArs} totalUsd={overview.totalUsd} pesos={overview.pesos} dolares={overview.dolares} />

                    {missing.length > 0 && (
                        <Link to="/activos" className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <span className="flex-1">
                                {missing.length === 1 ? `${missing[0].label} no tiene cotización` : `${missing.length} activos no tienen cotización`} y no se suma al total.
                                {' '}Podés cargarle un precio a mano.
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0" />
                        </Link>
                    )}

                    <Performance current={current} snapshots={snapshots} movements={movements} fx={fxContext} />

                    <div className="grid gap-4 md:grid-cols-2">
                        <BucketCard bucket={overview.pesos} />
                        <BucketCard bucket={overview.dolares} />
                    </div>

                    <p className="px-1 text-xs text-muted-foreground">
                        Dólar MEP {fmtRate(overview.fx.mep)} · Oficial {fmtRate(overview.fx.oficial)} · Cripto {fmtRate(overview.fx.cripto)}.
                        Los pesos se pasan a dólares con el dólar de cada cuenta (oficial en billeteras, MEP en brokers, cripto en exchanges).
                    </p>
                </>
            )}
        </div>
    )
}
