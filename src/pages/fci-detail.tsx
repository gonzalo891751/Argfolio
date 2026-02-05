/**
 * FCI Detail Page — Subpágina de detalle de Fondos Comunes de Inversión
 *
 * Muestra:
 * - Hero cards con valuación ARS/USD (dólares oficiales)
 * - KPIs: Tenencia, Precio cuotaparte, PPC, Invertido, Resultado (dual ARS/USD)
 * - Tabla de Aportes (Lotes) con doble moneda
 * - Simulador de Rescate con generación de movimientos
 * - Tab "Cómo se calcula"
 *
 * Basado en el patrón de cedear-detail.tsx adaptado para FCI
 */

import { useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, ArrowUpDown, ChevronUp, ChevronDown, Info, AlertTriangle, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatDeltaMoneyARS, formatDeltaMoneyUSD, formatNumberAR, formatQty } from '@/lib/format'
import { usePortfolioV2 } from '@/features/portfolioV2'
import type { FciDetail, FciLotDetail, ItemV2, ProviderV2 } from '@/features/portfolioV2/types'
import { useCreateMovement } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'
import type { Movement } from '@/domain/types'

// =============================================================================
// Helpers
// =============================================================================

function formatPnlPct(value: number): string {
    const pct = value * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function formatDateDDMMYYYY(isoDate: string): string {
    try {
        const d = new Date(isoDate)
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = d.getFullYear()
        return `${dd}/${mm}/${yyyy}`
    } catch {
        return isoDate.slice(0, 10)
    }
}

type TabId = 'lots' | 'rescate' | 'info'
type SortKey = 'date' | 'qty' | 'unitCost' | 'invested' | 'value' | 'pnlArs' | 'pnlUsd'
type SortDir = 'asc' | 'desc'

// =============================================================================
// Main Component
// =============================================================================

export function FciDetailPage() {
    const { accountId, instrumentId } = useParams<{ accountId: string; instrumentId: string }>()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabId>('lots')

    // Sort state
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    // Rescate simulator state
    const [rescateQty, setRescateQty] = useState<string>('')
    const [isConfirming, setIsConfirming] = useState(false)

    // Data hooks
    const portfolio = usePortfolioV2()
    const createMovement = useCreateMovement()
    const { toast } = useToast()

    // Find the FCI item + provider + detail
    const found = useMemo((): { item: ItemV2; provider: ProviderV2; detail: FciDetail } | null => {
        if (!portfolio || !accountId || !instrumentId) return null

        const fciRubro = portfolio.rubros.find(r => r.id === 'fci')
        if (!fciRubro) return null

        const decodedInstrumentId = decodeURIComponent(instrumentId)

        for (const provider of fciRubro.providers) {
            const item = provider.items.find(
                it => it.kind === 'fci' &&
                    it.accountId === accountId &&
                    (it.instrumentId === decodedInstrumentId || it.symbol === decodedInstrumentId)
            )
            if (item) {
                const detail = portfolio.fciDetails.get(item.id)
                if (detail) return { item, provider, detail }
            }
        }
        return null
    }, [portfolio, accountId, instrumentId])

    // FX rate (Oficial for FCI)
    const oficialSellRate = portfolio?.fx.officialSell ?? 1

    // Sorted lots
    const sortedLots = useMemo(() => {
        if (!found) return []
        const lots = [...found.detail.lots]
        const dir = sortDir === 'asc' ? 1 : -1
        lots.sort((a, b) => {
            switch (sortKey) {
                case 'date':
                    return dir * (new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
                case 'qty':
                    return dir * (a.qty - b.qty)
                case 'unitCost':
                    return dir * (a.unitCostArs - b.unitCostArs)
                case 'invested':
                    return dir * (a.totalCostArs - b.totalCostArs)
                case 'value':
                    return dir * (a.currentValueArs - b.currentValueArs)
                case 'pnlArs':
                    return dir * (a.pnlArs - b.pnlArs)
                case 'pnlUsd':
                    return dir * (a.pnlUsd - b.pnlUsd)
                default:
                    return 0
            }
        })
        return lots
    }, [found, sortKey, sortDir])

    // Toggle sort
    const toggleSort = useCallback((key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortDir(key === 'date' ? 'desc' : 'asc')
        }
    }, [sortKey])

    // Rescate: effective qty
    const effectiveRescateQty = useMemo(() => {
        const parsed = parseFloat(rescateQty.replace(',', '.'))
        if (!isNaN(parsed) && parsed > 0) return parsed
        return 0
    }, [rescateQty])

    // Rescate: preview calculation
    const rescatePreview = useMemo(() => {
        if (!found || effectiveRescateQty <= 0) return null
        const { detail } = found
        const totalHolding = detail.totalQty
        const safeQty = Math.min(effectiveRescateQty, totalHolding)
        if (safeQty <= 0) return null

        // Revenue = qty * VCP
        const revenueArs = safeQty * detail.currentPriceArs
        const revenueUsd = oficialSellRate > 0 ? revenueArs / oficialSellRate : 0

        // Cost = avg cost * qty (PPP)
        const costArs = detail.avgCostArs * safeQty
        const costUsd = detail.avgCostUsd * safeQty

        const pnlArs = revenueArs - costArs
        const pnlUsd = revenueUsd - costUsd
        const pctArs = costArs > 0 ? pnlArs / costArs : 0
        const pctUsd = costUsd > 0 ? pnlUsd / costUsd : 0

        return {
            qty: safeQty,
            revenueArs,
            revenueUsd,
            costArs,
            costUsd,
            pnlArs,
            pnlUsd,
            pctArs,
            pctUsd,
        }
    }, [found, effectiveRescateQty, oficialSellRate])

    // Handle confirm rescate
    const handleConfirmRescate = useCallback(async () => {
        if (!found || !rescatePreview || rescatePreview.qty <= 0) return
        const { item, detail } = found

        setIsConfirming(true)
        try {
            const groupId = crypto.randomUUID()
            const now = new Date().toISOString()

            // 1. Create SELL movement for the FCI
            const sellMov: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: now,
                type: 'SELL',
                assetClass: 'fci',
                accountId: item.accountId,
                instrumentId: item.instrumentId || '',
                ticker: item.symbol,
                assetName: detail.name,
                quantity: rescatePreview.qty,
                unitPrice: detail.currentPriceArs,
                tradeCurrency: 'ARS',
                totalAmount: rescatePreview.revenueArs,
                totalARS: rescatePreview.revenueArs,
                totalUSD: rescatePreview.revenueUsd,
                fxAtTrade: oficialSellRate,
                fx: {
                    kind: 'OFICIAL',
                    side: 'sell',
                    rate: oficialSellRate,
                    asOf: now,
                },
                groupId,
                source: 'user',
                notes: `Rescate de ${formatQty(rescatePreview.qty, 'FCI')} cuotapartes`,
            }

            await createMovement.mutateAsync(sellMov)

            // 2. Credit ARS liquidity in the broker account (DEPOSIT)
            const creditMov: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: now,
                type: 'DEPOSIT',
                assetClass: 'wallet',
                accountId: item.accountId,
                tradeCurrency: 'ARS',
                totalAmount: rescatePreview.revenueArs,
                totalARS: rescatePreview.revenueArs,
                fxAtTrade: oficialSellRate,
                groupId,
                source: 'system',
                notes: `Acreditación por rescate de ${detail.name} (${formatQty(rescatePreview.qty, 'FCI')} cuotapartes) - Plazo T+2`,
            }

            await createMovement.mutateAsync(creditMov)

            toast({
                title: 'Rescate registrado',
                description: `Rescataste ${formatQty(rescatePreview.qty, 'FCI')} cuotapartes por ${formatMoneyARS(rescatePreview.revenueArs)}. Liquidez ARS acreditada (plazo T+2).`,
                variant: 'success',
                duration: 5000,
            })

            // Reset simulator
            setRescateQty('')
            setActiveTab('lots')

        } catch (err) {
            toast({
                title: 'Error al registrar rescate',
                description: err instanceof Error ? err.message : 'Error desconocido',
                variant: 'error',
            })
        } finally {
            setIsConfirming(false)
        }
    }, [found, rescatePreview, oficialSellRate, createMovement, toast])

    // Loading state
    if (!portfolio || portfolio.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary mx-auto" />
                    <p className="text-muted-foreground">Cargando detalle...</p>
                </div>
            </div>
        )
    }

    // Not found state
    if (!found) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">
                    {instrumentId ? `Sin tenencia de FCI` : 'FCI no encontrado'}
                </p>
                <button
                    onClick={() => navigate('/mis-activos-v2')}
                    className="text-primary hover:underline"
                >
                    Volver a Mis Activos
                </button>
            </div>
        )
    }

    const { provider, detail } = found
    const totalHolding = detail.totalQty
    const hasDivergence = (detail.pnlArs > 0 && detail.pnlUsd < 0) || (detail.pnlArs < 0 && detail.pnlUsd > 0)

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-12">
            {/* 01. HEADER / BREADCRUMB */}
            <header className="space-y-6">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/mis-activos-v2')}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <nav className="flex items-center text-xs font-mono text-muted-foreground space-x-2">
                        <Link to="/mis-activos-v2" className="hover:text-foreground transition-colors">
                            Mis Activos
                        </Link>
                        <span>/</span>
                        <span>Fondos (FCI)</span>
                        <span>/</span>
                        <span className="text-primary font-bold truncate max-w-[200px]">{detail.symbol || detail.name}</span>
                    </nav>
                </div>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center shadow-lg shrink-0">
                            <TrendingUp className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                                {detail.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                <span className="bg-muted border border-border px-2 py-0.5 rounded text-xs font-medium">FCI</span>
                                {detail.fundHouse && (
                                    <span className="text-xs">{detail.fundHouse}</span>
                                )}
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span className="text-xs">{provider.name}</span>
                            </div>
                        </div>
                    </div>

                    {/* TC Oficial Chip */}
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-2 items-center">
                            <span className="text-[10px] text-muted-foreground font-mono uppercase mr-1 hidden md:inline">Ref. Conversión:</span>
                            <div className="px-3 py-1.5 rounded-lg bg-background border border-primary/30 text-xs font-mono flex items-center gap-2">
                                <span className="text-primary font-bold">TC Oficial (Venta)</span>
                                <span className="text-foreground font-bold">$ {formatNumberAR(oficialSellRate)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* 02. HERO CARDS */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Card 1: Valuación */}
                <div className="bg-card border border-border rounded-2xl p-6 relative overflow-hidden group flex flex-col justify-between h-full hover:border-border/80 transition duration-300">
                    <div className="relative z-10">
                        <h3 className="text-muted-foreground text-xs font-mono uppercase tracking-wider mb-2 flex items-center gap-2">
                            Valuación Actual
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground border border-border font-bold">ARS</span>
                        </h3>
                        <div className="font-mono font-medium text-foreground tracking-tight tabular-nums text-3xl md:text-4xl leading-none mb-4 break-all" style={{ fontFeatureSettings: '"tnum"' }}>
                            {formatMoneyARS(detail.currentValueArs)}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-background rounded-lg px-3 py-1.5 border border-border inline-flex items-baseline gap-2">
                                <span className="text-sm text-muted-foreground">≈</span>
                                <span className="text-xl font-mono text-emerald-400 tabular-nums">{formatMoneyUSD(detail.currentValueUsd)}</span>
                            </div>
                            {detail.pnlPctUsd !== 0 && (
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded-md tabular-nums border",
                                    detail.pnlPctUsd >= 0
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                )}>
                                    {formatPnlPct(detail.pnlPctUsd)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="relative z-10 mt-8 pt-4 border-t border-border flex justify-between items-end">
                        <div>
                            <span className="block text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">VCP (Cuotaparte)</span>
                            <div className="text-foreground font-mono text-sm font-medium">{formatMoneyARS(detail.currentPriceArs)}</div>
                        </div>
                        <div className="text-right">
                            <span className="block text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Equiv. USD</span>
                            <div className="text-muted-foreground font-mono text-sm">{formatMoneyUSD(detail.currentPriceUsd)}</div>
                        </div>
                    </div>

                    {/* Price Source Indicator */}
                    {detail.priceMeta && detail.priceMeta.source !== 'quote' && (
                        <div className="absolute top-3 right-3">
                            <div className={cn(
                                "px-2 py-1 rounded text-[9px] font-mono flex items-center gap-1",
                                detail.priceMeta.source === 'last_trade'
                                    ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                    : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                            )}>
                                <AlertTriangle className="h-3 w-3" />
                                {detail.priceMeta.source === 'last_trade' ? 'Última Operación' : 'Estimado'}
                            </div>
                        </div>
                    )}
                </div>

                {/* Card 2: Metrics Dashboard */}
                <div className="bg-card border border-border rounded-2xl p-5 lg:col-span-2 flex flex-col justify-between relative">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 h-full">
                        {/* Tenencia */}
                        <MetricBlock label="Tenencia" highlight>
                            <div className="text-2xl font-bold tabular-nums">{formatQty(detail.totalQty, 'FCI')}</div>
                            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Cuotapartes</div>
                        </MetricBlock>

                        {/* VCP */}
                        <MetricBlock label="Valor Cuotaparte">
                            <div className="text-lg font-mono tabular-nums mb-1">{formatMoneyARS(detail.currentPriceArs)}</div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                                <span>{formatNumberAR(detail.currentPriceUsd)}</span>
                            </div>
                        </MetricBlock>

                        {/* Invertido */}
                        <MetricBlock label="Invertido" tooltip="USD Histórico = Suma de valuaciones en USD al momento de cada aporte.">
                            <div className="text-lg font-mono tabular-nums mb-1">{formatMoneyARS(detail.totalCostArs)}</div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                                <span>{formatNumberAR(detail.totalCostUsd)}</span>
                                <span className="ml-1 text-[8px] bg-muted text-muted-foreground px-1 rounded border border-border uppercase">Hist</span>
                            </div>
                        </MetricBlock>

                        {/* PPC */}
                        <MetricBlock label="PPC (Promedio)">
                            <div className="text-lg font-mono tabular-nums mb-1">{formatMoneyARS(detail.avgCostArs)}</div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                                <span>{formatNumberAR(detail.avgCostUsd)}</span>
                            </div>
                        </MetricBlock>

                        {/* Resultado */}
                        <MetricBlock label="Resultado Total" className="md:col-span-2 lg:col-span-1">
                            <div className="flex flex-col mb-2">
                                <span className="text-[9px] text-muted-foreground uppercase font-mono mb-0.5">Nominal (ARS)</span>
                                <div className={cn("font-mono text-sm tabular-nums font-bold", detail.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                    {formatDeltaMoneyARS(detail.pnlArs)} ({formatPnlPct(detail.pnlPctArs)})
                                </div>
                            </div>
                            <div className="flex flex-col pt-2 border-t border-border">
                                <span className="text-[9px] text-muted-foreground uppercase font-mono mb-0.5">Real (USD)</span>
                                <div className={cn("font-mono text-sm tabular-nums font-bold", detail.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                    {formatDeltaMoneyUSD(detail.pnlUsd)} ({formatPnlPct(detail.pnlPctUsd)})
                                </div>
                            </div>
                        </MetricBlock>
                    </div>

                    {/* Divergence Alert */}
                    {hasDivergence && (
                        <div className="mt-3 p-2.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-3">
                            <div className="bg-primary/20 p-1.5 rounded-full shrink-0">
                                <AlertTriangle className="w-4 h-4 text-primary" />
                            </div>
                            <div className="text-xs leading-snug">
                                <strong className="text-primary">Divergencia detectada:</strong>{' '}
                                {detail.pnlArs > 0 && detail.pnlUsd < 0
                                    ? 'Ganás en pesos (nominal) por la devaluación, pero perdés en dólares (real) por rendimiento negativo del fondo.'
                                    : 'Perdés en pesos (nominal) pero ganás en dólares (real).'}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Tabs */}
            <div className="border-b border-border">
                <nav className="flex gap-6" aria-label="Tabs">
                    {([
                        { id: 'lots' as TabId, label: 'Aportes (Lotes)' },
                        { id: 'rescate' as TabId, label: 'Simular Rescate' },
                        { id: 'info' as TabId, label: 'Cómo se calcula' },
                    ]).map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "py-4 px-1 text-sm font-medium transition-colors border-b-2",
                                activeTab === tab.id
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* TAB: LOTS */}
            {activeTab === 'lots' && (
                <div className="space-y-4 pt-2">
                    {sortedLots.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No hay aportes registrados para este FCI.</p>
                            <p className="text-sm mt-2">Registrá un aporte desde Movimientos para ver el detalle.</p>
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-muted/50 border-b border-border text-xs font-mono text-muted-foreground uppercase">
                                        <tr>
                                            <SortableHeader label="Fecha" sortKey="date" current={sortKey} dir={sortDir} onSort={toggleSort} />
                                            <SortableHeader label="Cuotapartes" sortKey="qty" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-4 py-3 font-medium text-right">
                                                <span>VCP Compra</span>
                                                <br />
                                                <span className="text-[9px] normal-case opacity-50">ARS / US$ Hist</span>
                                            </th>
                                            <SortableHeader label="Invertido" sortKey="invested" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-4 py-3 font-medium text-right">Valor Hoy</th>
                                            <SortableHeader label="Resultado" sortKey="pnlArs" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {sortedLots.map((lot) => (
                                            <FciLotRow
                                                key={lot.id}
                                                lot={lot}
                                            />
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-muted/80 font-bold border-t border-border">
                                        <tr>
                                            <td className="px-4 py-4 text-xs">TOTALES</td>
                                            <td className="px-4 py-4 text-right text-xs tabular-nums">{formatQty(detail.totalQty, 'FCI')}</td>
                                            <td className="px-4 py-4" />
                                            <td className="px-4 py-4 text-right">
                                                <div className="text-xs tabular-nums">{formatMoneyARS(detail.totalCostArs)}</div>
                                                <div className="text-xs text-muted-foreground tabular-nums">{formatMoneyUSD(detail.totalCostUsd)}</div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="text-xs tabular-nums">{formatMoneyARS(detail.currentValueArs)}</div>
                                                <div className="text-xs text-muted-foreground tabular-nums">{formatMoneyUSD(detail.currentValueUsd)}</div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className={cn("text-xs tabular-nums font-bold", detail.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatDeltaMoneyARS(detail.pnlArs)} ({formatPnlPct(detail.pnlPctArs)})
                                                </div>
                                                <div className={cn("text-[10px] tabular-nums font-bold", detail.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatDeltaMoneyUSD(detail.pnlUsd)} ({formatPnlPct(detail.pnlPctUsd)})
                                                </div>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: RESCATE */}
            {activeTab === 'rescate' && (
                <div className="space-y-6 pt-2">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left: Configuration */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                                <h3 className="font-bold text-sm flex items-center gap-2">
                                    <Calculator className="w-4 h-4 text-primary" />
                                    Simular Rescate
                                </h3>

                                {/* Cantidad */}
                                <div className="space-y-2">
                                    <label className="text-xs font-mono text-muted-foreground uppercase">Cantidad (Cuotapartes)</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={rescateQty}
                                            onChange={(e) => setRescateQty(e.target.value)}
                                            placeholder={`Máx: ${formatQty(totalHolding, 'FCI')}`}
                                            className="w-full bg-background border border-border rounded-lg py-3 px-4 font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition tabular-nums"
                                        />
                                        <button
                                            onClick={() => setRescateQty(String(totalHolding))}
                                            className="absolute right-2 top-2 px-2 py-1 bg-muted text-[10px] text-primary font-bold rounded hover:bg-muted/80 transition border border-border"
                                        >
                                            MÁX
                                        </button>
                                    </div>
                                    {effectiveRescateQty > totalHolding && (
                                        <p className="text-rose-400 text-xs">No podés rescatar más de lo que tenés.</p>
                                    )}
                                </div>

                                {/* VCP reference */}
                                <div className="p-3 bg-muted/50 rounded-lg border border-border space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-muted-foreground">VCP Actual</span>
                                        <span className="text-xs font-mono font-bold">{formatMoneyARS(detail.currentPriceArs)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-muted-foreground">TC Oficial (Venta)</span>
                                        <span className="text-xs font-mono font-bold">$ {formatNumberAR(oficialSellRate)}</span>
                                    </div>
                                </div>

                                {/* Info about T+2 */}
                                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-2">
                                    <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-400">
                                        Los rescates de FCI se acreditan en <strong>T+2</strong> (48-72hs hábiles).
                                    </p>
                                </div>

                                {/* Confirm button */}
                                {rescatePreview && rescatePreview.qty > 0 && (
                                    <button
                                        onClick={handleConfirmRescate}
                                        disabled={isConfirming}
                                        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
                                    >
                                        {isConfirming
                                            ? 'Registrando...'
                                            : `Confirmar Rescate (${formatQty(rescatePreview.qty, 'FCI')} cuotapartes)`
                                        }
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right: Preview */}
                        <div className="lg:col-span-7 space-y-4">
                            <h3 className="text-sm font-bold">Proyección de Rescate</h3>

                            {rescatePreview && rescatePreview.qty > 0 ? (
                                <>
                                    {/* Producido */}
                                    <div className="bg-card border border-border rounded-xl p-5 border-l-4 border-l-primary/50 flex justify-between items-center">
                                        <div>
                                            <span className="text-xs text-muted-foreground uppercase font-mono">A Cobrar (Bruto)</span>
                                            <div className="text-2xl font-mono font-bold tabular-nums mt-1">{formatMoneyARS(rescatePreview.revenueArs)}</div>
                                            <div className="text-sm text-muted-foreground font-mono tabular-nums">≈ {formatMoneyUSD(rescatePreview.revenueUsd)}</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[10px] text-muted-foreground uppercase font-mono">Cuotapartes</span>
                                            <div className="text-xl font-mono font-bold tabular-nums">{formatQty(rescatePreview.qty, 'FCI')}</div>
                                        </div>
                                    </div>

                                    {/* Costo y Resultado */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-card border border-border rounded-xl p-4">
                                            <span className="text-xs text-muted-foreground uppercase font-mono">Costo (PPP)</span>
                                            <div className="text-lg font-mono font-bold tabular-nums mt-1">{formatMoneyARS(rescatePreview.costArs)}</div>
                                            <div className="text-xs text-muted-foreground font-mono tabular-nums">{formatMoneyUSD(rescatePreview.costUsd)}</div>
                                        </div>

                                        <div className="bg-card border border-border rounded-xl p-4">
                                            <span className="text-xs text-muted-foreground uppercase font-mono">Resultado</span>
                                            <div className={cn("text-lg font-mono font-bold tabular-nums mt-1", rescatePreview.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                {formatDeltaMoneyARS(rescatePreview.pnlArs)}
                                            </div>
                                            <div className={cn("text-xs font-mono tabular-nums font-bold", rescatePreview.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                {formatDeltaMoneyUSD(rescatePreview.pnlUsd)} ({formatPnlPct(rescatePreview.pctUsd)})
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-muted/30 border border-border rounded-xl p-8 text-center">
                                    <p className="text-muted-foreground text-sm">
                                        Ingresá la cantidad de cuotapartes a rescatar para ver la proyección.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: INFO */}
            {activeTab === 'info' && (
                <div className="max-w-3xl space-y-6 pt-2">
                    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-lg">¿Cómo se calcula?</h3>

                        <div className="space-y-4 text-sm text-muted-foreground">
                            <div>
                                <h4 className="font-medium text-foreground mb-1">Valuación Actual</h4>
                                <p>
                                    <code className="bg-muted px-1 rounded text-xs">Tenencia × VCP</code> donde VCP es el Valor Cuotaparte
                                    publicado por la administradora del fondo.
                                </p>
                            </div>

                            <div>
                                <h4 className="font-medium text-foreground mb-1">Equivalente en USD</h4>
                                <p>
                                    Se calcula dividiendo la valuación ARS por el <strong>TC Oficial (Venta)</strong>.
                                    Este tipo de cambio aplica porque los FCI en Argentina operan en pesos y están regulados
                                    por CNV, por lo que el tipo de cambio de referencia es el oficial.
                                </p>
                            </div>

                            <div>
                                <h4 className="font-medium text-foreground mb-1">Resultado Nominal (ARS)</h4>
                                <p>
                                    <code className="bg-muted px-1 rounded text-xs">Valuación Actual - Invertido</code>.
                                    Representa la ganancia o pérdida en pesos, sin considerar la devaluación del peso.
                                </p>
                            </div>

                            <div>
                                <h4 className="font-medium text-foreground mb-1">Resultado Real (USD)</h4>
                                <p>
                                    <code className="bg-muted px-1 rounded text-xs">Valuación USD Hoy - Invertido USD Histórico</code>.
                                    Para el histórico, se usa el TC Oficial vigente al momento de cada aporte.
                                    Este resultado te indica si ganaste o perdiste poder adquisitivo en dólares.
                                </p>
                            </div>

                            <div>
                                <h4 className="font-medium text-foreground mb-1">Divergencia ARS vs USD</h4>
                                <p>
                                    Es común que el resultado en ARS sea positivo pero el resultado en USD sea negativo
                                    (o viceversa). Esto ocurre porque el peso argentino se devalúa frente al dólar.
                                    Un FCI puede mostrar ganancia nominal pero pérdida real si no rindió más que la devaluación.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <h4 className="font-medium text-foreground mb-1">Sobre el Rescate</h4>
                                <p>
                                    Los rescates de FCI se procesan en <strong>T+2</strong>, es decir, 48 a 72 horas hábiles
                                    desde la solicitud. El monto final puede variar según el VCP del día de procesamiento.
                                    Al confirmar el rescate, se genera un movimiento de venta (SELL) y un depósito (DEPOSIT)
                                    en tu cuenta del broker.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// MetricBlock Component
// =============================================================================

function MetricBlock({
    label,
    highlight,
    tooltip,
    className,
    children,
}: {
    label: string
    highlight?: boolean
    tooltip?: string
    className?: string
    children: React.ReactNode
}) {
    return (
        <div className={cn(
            "p-3 rounded-xl border transition-colors flex flex-col",
            highlight
                ? "bg-primary/5 border-primary/20"
                : "bg-background border-border hover:border-muted-foreground/30",
            className
        )}>
            <div className="flex items-center gap-1 mb-2">
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wide">{label}</span>
                {tooltip && (
                    <div className="group relative">
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-popover border border-border rounded-lg text-[10px] text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-lg">
                            {tooltip}
                        </div>
                    </div>
                )}
            </div>
            {children}
        </div>
    )
}

// =============================================================================
// Sortable Header
// =============================================================================

function SortableHeader({
    label,
    sortKey: key,
    current,
    dir,
    onSort,
    align = 'left',
}: {
    label: string
    sortKey: SortKey
    current: SortKey
    dir: SortDir
    onSort: (key: SortKey) => void
    align?: 'left' | 'right'
}) {
    const isActive = current === key
    return (
        <th
            className={cn(
                "px-4 py-3 font-medium cursor-pointer hover:bg-muted/30 transition-colors select-none",
                align === 'right' && 'text-right'
            )}
            onClick={() => onSort(key)}
        >
            <div className={cn("inline-flex items-center gap-1", align === 'right' && 'flex-row-reverse')}>
                <span>{label}</span>
                {isActive ? (
                    dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                )}
            </div>
        </th>
    )
}

// =============================================================================
// FCI Lot Row
// =============================================================================

function FciLotRow({
    lot,
}: {
    lot: FciLotDetail
}) {
    return (
        <tr className="hover:bg-muted/30 transition-colors">
            <td className="px-4 py-3">
                <div className="text-xs tabular-nums">{formatDateDDMMYYYY(lot.dateISO)}</div>
                {lot.fxMissing && (
                    <div className="text-[9px] text-yellow-500">TC estimado</div>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                <div className="text-xs tabular-nums">{formatQty(lot.qty, 'FCI')}</div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className="text-xs tabular-nums">{formatMoneyARS(lot.unitCostArs)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{formatMoneyUSD(lot.unitCostUsd)}</div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className="text-xs tabular-nums">{formatMoneyARS(lot.totalCostArs)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{formatMoneyUSD(lot.totalCostUsd)}</div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className="text-xs tabular-nums">{formatMoneyARS(lot.currentValueArs)}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{formatMoneyUSD(lot.currentValueUsd)}</div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className={cn("text-xs tabular-nums font-bold", lot.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {formatDeltaMoneyARS(lot.pnlArs)} ({formatPnlPct(lot.pnlPctArs)})
                </div>
                <div className={cn("text-[10px] tabular-nums", lot.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {formatDeltaMoneyUSD(lot.pnlUsd)} ({formatPnlPct(lot.pnlPctUsd)})
                </div>
            </td>
        </tr>
    )
}
