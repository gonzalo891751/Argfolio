/**
 * Mis activos — every position, split in "En pesos" and "En dólares".
 *  - Pesos: balance, TNA, what it earns tomorrow / in 30 days, interest so far.
 *  - Dólares: value in USD (and pesos), result in USD and in pesos.
 * Tap a row for its detail; the menu has the quick actions.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, MoreHorizontal, Plus, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useQuickEntry, type QuickEntryPrefill } from '@/features/quick-entry/QuickEntryContext'
import { buildOverview, type OverviewBucket, type OverviewGroup, type OverviewPosition } from '@/features/overview/overview-model'
import { fmtArs, fmtDateISO, fmtPct, fmtQty, fmtSignedArs, fmtSignedUsd, fmtUsd, toneClass } from '@/features/overview/format'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ManualPriceDialog } from '@/components/assets/ManualPriceDialog'
import { PreferencesSheet } from '@/components/PreferencesSheet'

const PESOS_COLOR = '#0ea5e9'
const DOLARES_COLOR = '#10b981'

const isCash = (p: OverviewPosition) => p.kind === 'cash_ars' || p.kind === 'cash_usd' || p.kind === 'wallet_yield' || p.kind === 'frasco'

function RowActions({ p, onManualPrice }: { p: OverviewPosition; onManualPrice: (p: OverviewPosition) => void }) {
    const { openQuickEntry, openAdvancedWizard } = useQuickEntry()
    const isTradeable = p.kind === 'crypto' || p.kind === 'stable' || p.kind === 'cedear'
    const currency: 'ARS' | 'USD' = p.groupId === 'dolares' ? 'USD' : 'ARS'
    const open = (prefill: QuickEntryPrefill) => openQuickEntry(prefill)
    const assetClass = p.kind === 'cedear' ? 'cedear' : 'crypto'

    if (p.kind === 'plazo_fijo' || p.kind === 'fci') return null

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Acciones de ${p.label}`}
                    onClick={e => e.stopPropagation()}
                >
                    <MoreHorizontal className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {isTradeable && (
                    <>
                        <DropdownMenuItem onSelect={() => open({ mode: 'trade', side: 'buy', assetClass, symbol: p.symbol, accountId: p.accountId })}>Compré más</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => open({ mode: 'trade', side: 'sell', assetClass, symbol: p.symbol, accountId: p.accountId })}>Vendí</DropdownMenuItem>
                        {p.kind !== 'cedear' && (
                            <DropdownMenuItem onSelect={() => openAdvancedWizard({ assetClass: 'crypto', operationMode: 'transfer', accountId: p.accountId, symbol: p.symbol })}>
                                Transferir a otra cuenta
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onManualPrice(p)}>Cargar precio a mano</DropdownMenuItem>
                    </>
                )}
                {isCash(p) && (
                    <>
                        <DropdownMenuItem onSelect={() => open({ mode: 'balance', accountId: p.accountId, currency })}>Actualizar saldo</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => open({ mode: 'cash', direction: 'in', accountId: p.accountId, currency })}>Ingresé plata</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => open({ mode: 'cash', direction: 'out', accountId: p.accountId, currency })}>Saqué plata</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openAdvancedWizard({ assetClass: 'wallet', operationMode: 'transfer', accountId: p.accountId, currency })}>
                            Transferir a otra cuenta
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

function PesoRow({ p }: { p: OverviewPosition }) {
    const lines: string[] = []
    if (p.pf) {
        lines.push(p.pf.daysRemaining > 0 ? `Vence el ${fmtDateISO(p.pf.maturityISO)} (${p.pf.daysRemaining} días)` : 'Vencido')
        lines.push(`Al vencimiento: ${fmtArs(p.pf.totalAtMaturityArs)}`)
    } else if (p.tna) {
        lines.push(`Mañana ${fmtSignedArs(p.interestTomorrowArs, { cents: true })} · 30 días ${fmtSignedArs(p.interest30dArs)}`)
    }
    if (p.kind === 'fci' && p.resultArs != null) {
        lines.push(`Resultado ${fmtSignedArs(p.resultArs)}${p.resultPct != null ? ` (${fmtPct(p.resultPct)})` : ''}`)
    }

    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 font-medium">
                    <span className="truncate">{p.label}</span>
                    {p.tna ? <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">TNA {fmtPct(p.tna / 100, { signed: false, decimals: 1 })}</span> : null}
                </p>
                {p.pf || p.kind === 'fci' ? <p className="truncate text-sm text-muted-foreground">{p.sublabel}</p> : null}
                {lines.map(line => <p key={line} className="truncate text-sm text-muted-foreground tabular-nums">{line}</p>)}
            </div>
            <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{fmtArs(p.valueArs)}</p>
                {p.interestEarnedArs ? (
                    <p className="text-xs text-emerald-600 tabular-nums dark:text-emerald-400">
                        {p.pf ? 'Devengado' : 'Ganado'} {fmtSignedArs(p.interestEarnedArs)}
                    </p>
                ) : (
                    <p className="text-xs text-muted-foreground tabular-nums">≈ {fmtUsd(p.valueUsd)}</p>
                )}
            </div>
        </div>
    )
}

function DollarRow({ p }: { p: OverviewPosition }) {
    const showQty = !isCash(p) && p.qty != null && p.kind !== 'stable'
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="truncate font-medium">{p.label}</p>
                <p className="truncate text-sm text-muted-foreground">
                    {p.sublabel}
                    {showQty && ` · ${fmtQty(p.qty, p.kind === 'cedear' ? 0 : 8)}`}
                </p>
                {p.valueMissing ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">Sin cotización: no suma al total</p>
                ) : p.resultUsd != null && Math.abs(p.resultUsd) >= 0.005 ? (
                    <p className="text-sm tabular-nums">
                        <span className={toneClass(p.resultUsd)}>{fmtSignedUsd(p.resultUsd)}{p.resultPct != null && ` (${fmtPct(p.resultPct)})`}</span>
                        {p.resultArs != null && <span className="text-muted-foreground"> · {fmtSignedArs(p.resultArs)} en pesos</span>}
                    </p>
                ) : null}
            </div>
            <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">{p.valueMissing ? '—' : fmtUsd(p.valueUsd)}</p>
                {!p.valueMissing && <p className="text-xs text-muted-foreground tabular-nums">≈ {fmtArs(p.valueArs)}</p>}
            </div>
        </div>
    )
}

function Group({ group, bucketId, onManualPrice }: { group: OverviewGroup; bucketId: 'pesos' | 'dolares'; onManualPrice: (p: OverviewPosition) => void }) {
    const [open, setOpen] = useState(true)
    const isPesos = bucketId === 'pesos'
    return (
        <div className="rounded-2xl border bg-card shadow-sm">
            <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
                <span className="flex items-center gap-2 font-semibold">
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
                    {group.label}
                    <span className="text-sm font-normal text-muted-foreground">{group.positions.length}</span>
                </span>
                <span className="font-semibold tabular-nums">{isPesos ? fmtArs(group.totalArs) : fmtUsd(group.totalUsd)}</span>
            </button>
            {open && (
                <ul className="divide-y divide-border/60 border-t">
                    {group.positions.map(p => (
                        <li key={p.id} className="flex items-center gap-1 pr-2">
                            {p.href ? (
                                <Link to={p.href} className="min-w-0 flex-1 px-4 py-3 hover:bg-muted/50 sm:px-5">
                                    {isPesos ? <PesoRow p={p} /> : <DollarRow p={p} />}
                                </Link>
                            ) : (
                                <div className="min-w-0 flex-1 px-4 py-3 sm:px-5">{isPesos ? <PesoRow p={p} /> : <DollarRow p={p} />}</div>
                            )}
                            <RowActions p={p} onManualPrice={onManualPrice} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function BucketSection({ bucket, onManualPrice }: { bucket: OverviewBucket; onManualPrice: (p: OverviewPosition) => void }) {
    const isPesos = bucket.id === 'pesos'
    if (bucket.groups.length === 0) return null
    return (
        <section id={bucket.id} className="scroll-mt-24 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: isPesos ? PESOS_COLOR : DOLARES_COLOR }} />
                        {isPesos ? 'En pesos' : 'En dólares'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {isPesos
                            ? <>Rinden {fmtSignedArs(bucket.interestTomorrowArs, { cents: true })} mañana y {fmtSignedArs(bucket.interest30dArs)} en 30 días</>
                            : <>Resultado <span className={toneClass(bucket.resultUsd)}>{fmtSignedUsd(bucket.resultUsd)}</span> · <span className={toneClass(bucket.resultArs)}>{fmtSignedArs(bucket.resultArs)}</span> en pesos</>}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-semibold tabular-nums">{isPesos ? fmtArs(bucket.totalArs) : fmtUsd(bucket.totalUsd)}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">≈ {isPesos ? fmtUsd(bucket.totalUsd) : fmtArs(bucket.totalArs)}</p>
                </div>
            </div>
            {bucket.groups.map(g => <Group key={g.id} group={g} bucketId={bucket.id} onManualPrice={onManualPrice} />)}
        </section>
    )
}

export function ActivosPage() {
    const portfolio = usePortfolioV2()
    const overview = useMemo(() => buildOverview(portfolio), [portfolio])
    const { openQuickEntry } = useQuickEntry()
    const location = useLocation()
    const [manualPriceFor, setManualPriceFor] = useState<OverviewPosition | null>(null)
    const [prefsOpen, setPrefsOpen] = useState(false)

    // Honor #pesos / #dolares once content is there
    useEffect(() => {
        if (!location.hash || !overview.hasPositions) return
        const el = document.getElementById(location.hash.slice(1))
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [location.hash, overview.hasPositions])

    const loading = !portfolio || portfolio.isLoading
    const inferred = portfolio?.flags.inferredBalanceCount ?? 0

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold">Mis activos</h1>
                    {!loading && (
                        <p className="text-sm text-muted-foreground tabular-nums">
                            {fmtArs(overview.totalArs)} · ≈ {fmtUsd(overview.totalUsd)}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setPrefsOpen(true)}
                        className="rounded-xl border p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Preferencias de Mis activos"
                        title="Preferencias"
                    >
                        <Settings2 className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => openQuickEntry()}
                        className="hidden items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground shadow-sm hover:opacity-90 lg:flex"
                    >
                        <Plus className="h-4 w-4" /> Cargar
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
                </div>
            ) : !overview.hasPositions ? (
                <div className="rounded-2xl border bg-card p-6 text-center">
                    <p className="font-medium">Todavía no cargaste nada.</p>
                    <button type="button" onClick={() => openQuickEntry({ mode: 'balance' })} className="mt-3 rounded-xl bg-primary px-4 py-2.5 font-medium text-primary-foreground">
                        Cargar mi primer saldo
                    </button>
                </div>
            ) : (
                <>
                    {inferred > 0 && (
                        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                            {inferred === 1 ? 'Hay 1 saldo' : `Hay ${inferred} saldos`} que se completaron solos porque faltaba cargar de dónde salió la plata.
                            Usá <span className="font-medium text-foreground">Actualizar saldo</span> para dejarlos exactos.
                        </p>
                    )}
                    <BucketSection bucket={overview.pesos} onManualPrice={setManualPriceFor} />
                    <BucketSection bucket={overview.dolares} onManualPrice={setManualPriceFor} />

                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Cómo se calcula</p>
                        <p className="mt-1">
                            Cripto y stablecoins se valúan en dólares; los CEDEARs se compran en pesos pero se miden en dólares al MEP del día de compra y de hoy.
                            En pesos, las billeteras y frascos suman intereses todos los días según su TNA y los plazos fijos suman lo devengado a hoy.
                        </p>
                        <Link to="/mis-activos-v2" className="mt-2 inline-block font-medium text-primary">Ver vista detallada (avanzada)</Link>
                    </div>
                </>
            )}

            {manualPriceFor?.instrumentId && (
                <ManualPriceDialog
                    instrumentId={manualPriceFor.instrumentId}
                    symbol={manualPriceFor.symbol}
                    currentPrice={undefined}
                    isOpen
                    onOpenChange={o => { if (!o) setManualPriceFor(null) }}
                    currency={manualPriceFor.kind === 'cedear' ? 'ARS' : 'USD'}
                />
            )}
            <PreferencesSheet open={prefsOpen} onOpenChange={setPrefsOpen} />
        </div>
    )
}
