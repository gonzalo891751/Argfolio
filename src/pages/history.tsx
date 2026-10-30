/**
 * Historial — how the patrimonio moved: a chart (total or by type of
 * investment), a month-by-month summary net of deposits and withdrawals, and
 * the recorded days, where a bad capture can be deleted.
 */

import { useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Camera, ChevronDown, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { DeleteConfirmDialog } from '@/components/movements/DeleteConfirmDialog'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useDeleteSnapshot, useSaveSnapshot, useSnapshots } from '@/hooks/use-snapshots'
import { useMovements } from '@/hooks/use-movements'
import { buildOverview } from '@/features/overview/overview-model'
import {
    HISTORY_RUBRO_LABELS,
    buildDailySeries,
    buildMonthlySummary,
    buildRubroSeries,
    findSuspiciousDays,
    isPartialSnapshot,
    usableSnapshots,
    type HistoryRubro,
    type MonthSummary,
} from '@/features/overview/history-model'
import { toSnapshotDateKey } from '@/features/dashboardV2/snapshot-v2'
import { fmtArs, fmtDayKey, fmtPct, fmtRate, fmtSignedArs, fmtSignedUsd, fmtUsd, toneClass } from '@/features/overview/format'
import type { Snapshot } from '@/domain/types'

type Range = 30 | 90 | 365 | 'all'
type View = 'total' | 'rubros'
type Currency = 'USD' | 'ARS'

const RANGES: Array<{ value: Range; label: string }> = [
    { value: 30, label: '30 días' },
    { value: 90, label: '3 meses' },
    { value: 365, label: '1 año' },
    { value: 'all', label: 'Todo' },
]

const RUBRO_COLORS: Record<HistoryRubro, string> = {
    pesos: '#0ea5e9',
    plazos: '#f59e0b',
    fci: '#8b5cf6',
    cedears: '#6366f1',
    crypto: '#10b981',
}
const RUBRO_ORDER: HistoryRubro[] = ['pesos', 'plazos', 'fci', 'cedears', 'crypto']

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function monthLabel(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number)
    return `${MONTH_NAMES[m - 1]} ${y}`
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return <section className={cn('rounded-2xl border bg-card p-5 shadow-sm sm:p-6', className)}>{children}</section>
}

function Chips<T extends string | number>({ value, onChange, options, size = 'sm' }: {
    value: T
    onChange: (value: T) => void
    options: Array<{ value: T; label: string }>
    size?: 'sm' | 'xs'
}) {
    return (
        <div className={cn('flex gap-1 rounded-lg bg-muted p-1', size === 'xs' ? 'text-xs' : 'text-sm')}>
            {options.map(o => (
                <button
                    key={String(o.value)}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn('rounded-md px-2.5 py-1', value === o.value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

const money = (value: number, currency: Currency) => currency === 'ARS' ? fmtArs(value) : fmtUsd(value)
const signed = (value: number, currency: Currency) => currency === 'ARS' ? fmtSignedArs(value) : fmtSignedUsd(value)

const tooltipStyle = {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    color: 'hsl(var(--popover-foreground))',
    fontSize: 12,
}

// ---------------------------------------------------------------------------

function EvolutionCard({
    snapshots,
    current,
    currentRubros,
}: {
    snapshots: Snapshot[]
    current: { ars: number; usd: number; fxMep?: number } | null
    currentRubros: Record<HistoryRubro, { ars: number; usd: number }> | null
}) {
    const [range, setRange] = useState<Range>(90)
    const [view, setView] = useState<View>('total')
    const [currency, setCurrency] = useState<Currency>('USD')

    const series = useMemo(() => buildDailySeries(snapshots, current, range), [snapshots, current, range])
    const fromKey = series[0]?.dateKey

    const rubroData = useMemo(() => {
        const points = buildRubroSeries(snapshots, fromKey)
        const todayKey = toSnapshotDateKey(new Date())
        const rows = points.filter(p => p.dateKey !== todayKey).map(p => ({ day: p.dateKey, ...p.values }))
        if (currentRubros) rows.push({ day: todayKey, ...currentRubros })
        return rows.map(r => ({
            day: r.day,
            ...Object.fromEntries(RUBRO_ORDER.map(k => [k, currency === 'ARS' ? r[k].ars : r[k].usd])),
        }))
    }, [snapshots, fromKey, currentRubros, currency])

    const totalData = series.map(p => ({ day: p.dateKey, value: currency === 'ARS' ? p.ars : p.usd }))
    const first = series[0]
    const last = series[series.length - 1]
    const delta = first && last ? (currency === 'ARS' ? last.ars - first.ars : last.usd - first.usd) : 0
    const base = first ? (currency === 'ARS' ? first.ars : first.usd) : 0
    const visibleRubros = RUBRO_ORDER.filter(k => rubroData.some(r => (r as Record<string, number | string>)[k] as number > 0))

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Evolución</h2>
                <Chips value={range} onChange={setRange} options={RANGES} />
            </div>

            {first && last ? (
                <div>
                    <p className="text-2xl font-semibold tabular-nums">{money(currency === 'ARS' ? last.ars : last.usd, currency)}</p>
                    <p className="text-sm text-muted-foreground">
                        <span className={cn('font-medium tabular-nums', toneClass(delta))}>{signed(delta, currency)}</span>
                        {base > 0 && <span className={cn('tabular-nums', toneClass(delta))}> ({fmtPct(delta / base)})</span>}
                        {' '}desde el {fmtDayKey(first.dateKey)} · incluye lo que ingresaste o retiraste
                    </p>
                </div>
            ) : (
                <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                    Todavía no hay días guardados. Argfolio guarda una foto de tu patrimonio cada día que abrís la app.
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Chips value={view} onChange={setView} size="xs" options={[{ value: 'total', label: 'Total' }, { value: 'rubros', label: 'Por tipo' }]} />
                <Chips value={currency} onChange={setCurrency} size="xs" options={[{ value: 'USD', label: 'En dólares' }, { value: 'ARS', label: 'En pesos' }]} />
            </div>

            {view === 'total' && totalData.length > 1 && (
                <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={totalData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="history-area" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="day" tickFormatter={(d: string) => fmtDayKey(d)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={40} />
                            <YAxis hide domain={['dataMin', 'dataMax']} />
                            <Tooltip
                                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
                                contentStyle={tooltipStyle}
                                labelFormatter={(d: string) => fmtDayKey(d)}
                                formatter={(value: number) => [money(value, currency), 'Total']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#history-area)" isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {view === 'rubros' && rubroData.length > 1 && (
                <>
                    <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={rubroData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                                <XAxis dataKey="day" tickFormatter={(d: string) => fmtDayKey(d)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={40} />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    labelFormatter={(d: string) => fmtDayKey(d)}
                                    formatter={(value: number, key: string) => [money(value, currency), HISTORY_RUBRO_LABELS[key as HistoryRubro]]}
                                />
                                {visibleRubros.map(k => (
                                    <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={RUBRO_COLORS[k]} fill={RUBRO_COLORS[k]} fillOpacity={0.35} isAnimationActive={false} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {visibleRubros.map(k => (
                            <span key={k} className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: RUBRO_COLORS[k] }} />
                                {HISTORY_RUBRO_LABELS[k]}
                            </span>
                        ))}
                    </div>
                </>
            )}
        </Card>
    )
}

// ---------------------------------------------------------------------------

function DayRow({
    snapshot,
    previous,
    suspicious,
    onDelete,
}: {
    snapshot: Snapshot
    previous?: Snapshot
    suspicious: boolean
    onDelete: () => void
}) {
    const change = previous && previous.totalUSD > 0 ? snapshot.totalUSD - previous.totalUSD : null
    const partial = isPartialSnapshot(snapshot)
    return (
        <div className={cn('flex items-center gap-3 rounded-lg px-2 py-2', suspicious && 'bg-amber-500/10')}>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {fmtDayKey(snapshot.dateLocal)}
                    {suspicious && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" /> Salto raro
                        </span>
                    )}
                    {partial && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Faltaban precios</span>}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                    {fmtArs(snapshot.totalARS)}
                    {change != null && <> · <span className={toneClass(change)}>{fmtSignedUsd(change)}</span> vs el día anterior</>}
                </p>
            </div>
            <p className="shrink-0 text-sm font-medium tabular-nums">{fmtUsd(snapshot.totalUSD)}</p>
            <button
                type="button"
                onClick={onDelete}
                className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                aria-label={`Borrar el ${fmtDayKey(snapshot.dateLocal)}`}
                title="Borrar este día"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    )
}

function MonthRow({
    month,
    days,
    previousOf,
    suspicious,
    onDelete,
}: {
    month: MonthSummary
    days: Snapshot[]
    previousOf: Map<string, Snapshot>
    suspicious: Set<string>
    onDelete: (snapshot: Snapshot) => void
}) {
    const [open, setOpen] = useState(false)
    const flagged = days.filter(d => suspicious.has(d.dateLocal)).length
    return (
        <div className="rounded-xl border">
            <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                        {monthLabel(month.monthKey)}
                        {month.isCurrent && <span className="ml-2 text-xs font-normal text-muted-foreground">en curso</span>}
                    </p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                        Terminó en {fmtUsd(month.endUsd)} · {fmtArs(month.endArs)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {/* The comparison runs from the last recorded day before the month, which can be weeks earlier */}
                        {month.comparable && <>Del {fmtDayKey(month.startDateKey)} al {fmtDayKey(month.endDateKey)} · </>}
                        {Math.abs(month.netFlowsArs) >= 1 && <>{month.netFlowsArs > 0 ? 'Ingresaste' : 'Retiraste'} {fmtArs(Math.abs(month.netFlowsArs))} · </>}
                        {month.fxStart && month.fxEnd ? <>MEP {fmtRate(month.fxStart)} → {fmtRate(month.fxEnd)} · </> : null}
                        {month.daysRecorded} {month.daysRecorded === 1 ? 'día guardado' : 'días guardados'}
                        {flagged > 0 && <span className="text-amber-700 dark:text-amber-300"> · {flagged} para revisar</span>}
                    </p>
                </div>
                {month.comparable ? (
                    <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
                        <p className={cn('font-semibold', toneClass(month.gainUsd))}>{fmtSignedUsd(month.gainUsd)}</p>
                        {month.gainPctUsd != null && <p className={cn('text-sm', toneClass(month.gainUsd))}>{fmtPct(month.gainPctUsd)}</p>}
                        <p className={cn('text-xs', toneClass(month.gainArs))}>{fmtSignedArs(month.gainArs)}</p>
                    </div>
                ) : (
                    <p className="shrink-0 text-right text-sm text-muted-foreground">Sin días<br />para comparar</p>
                )}
                <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="space-y-0.5 border-t p-2">
                    {days.length === 0 ? (
                        <p className="p-2 text-sm text-muted-foreground">Sin días guardados este mes.</p>
                    ) : [...days].reverse().map(d => (
                        <DayRow key={d.id} snapshot={d} previous={previousOf.get(d.dateLocal)} suspicious={suspicious.has(d.dateLocal)} onDelete={() => onDelete(d)} />
                    ))}
                </div>
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------

export function HistoryPage() {
    const { toast } = useToast()
    const portfolio = usePortfolioV2()
    const { data: snapshots = [], isLoading } = useSnapshots()
    const { data: movements = [] } = useMovements()
    const saveSnapshot = useSaveSnapshot()
    const deleteSnapshot = useDeleteSnapshot()
    const [toDelete, setToDelete] = useState<Snapshot | null>(null)

    const overview = useMemo(() => buildOverview(portfolio), [portfolio])
    const current = useMemo(
        () => overview.totalArs > 0 ? { ars: overview.totalArs, usd: overview.totalUsd, fxMep: overview.fx.mep || undefined } : null,
        [overview.totalArs, overview.totalUsd, overview.fx.mep],
    )
    const currentRubros = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return null
        const values = Object.fromEntries(RUBRO_ORDER.map(k => [k, { ars: 0, usd: 0 }])) as Record<HistoryRubro, { ars: number; usd: number }>
        const map: Record<string, HistoryRubro> = { wallets: 'pesos', frascos: 'pesos', plazos: 'plazos', fci: 'fci', cedears: 'cedears', crypto: 'crypto' }
        for (const r of portfolio.rubros) {
            const target = values[map[r.id] ?? 'pesos']
            target.ars += r.totals.ars
            target.usd += r.totals.usd
        }
        return values
    }, [portfolio])
    const fxContext = useMemo(() => ({
        officialSell: portfolio?.fx.officialSell ?? 0,
        mepSell: portfolio?.fx.mepSell ?? 0,
        cryptoSell: portfolio?.fx.cryptoSell ?? 0,
    }), [portfolio?.fx.officialSell, portfolio?.fx.mepSell, portfolio?.fx.cryptoSell])

    const usable = useMemo(() => usableSnapshots(snapshots), [snapshots])
    const months = useMemo(() => buildMonthlySummary(snapshots, movements, fxContext, current), [snapshots, movements, fxContext, current])
    const suspicious = useMemo(() => findSuspiciousDays(snapshots), [snapshots])
    const daysByMonth = useMemo(() => {
        const map = new Map<string, Snapshot[]>()
        for (const s of usable) {
            const list = map.get(s.dateLocal.slice(0, 7)) ?? []
            list.push(s)
            map.set(s.dateLocal.slice(0, 7), list)
        }
        return map
    }, [usable])
    const previousOf = useMemo(() => new Map(usable.slice(1).map((s, i) => [s.dateLocal, usable[i]])), [usable])

    const onSave = async () => {
        try {
            await saveSnapshot.mutateAsync('MEP')
            toast({ title: 'Foto de hoy guardada' })
        } catch (error) {
            toast({ title: 'No se pudo guardar', description: error instanceof Error ? error.message : undefined, variant: 'error' })
        }
    }

    const onConfirmDelete = async () => {
        if (!toDelete) return
        const day = fmtDayKey(toDelete.dateLocal)
        setToDelete(null)
        const remote = await deleteSnapshot.mutateAsync(toDelete)
        toast(remote === 'failed'
            ? { title: `Se borró el ${day} en este dispositivo`, description: 'No se pudo borrar en la nube; puede volver al sincronizar.', variant: 'error' }
            : { title: `Borraste el ${day}` })
    }

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Historial</h1>
                    <p className="text-sm text-muted-foreground">Una foto de tu patrimonio por cada día que abriste la app.</p>
                </div>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saveSnapshot.isPending}
                    className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                    <Camera className="h-4 w-4" /> {saveSnapshot.isPending ? 'Guardando…' : 'Guardar foto de hoy'}
                </button>
            </div>

            {isLoading ? (
                <Card><div className="h-56 animate-pulse rounded-lg bg-muted" /></Card>
            ) : (
                <>
                    <EvolutionCard snapshots={snapshots} current={current} currentRubros={currentRubros} />

                    {suspicious.size > 0 && (
                        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <p>
                                {suspicious.size === 1 ? 'Hay 1 día' : `Hay ${suspicious.size} días`} con un salto que se deshace al día siguiente:
                                suele ser una foto tomada con un precio mal cargado. Abrí el mes y borralo si no corresponde.
                            </p>
                        </div>
                    )}

                    <Card className="space-y-3">
                        <div>
                            <h2 className="text-lg font-semibold">Mes por mes</h2>
                            <p className="text-sm text-muted-foreground">Ganancia sin contar lo que ingresaste o retiraste. Tocá un mes para ver sus días.</p>
                        </div>
                        {months.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Cuando haya al menos dos días guardados vas a ver el resumen.</p>
                        ) : months.map(m => (
                            <MonthRow
                                key={m.monthKey}
                                month={m}
                                days={daysByMonth.get(m.monthKey) ?? []}
                                previousOf={previousOf}
                                suspicious={suspicious}
                                onDelete={setToDelete}
                            />
                        ))}
                    </Card>
                </>
            )}

            <DeleteConfirmDialog
                open={toDelete != null}
                onOpenChange={open => { if (!open) setToDelete(null) }}
                onConfirm={onConfirmDelete}
                title={toDelete ? `¿Borrar el ${fmtDayKey(toDelete.dateLocal)}?` : '¿Borrar este día?'}
                description="Se borra la foto de ese día (no tus movimientos). Si la app vuelve a abrirse hoy, guarda una nueva."
            />
        </div>
    )
}
