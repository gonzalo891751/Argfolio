/**
 * CEDEAR Detail Page — Subpágina de detalle de CEDEAR
 *
 * Muestra:
 * - Hero cards con valuación ARS/USD (nominal vs real)
 * - KPIs: Tenencia, Precio, Invertido, PPC, Resultado (dual ARS/USD)
 * - Selector de método de costeo (PPP/PEPS/UEPS/Baratos/Manual)
 * - Tabla de Lotes con doble moneda (ARS arriba, US$ abajo)
 * - Simulador de venta con asignación de lotes según método
 * - Tab "Cómo se calcula"
 *
 * Diseño basado en docs/prototypes/mis_activos/CEDEARS2.html
 */

import { useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, ArrowUpDown, ChevronUp, ChevronDown, Info, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatDeltaMoneyARS, formatDeltaMoneyUSD, formatNumberAR, formatQty } from '@/lib/format'
import { usePortfolioV2 } from '@/features/portfolioV2'
import type { CedearDetail, CedearLotDetail, ItemV2, ProviderV2 } from '@/features/portfolioV2/types'
import { useCostingMethod } from '@/hooks/use-preferences'
import {
    COSTING_METHODS,
} from '@/domain/portfolio/lot-allocation'
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

type TabId = 'lots' | 'simulator' | 'info'
type SortKey = 'date' | 'qty' | 'unitCost' | 'invested' | 'value' | 'pnlArs' | 'pnlUsd'
type SortDir = 'asc' | 'desc'

// =============================================================================
// Main Component
// =============================================================================

export function CedearDetailPage() {
    const { accountId, ticker } = useParams<{ accountId: string; ticker: string }>()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabId>('lots')

    // Sort state
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    // Costing method (persisted)
    const { method: costingMethod, setMethod: setCostingMethod } = useCostingMethod()

    // Simulator state
    const [sellQty, setSellQty] = useState<string>('')
    const [sellPriceInput, setSellPriceInput] = useState<string>('')
    const [useMarketPrice, setUseMarketPrice] = useState(true)
    const [manualAllocs, setManualAllocs] = useState<Record<string, string>>({})
    const [isConfirming, setIsConfirming] = useState(false)

    // Data hooks
    const portfolio = usePortfolioV2()
    const createMovement = useCreateMovement()
    const { toast } = useToast()

    // Find the CEDEAR item + provider + detail
    const found = useMemo((): { item: ItemV2; provider: ProviderV2; detail: CedearDetail } | null => {
        if (!portfolio || !accountId || !ticker) return null

        const cedearRubro = portfolio.rubros.find(r => r.id === 'cedears')
        if (!cedearRubro) return null

        for (const provider of cedearRubro.providers) {
            const item = provider.items.find(
                it => it.kind === 'cedear' && it.symbol === ticker && it.accountId === accountId
            )
            if (item) {
                const detail = portfolio.cedearDetails.get(item.id)
                if (detail) return { item, provider, detail }
            }
        }
        return null
    }, [portfolio, accountId, ticker])

    // FX rate
    const mepSellRate = portfolio?.fx.mepSell ?? 1

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

    // Simulator: effective sell price
    const effectiveSellPrice = useMemo(() => {
        if (useMarketPrice) return found?.detail.currentPriceArs ?? 0
        const parsed = parseFloat(sellPriceInput.replace(/\./g, '').replace(',', '.'))
        if (!isNaN(parsed) && parsed > 0) return parsed
        return found?.detail.currentPriceArs ?? 0
    }, [sellPriceInput, useMarketPrice, found])

    // Simulator: effective sell qty
    const effectiveSellQty = useMemo(() => {
        if (costingMethod === 'MANUAL') {
            return Object.values(manualAllocs).reduce((s, v) => s + (parseInt(v) || 0), 0)
        }
        const parsed = parseInt(sellQty)
        if (!isNaN(parsed) && parsed > 0) return parsed
        return 0
    }, [sellQty, costingMethod, manualAllocs])

    // Simulator: allocation preview
    const allocation = useMemo(() => {
        if (!found || effectiveSellQty <= 0) return null
        const { detail } = found
        const lots = detail.lots
        const totalHolding = detail.totalQty
        const safeSellQty = Math.min(effectiveSellQty, totalHolding)
        if (safeSellQty <= 0) return null

        // Revenue
        const revenueArs = safeSellQty * effectiveSellPrice
        const revenueUsd = mepSellRate > 0 ? revenueArs / mepSellRate : 0

        // Cost calculation depending on method
        let costArs = 0
        let costUsd = 0
        const consumedLots: Array<{ lot: CedearLotDetail; take: number }> = []

        if (costingMethod === 'PPP') {
            const avgArs = detail.avgCostArs
            const avgUsd = detail.avgCostUsd
            costArs = avgArs * safeSellQty
            costUsd = avgUsd * safeSellQty
        } else if (costingMethod === 'MANUAL') {
            // Manual: use per-lot allocations
            for (const lot of lots) {
                const allocQty = parseInt(manualAllocs[lot.id] || '0') || 0
                if (allocQty <= 0) continue
                const take = Math.min(allocQty, lot.qty)
                costArs += take * lot.unitCostArs
                costUsd += take * lot.unitCostUsd
                consumedLots.push({ lot, take })
            }
        } else {
            // FIFO / LIFO / CHEAPEST
            const sorted = [...lots]
            if (costingMethod === 'FIFO') {
                sorted.sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime())
            } else if (costingMethod === 'LIFO') {
                sorted.sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime())
            } else if (costingMethod === 'CHEAPEST') {
                sorted.sort((a, b) => {
                    const diff = a.unitCostUsd - b.unitCostUsd
                    if (diff !== 0) return diff
                    return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
                })
            }

            let remaining = safeSellQty
            for (const lot of sorted) {
                if (remaining <= 0) break
                const take = Math.min(lot.qty, remaining)
                costArs += take * lot.unitCostArs
                costUsd += take * lot.unitCostUsd
                consumedLots.push({ lot, take })
                remaining -= take
            }
        }

        const pnlArs = revenueArs - costArs
        const pnlUsd = revenueUsd - costUsd
        const pctArs = costArs > 0 ? pnlArs / costArs : 0
        const pctUsd = costUsd > 0 ? pnlUsd / costUsd : 0

        return {
            qtySold: safeSellQty,
            revenueArs,
            revenueUsd,
            costArs,
            costUsd,
            pnlArs,
            pnlUsd,
            pctArs,
            pctUsd,
            consumedLots,
        }
    }, [found, effectiveSellQty, effectiveSellPrice, costingMethod, mepSellRate, manualAllocs])

    // Handle confirm sale
    const handleConfirmSale = useCallback(async () => {
        if (!found || !allocation || allocation.qtySold <= 0) return
        const { item, detail } = found

        setIsConfirming(true)
        try {
            const groupId = crypto.randomUUID()
            const now = new Date().toISOString()

            // 1. Create SELL movement for the CEDEAR
            const sellMov: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: now,
                type: 'SELL',
                assetClass: 'cedear',
                accountId: item.accountId,
                instrumentId: item.instrumentId || '',
                ticker: item.symbol,
                assetName: detail.name,
                quantity: allocation.qtySold,
                unitPrice: effectiveSellPrice,
                tradeCurrency: 'ARS',
                totalAmount: allocation.revenueArs,
                totalARS: allocation.revenueArs,
                totalUSD: allocation.revenueUsd,
                fxAtTrade: mepSellRate,
                fx: {
                    kind: 'MEP',
                    side: 'sell',
                    rate: mepSellRate,
                    asOf: now,
                },
                groupId,
                source: 'user',
                meta: {
                    costingMethod,
                    allocations: allocation.consumedLots.length > 0
                        ? allocation.consumedLots.map(cl => ({
                            lotId: cl.lot.id,
                            qty: cl.take,
                            costUsd: cl.take * cl.lot.unitCostArs,
                        }))
                        : undefined,
                },
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
                totalAmount: allocation.revenueArs,
                totalARS: allocation.revenueArs,
                fxAtTrade: mepSellRate,
                groupId,
                source: 'system',
                notes: `Acreditación por venta de ${detail.symbol} (${allocation.qtySold} certificados)`,
            }

            await createMovement.mutateAsync(creditMov)

            toast({
                title: 'Venta registrada',
                description: `Vendiste ${allocation.qtySold} ${detail.symbol} por ${formatMoneyARS(allocation.revenueArs)}. Liquidez ARS acreditada.`,
                variant: 'success',
                duration: 5000,
            })

            // Reset simulator
            setSellQty('')
            setSellPriceInput('')
            setManualAllocs({})
            setActiveTab('lots')

        } catch (err) {
            toast({
                title: 'Error al registrar venta',
                description: err instanceof Error ? err.message : 'Error desconocido',
                variant: 'error',
            })
        } finally {
            setIsConfirming(false)
        }
    }, [found, allocation, effectiveSellPrice, costingMethod, mepSellRate, createMovement, toast])

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
                    {ticker ? `Sin tenencia de ${ticker}` : 'CEDEAR no encontrado'}
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
                        <span>CEDEARs</span>
                        <span>/</span>
                        <span className="text-primary font-bold">{detail.symbol}</span>
                    </nav>
                </div>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center shadow-lg shrink-0">
                            <span className="font-bold text-2xl tracking-tighter">{detail.symbol.slice(0, 4)}</span>
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                                {detail.name}
                            </h1>
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                <span className="bg-muted border border-border px-2 py-0.5 rounded text-xs font-medium">CEDEAR</span>
                                {detail.ratio > 1 && (
                                    <span className="text-xs">Ratio {detail.ratio}:1</span>
                                )}
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span className="text-xs">{provider.name}</span>
                            </div>
                        </div>
                    </div>

                    {/* TC MEP Chip */}
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-2 items-center">
                            <span className="text-[10px] text-muted-foreground font-mono uppercase mr-1 hidden md:inline">Ref. Conversión:</span>
                            <div className="px-3 py-1.5 rounded-lg bg-background border border-primary/30 text-xs font-mono flex items-center gap-2">
                                <span className="text-primary font-bold">TC MEP (Venta)</span>
                                <span className="text-foreground font-bold">$ {formatNumberAR(mepSellRate)}</span>
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
                            <span className="block text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Precio Mercado (ARS)</span>
                            <div className="text-foreground font-mono text-sm font-medium">{formatMoneyARS(detail.currentPriceArs)}</div>
                        </div>
                        <div className="text-right">
                            <span className="block text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">Implícito (USD)</span>
                            <div className="text-muted-foreground font-mono text-sm">{formatMoneyUSD(detail.currentPriceUsd)}</div>
                        </div>
                    </div>
                </div>

                {/* Card 2: Metrics Dashboard */}
                <div className="bg-card border border-border rounded-2xl p-5 lg:col-span-2 flex flex-col justify-between relative">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 h-full">
                        {/* Tenencia */}
                        <MetricBlock label="Tenencia" highlight>
                            <div className="text-3xl font-bold tabular-nums">{formatQty(detail.totalQty, 'CEDEAR')}</div>
                            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Certificados</div>
                        </MetricBlock>

                        {/* Precio Unitario */}
                        <MetricBlock label="Precio Unitario">
                            <div className="text-lg font-mono tabular-nums mb-1">{formatMoneyARS(detail.currentPriceArs)}</div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                                <span>{formatNumberAR(detail.currentPriceUsd)}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">TC: {formatNumberAR(mepSellRate)}</div>
                        </MetricBlock>

                        {/* Invertido */}
                        <MetricBlock label="Invertido" tooltip="USD Histórico = Suma de valuaciones en USD al momento de cada compra.">
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
                                    ? 'Ganás en pesos (nominal) por la suba del MEP, pero perdés en dólares (real) por caída del subyacente.'
                                    : 'Perdés en pesos (nominal) pero ganás en dólares (real).'}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Costing Method Selector */}
            <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-mono text-muted-foreground uppercase">Método de costeo</span>
                    <div className="group relative">
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover border border-border rounded-lg text-xs text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-lg">
                            El método determina cómo se asigna el costo al vender. Afecta la ganancia/pérdida realizada en el simulador.
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1">
                    {COSTING_METHODS.map((m) => (
                        <button
                            key={m.value}
                            onClick={() => setCostingMethod(m.value)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                costingMethod === m.value
                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                            title={m.description}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border">
                <nav className="flex gap-6" aria-label="Tabs">
                    {([
                        { id: 'lots' as TabId, label: 'Compras (Lotes)' },
                        { id: 'simulator' as TabId, label: 'Simulador Venta' },
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
                            <p>No hay lotes registrados para este CEDEAR.</p>
                            <p className="text-sm mt-2">Registrá una compra desde Movimientos para ver el detalle.</p>
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-muted/50 border-b border-border text-xs font-mono text-muted-foreground uppercase">
                                        <tr>
                                            <SortableHeader label="Fecha" sortKey="date" current={sortKey} dir={sortDir} onSort={toggleSort} />
                                            <SortableHeader label="Cant" sortKey="qty" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-4 py-3 font-medium text-right">
                                                <span>Precio Compra</span>
                                                <br />
                                                <span className="text-[9px] normal-case opacity-50">ARS / US$ Hist</span>
                                            </th>
                                            <th className="px-4 py-3 font-medium text-right bg-muted/30">
                                                <span>Precio Hoy</span>
                                                <br />
                                                <span className="text-[9px] normal-case opacity-50">ARS / US$ / TC</span>
                                            </th>
                                            <SortableHeader label="Invertido" sortKey="invested" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-4 py-3 font-medium text-right">Valor Hoy</th>
                                            <SortableHeader label="Resultado" sortKey="pnlArs" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-4 py-3 w-20"><span className="sr-only">Acciones</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {sortedLots.map((lot) => (
                                            <CedearLotRow
                                                key={lot.id}
                                                lot={lot}
                                                currentPriceArs={detail.currentPriceArs}
                                                currentPriceUsd={detail.currentPriceUsd}
                                                mepSellRate={mepSellRate}
                                                onSell={(qty) => {
                                                    setSellQty(String(qty))
                                                    setActiveTab('simulator')
                                                }}
                                            />
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-muted/80 font-bold border-t border-border">
                                        <tr>
                                            <td className="px-4 py-4 text-xs">TOTALES</td>
                                            <td className="px-4 py-4 text-right text-xs tabular-nums">{formatQty(detail.totalQty, 'CEDEAR')}</td>
                                            <td className="px-4 py-4" />
                                            <td className="px-4 py-4 bg-muted/30" />
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
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: SIMULATOR */}
            {activeTab === 'simulator' && (
                <div className="space-y-6 pt-2">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        {/* Left: Configuration */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                                <h3 className="font-bold text-sm flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-primary" />
                                    Configurar Venta
                                </h3>

                                {/* Cantidad */}
                                <div className="space-y-2">
                                    <label className="text-xs font-mono text-muted-foreground uppercase">Cantidad (Nominales)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            max={totalHolding}
                                            value={costingMethod === 'MANUAL' ? effectiveSellQty || '' : sellQty}
                                            onChange={(e) => setSellQty(e.target.value)}
                                            disabled={costingMethod === 'MANUAL'}
                                            placeholder={`Máx: ${totalHolding}`}
                                            className="w-full bg-background border border-border rounded-lg py-3 px-4 font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition tabular-nums disabled:opacity-50"
                                        />
                                        <button
                                            onClick={() => costingMethod !== 'MANUAL' && setSellQty(String(totalHolding))}
                                            disabled={costingMethod === 'MANUAL'}
                                            className="absolute right-2 top-2 px-2 py-1 bg-muted text-[10px] text-primary font-bold rounded hover:bg-muted/80 transition border border-border disabled:opacity-50"
                                        >
                                            MÁX
                                        </button>
                                    </div>
                                    {effectiveSellQty > totalHolding && (
                                        <p className="text-rose-400 text-xs">No podés vender más de lo que tenés.</p>
                                    )}
                                </div>

                                {/* Precio */}
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <label className="text-xs font-mono text-muted-foreground uppercase">Precio Unitario (ARS)</label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    checked={useMarketPrice}
                                                    onChange={(e) => setUseMarketPrice(e.target.checked)}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-7 h-4 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-foreground after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                                            </div>
                                            <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition">Precio Mercado</span>
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3 text-muted-foreground font-mono text-sm">$</span>
                                        <input
                                            type="text"
                                            value={useMarketPrice ? formatNumberAR(detail.currentPriceArs) : sellPriceInput}
                                            onChange={(e) => setSellPriceInput(e.target.value)}
                                            disabled={useMarketPrice}
                                            className="w-full bg-background border border-border rounded-lg py-3 pl-8 pr-4 font-mono disabled:opacity-50 disabled:cursor-not-allowed transition tabular-nums focus:border-primary focus:outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Manual lot selector */}
                                {costingMethod === 'MANUAL' && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-mono text-muted-foreground">
                                            Seleccioná lotes y cantidades
                                        </label>
                                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                            {detail.lots.map((lot) => (
                                                <div key={lot.id} className="flex items-center gap-2 text-xs font-mono bg-muted/30 rounded px-3 py-2">
                                                    <span className="text-muted-foreground w-24 shrink-0">{formatDateDDMMYYYY(lot.dateISO)}</span>
                                                    <span className="text-muted-foreground w-20 shrink-0 text-right">{formatMoneyARS(lot.unitCostArs)}</span>
                                                    <span className="text-muted-foreground mx-1">×</span>
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        max={lot.qty}
                                                        value={manualAllocs[lot.id] ?? ''}
                                                        onChange={(e) => {
                                                            const next = { ...manualAllocs }
                                                            if (e.target.value === '' || e.target.value === '0') {
                                                                delete next[lot.id]
                                                            } else {
                                                                next[lot.id] = e.target.value
                                                            }
                                                            setManualAllocs(next)
                                                        }}
                                                        placeholder={`Máx ${lot.qty}`}
                                                        className="w-20 bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                                                    />
                                                    <span className="text-muted-foreground text-[10px]">/ {lot.qty}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TC reference */}
                                <div className="p-3 bg-muted/50 rounded-lg border border-border flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">TC Aplicable (MEP Venta)</span>
                                    <span className="text-xs font-mono font-bold">$ {formatNumberAR(mepSellRate)}</span>
                                </div>

                                {/* Confirm button */}
                                {allocation && allocation.qtySold > 0 && (
                                    <button
                                        onClick={handleConfirmSale}
                                        disabled={isConfirming}
                                        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
                                    >
                                        {isConfirming
                                            ? 'Registrando...'
                                            : `Generar movimiento de venta (${allocation.qtySold} CEDEARs)`
                                        }
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Right: Preview */}
                        <div className="lg:col-span-7 space-y-4">
                            <h3 className="text-sm font-bold">Proyección de Resultado</h3>

                            {allocation && allocation.qtySold > 0 ? (
                                <>
                                    {/* Producido */}
                                    <div className="bg-card border border-border rounded-xl p-5 border-l-4 border-l-primary/50 flex justify-between items-center">
                                        <div>
                                            <div className="text-xs text-muted-foreground uppercase font-mono mb-1">Producido (Recibís)</div>
                                            <div className="text-lg font-mono tabular-nums">{formatMoneyARS(allocation.revenueArs)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-muted-foreground uppercase mb-1">Equivalente USD</div>
                                            <div className="text-base font-mono text-emerald-400 tabular-nums">{formatMoneyUSD(allocation.revenueUsd)}</div>
                                        </div>
                                    </div>

                                    {/* Costo Asignado */}
                                    <div className="bg-card border border-border rounded-xl p-5 border-l-4 border-l-muted-foreground/30">
                                        <div className="flex justify-between items-center mb-4">
                                            <div>
                                                <div className="text-xs text-muted-foreground uppercase font-mono mb-1">Costo Asignado (Base)</div>
                                                <div className="text-lg font-mono tabular-nums">{formatMoneyARS(allocation.costArs)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-muted-foreground uppercase mb-1">Costo Hist. USD</div>
                                                <div className="text-base font-mono text-muted-foreground tabular-nums">{formatMoneyUSD(allocation.costUsd)}</div>
                                            </div>
                                        </div>

                                        {/* Consumed lots */}
                                        {costingMethod === 'PPP' ? (
                                            <div className="border-t border-border pt-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Método:</div>
                                                    <div className="text-[10px] text-muted-foreground italic">PPP (Promedio)</div>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground p-2 bg-muted/30 rounded border border-border space-y-1 font-mono">
                                                    <div className="flex justify-between">
                                                        <span>Precio Promedio Ponderado</span>
                                                        <span className="text-foreground">{formatMoneyARS(detail.avgCostArs)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Costo Hist. USD Prom.</span>
                                                        <span>{formatMoneyUSD(detail.avgCostUsd)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : allocation.consumedLots.length > 0 && (
                                            <div className="border-t border-border pt-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold">Lotes Consumidos:</div>
                                                    <div className="text-[10px] text-muted-foreground italic">
                                                        {COSTING_METHODS.find(m => m.value === costingMethod)?.label ?? costingMethod}
                                                    </div>
                                                </div>
                                                <div className="space-y-1 max-h-32 overflow-y-auto pr-2">
                                                    {allocation.consumedLots.map((cl, i) => (
                                                        <div key={i} className="flex justify-between text-[10px] text-muted-foreground border-b border-border py-2 last:border-0">
                                                            <div className="flex flex-col">
                                                                <span className="text-foreground font-mono">{formatDateDDMMYYYY(cl.lot.dateISO)}</span>
                                                                <span className="text-[9px]">TC: {formatNumberAR(cl.lot.fxAtTrade)}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="block text-primary font-bold">{cl.take} un.</span>
                                                                <span className="block text-[9px] mt-0.5">@ {formatMoneyARS(cl.lot.unitCostArs)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Resultado */}
                                    <div className={cn(
                                        "bg-card rounded-xl p-5 border-l-4 border-2 relative overflow-hidden transition-colors",
                                        allocation.pnlUsd >= 0
                                            ? 'border-emerald-500/30 bg-emerald-500/5'
                                            : 'border-rose-500/30 bg-rose-500/5'
                                    )}>
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <div className="text-xs text-muted-foreground uppercase font-mono mb-2 flex items-center gap-2">
                                                    Resultado Fiscal
                                                    <span className="px-1 py-0.5 bg-muted rounded text-[9px] border border-border">ARS</span>
                                                </div>
                                                <div className={cn("text-3xl font-mono font-bold tabular-nums tracking-tight", allocation.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatDeltaMoneyARS(allocation.pnlArs)}
                                                </div>
                                                <div className={cn("text-sm mt-1 font-mono font-bold", allocation.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatPnlPct(allocation.pctArs)}
                                                </div>
                                            </div>
                                            <div className="text-right border-l border-border pl-8">
                                                <div className="text-xs text-muted-foreground uppercase font-mono mb-2 flex items-center justify-end gap-2">
                                                    Resultado Real
                                                    <span className="px-1 py-0.5 bg-muted rounded text-[9px] border border-border">USD</span>
                                                </div>
                                                <div className={cn("text-2xl font-mono font-bold tabular-nums tracking-tight", allocation.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatDeltaMoneyUSD(allocation.pnlUsd)}
                                                </div>
                                                <div className={cn("text-xs mt-1 font-mono font-bold", allocation.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                                    {formatPnlPct(allocation.pctUsd)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                                    <p className="text-sm">
                                        {costingMethod === 'MANUAL'
                                            ? 'Seleccioná lotes y cantidades a vender.'
                                            : 'Ingresá una cantidad para ver la previsualización.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: INFO */}
            {activeTab === 'info' && (
                <div className="space-y-4 max-w-3xl pt-2">
                    <div className="bg-card border border-border p-6 rounded-xl space-y-6">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-4 border border-primary/20">
                                Modelo Mental Argfolio
                            </div>
                            <h3 className="text-2xl font-bold mb-4">¿Ganás plata o solo pesos?</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Al operar CEDEARs, intervenimos dos variables: la cotización del activo en EE.UU. y el tipo de cambio local.
                                Argfolio utiliza la punta <strong className="text-foreground">VENDEDORA</strong> del MEP para todas las conversiones ARS → USD,
                                porque ese es el precio real al que deberías pagar si quisieras reponer esos dólares en el mercado.
                            </p>
                        </div>

                        <div className="space-y-4 font-mono text-xs">
                            <div className="p-5 bg-background rounded-lg border border-border relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-muted-foreground/30" />
                                <h4 className="font-bold mb-3 flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px]">1</span>
                                    TU COSTO (INVERTIDO)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-muted-foreground mb-1">En Pesos (Nominal)</div>
                                        <div className="text-primary bg-primary/5 p-2 rounded border border-primary/10">
                                            Σ (Cantidad × Precio_Compra_ARS)
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground mb-1">En Dólares (Histórico)</div>
                                        <div className="bg-muted p-2 rounded border border-border">
                                            Σ (Costo_ARS / MEP_Venta_FechaCompra)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 bg-background rounded-lg border border-border relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                                <h4 className="font-bold mb-3 flex items-center gap-2">
                                    <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[10px]">2</span>
                                    VALOR HOY
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-muted-foreground mb-1">En Pesos</div>
                                        <div className="text-primary bg-primary/5 p-2 rounded border border-primary/10">
                                            Tenencia × Precio_Actual_ARS
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground mb-1">En Dólares (Actual)</div>
                                        <div className="bg-muted p-2 rounded border border-border">
                                            Valor_Hoy_ARS / MEP_Venta_HOY
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-200 flex gap-3 items-start">
                            <AlertTriangle className="w-5 h-5 shrink-0 opacity-70" />
                            <p>
                                <strong>Dato Clave:</strong> Si ves que ganás 50% en pesos pero estás 0% en dólares, significa que tu CEDEAR
                                solo acompañó la devaluación (suba del MEP) pero el activo subyacente no subió de precio real.
                            </p>
                        </div>
                    </div>

                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">PPP (Promedio Ponderado)</h4>
                        <p className="text-sm text-muted-foreground">
                            Calcula un costo único dividiendo el total invertido por la cantidad total.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">PEPS / FIFO</h4>
                        <p className="text-sm text-muted-foreground">
                            Primeras Entradas, Primeras Salidas. Vendés primero los certificados más antiguos.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">UEPS / LIFO</h4>
                        <p className="text-sm text-muted-foreground">
                            Últimas Entradas, Primeras Salidas. Vendés lo último que compraste primero.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Baratos primero</h4>
                        <p className="text-sm text-muted-foreground">
                            Consume primero los lotes con menor costo unitario USD histórico.
                            Desempate: el más antiguo primero.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Manual</h4>
                        <p className="text-sm text-muted-foreground">
                            Seleccioná manualmente qué lotes y cuánta cantidad vender de cada uno.
                        </p>
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
            "p-4 rounded-xl bg-background/30 border border-border/50 flex flex-col justify-center",
            highlight && "border-primary/20 bg-primary/5",
            className
        )}>
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-2 flex justify-between items-center">
                <span className={highlight ? 'text-primary' : undefined}>{label}</span>
                {tooltip && (
                    <div className="group relative">
                        <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-popover text-muted-foreground text-[10px] p-2 rounded border border-border shadow-xl opacity-0 group-hover:opacity-100 transition pointer-events-none z-20 normal-case font-sans">
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
        <th className={cn("px-4 py-3 font-medium", align === 'right' && 'text-right')}>
            <button
                onClick={() => onSort(key)}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors group"
                aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
            >
                {label}
                {isActive ? (
                    dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                )}
            </button>
        </th>
    )
}

// =============================================================================
// CEDEAR Lot Row
// =============================================================================

function CedearLotRow({
    lot,
    currentPriceArs,
    currentPriceUsd,
    mepSellRate,
    onSell,
}: {
    lot: CedearLotDetail
    currentPriceArs: number
    currentPriceUsd: number
    mepSellRate: number
    onSell: (qty: number) => void
}) {
    return (
        <tr className="hover:bg-muted/30 transition group border-b border-border last:border-0">
            <td className="px-4 py-4 text-xs align-top pt-5 whitespace-nowrap">
                {formatDateDDMMYYYY(lot.dateISO)}
                {lot.fxMissing && (
                    <span className="ml-1 text-[9px] text-yellow-500" title="TC histórico faltante">⚠</span>
                )}
            </td>
            <td className="px-4 py-4 text-right text-xs align-top pt-5">{lot.qty}</td>

            {/* Precio Compra (unit) */}
            <td className="px-4 py-4 text-right align-top">
                <div className="text-xs font-mono mb-1">{formatMoneyARS(lot.unitCostArs)}</div>
                <div className="text-xs text-muted-foreground font-mono flex items-center justify-end gap-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                    {formatNumberAR(lot.unitCostUsd)}
                </div>
                <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">TC: {formatNumberAR(lot.fxAtTrade)}</div>
            </td>

            {/* Precio Hoy (unit) */}
            <td className="px-4 py-4 text-right align-top bg-muted/10">
                <div className="text-xs font-mono mb-1">{formatMoneyARS(currentPriceArs)}</div>
                <div className="text-xs text-muted-foreground font-mono flex items-center justify-end gap-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70">US$</span>
                    {formatNumberAR(currentPriceUsd)}
                </div>
                <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">TC: {formatNumberAR(mepSellRate)}</div>
            </td>

            {/* Invertido (total lote) */}
            <td className="px-4 py-4 text-right align-top">
                <div className="text-xs font-mono text-muted-foreground mb-1">{formatMoneyARS(lot.totalCostArs)}</div>
                <div className="text-xs text-muted-foreground font-mono">{formatMoneyUSD(lot.totalCostUsd)}</div>
            </td>

            {/* Valor Hoy (total lote) */}
            <td className="px-4 py-4 text-right align-top">
                <div className="text-xs font-mono mb-1">{formatMoneyARS(lot.currentValueArs)}</div>
                <div className="text-xs text-muted-foreground font-mono">{formatMoneyUSD(lot.currentValueUsd)}</div>
                <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">TC: {formatNumberAR(mepSellRate)}</div>
            </td>

            {/* Resultado */}
            <td className="px-4 py-4 text-right align-top">
                <div className={cn("text-xs font-mono font-bold mb-1", lot.pnlArs >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {formatDeltaMoneyARS(lot.pnlArs)} <span className="opacity-75 text-[10px] font-normal">({formatPnlPct(lot.pnlPctArs)})</span>
                </div>
                <div className={cn("text-xs font-mono font-bold", lot.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {formatDeltaMoneyUSD(lot.pnlUsd)} <span className="opacity-75 text-[10px] font-normal">({formatPnlPct(lot.pnlPctUsd)})</span>
                </div>
            </td>

            {/* Acciones */}
            <td className="px-4 py-4 text-right align-middle">
                <button
                    onClick={() => onSell(lot.qty)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] uppercase font-bold text-primary bg-primary/10 px-3 py-1.5 rounded border border-primary/20 hover:bg-primary hover:text-primary-foreground"
                >
                    Vender
                </button>
            </td>
        </tr>
    )
}
