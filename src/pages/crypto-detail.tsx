/**
 * Crypto Detail Page — Subpágina de detalle de activo cripto
 *
 * Muestra:
 * - Hero card con Valor de Mercado (USD + ARS equivalente)
 * - KPIs: Tenencia, Precio Promedio, Precio Actual, Invertido, Ganancia Total
 * - Selector de método de costeo (PPP/PEPS/UEPS/Baratos/Manual)
 * - Tabla de Lotes (compras FIFO) sorteable por columnas
 * - Simulador de venta con asignación de lotes según método
 * - Tab "Cómo se calcula"
 *
 * Diseño basado en docs/prototypes/mis_activos/Cripto.html
 */

import { useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Bitcoin, ArrowUpDown, ChevronUp, ChevronDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatDeltaMoneyUSD, formatQty } from '@/lib/format'
import { usePortfolioV2 } from '@/features/portfolioV2'
import type { CryptoDetail, LotDetail, ItemV2, ProviderV2 } from '@/features/portfolioV2/types'
import { useCostingMethod } from '@/hooks/use-preferences'
import {
    allocateSale,
    COSTING_METHODS,
    type ManualAllocation,
    type SaleAllocation,
} from '@/domain/portfolio/lot-allocation'
import { useCreateMovement } from '@/hooks/use-movements'
import { useInstruments, useCreateInstrument } from '@/hooks/use-instruments'
import { useToast } from '@/components/ui/toast'
import type { Movement, Instrument } from '@/domain/types'

// =============================================================================
// Helpers
// =============================================================================

function formatPnlPct(value: number): string {
    const pct = value * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function formatDateShort(isoDate: string): string {
    try {
        const d = new Date(isoDate)
        return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return isoDate.slice(0, 10)
    }
}

type TabId = 'lots' | 'simulator' | 'info'
type SortKey = 'date' | 'qty' | 'unitCost' | 'totalCost' | 'value' | 'pnl'
type SortDir = 'asc' | 'desc'

// =============================================================================
// Main Component
// =============================================================================

export function CryptoDetailPage() {
    const { accountId, symbol } = useParams<{ accountId: string; symbol: string }>()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabId>('lots')

    // Sort state for lots table
    const [sortKey, setSortKey] = useState<SortKey>('date')
    const [sortDir, setSortDir] = useState<SortDir>('desc')

    // Costing method (persisted)
    const { method: costingMethod, setMethod: setCostingMethod } = useCostingMethod()

    // Simulator state
    const [sellQty, setSellQty] = useState<string>('')
    const [sellPrice, setSellPrice] = useState<string>('')
    const [manualAllocs, setManualAllocs] = useState<Record<string, string>>({})
    const [isConfirming, setIsConfirming] = useState(false)

    // Data hooks
    const portfolio = usePortfolioV2()
    const { data: instruments = [] } = useInstruments()
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const { toast } = useToast()

    // Find the item + provider in the crypto rubro
    const found = useMemo((): { item: ItemV2; provider: ProviderV2; detail: CryptoDetail } | null => {
        if (!portfolio || !accountId || !symbol) return null

        const cryptoRubro = portfolio.rubros.find(r => r.id === 'crypto')
        if (!cryptoRubro) return null

        for (const provider of cryptoRubro.providers) {
            const item = provider.items.find(
                it => it.kind === 'crypto' && it.symbol === symbol && it.accountId === accountId
            )
            if (item) {
                const detail = portfolio.cryptoDetails.get(item.id)
                if (detail) return { item, provider, detail }
            }
        }
        return null
    }, [portfolio, accountId, symbol])

    // FX rate
    const criptoSellRate = portfolio?.fx.cryptoSell ?? 1

    // Sorted lots for table
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
                    return dir * (a.unitCostNative - b.unitCostNative)
                case 'totalCost':
                    return dir * (a.totalCostNative - b.totalCostNative)
                case 'value':
                    return dir * (a.currentValueNative - b.currentValueNative)
                case 'pnl':
                    return dir * (a.pnlNative - b.pnlNative)
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

    // Sell price (default to current)
    const effectiveSellPrice = useMemo(() => {
        const parsed = parseFloat(sellPrice)
        if (!isNaN(parsed) && parsed > 0) return parsed
        return found?.detail.currentPriceUsd ?? 0
    }, [sellPrice, found])

    // Sell qty
    const effectiveSellQty = useMemo(() => {
        const parsed = parseFloat(sellQty)
        if (!isNaN(parsed) && parsed > 0) return parsed
        return 0
    }, [sellQty])

    // Manual allocations for MANUAL method
    const parsedManualAllocs = useMemo((): ManualAllocation[] => {
        return Object.entries(manualAllocs)
            .map(([lotId, qtyStr]) => ({ lotId, qty: parseFloat(qtyStr) || 0 }))
            .filter(a => a.qty > 0)
    }, [manualAllocs])

    // Effective qty for manual: sum of manual allocations
    const manualTotalQty = useMemo(() => {
        return parsedManualAllocs.reduce((s, a) => s + a.qty, 0)
    }, [parsedManualAllocs])

    // Sale allocation preview
    const allocation = useMemo((): SaleAllocation | null => {
        if (!found) return null
        const lots = found.detail.lots
        const qty = costingMethod === 'MANUAL' ? manualTotalQty : effectiveSellQty
        if (qty <= 0) return null
        return allocateSale(lots, qty, effectiveSellPrice, costingMethod, parsedManualAllocs)
    }, [found, effectiveSellQty, effectiveSellPrice, costingMethod, parsedManualAllocs, manualTotalQty])

    // Handler: Sell from lot → navigate to movements with prefill (legacy)
    const handleSellFromLot = (lot: LotDetail) => {
        if (!found) return
        const { item, detail } = found
        const prefillMovement = {
            id: '',
            type: 'SELL' as const,
            assetClass: 'crypto' as const,
            accountId: item.accountId,
            instrumentId: item.instrumentId || '',
            ticker: item.symbol,
            assetName: item.label,
            quantity: lot.qty,
            unitPrice: detail.currentPriceUsd,
            tradeCurrency: 'USD',
            totalAmount: lot.qty * detail.currentPriceUsd,
            totalUSD: lot.qty * detail.currentPriceUsd,
            datetimeISO: new Date().toISOString(),
            fxAtTrade: criptoSellRate,
            fx: {
                kind: 'CRIPTO',
                side: 'sell' as const,
                rate: criptoSellRate,
                asOf: new Date().toISOString(),
            },
        }
        navigate('/movements', { state: { prefillMovement } })
    }

    // Handler: Confirm sale from simulator
    const handleConfirmSale = useCallback(async () => {
        if (!found || !allocation || allocation.totalQtySold <= 0) return
        const { item, detail } = found

        setIsConfirming(true)
        try {
            const groupId = crypto.randomUUID()
            const now = new Date().toISOString()

            // 1. Create SELL movement for the crypto
            const sellMov: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: now,
                type: 'SELL',
                assetClass: 'crypto',
                accountId: item.accountId,
                instrumentId: item.instrumentId || '',
                ticker: item.symbol,
                assetName: item.label,
                quantity: allocation.totalQtySold,
                unitPrice: effectiveSellPrice,
                tradeCurrency: 'USD',
                totalAmount: allocation.totalProceedsUsd,
                totalUSD: allocation.totalProceedsUsd,
                fxAtTrade: criptoSellRate,
                fx: {
                    kind: 'CRIPTO',
                    side: 'sell',
                    rate: criptoSellRate,
                    asOf: now,
                },
                groupId,
                source: 'user',
                meta: {
                    allocations: allocation.allocations.length > 0 ? allocation.allocations : undefined,
                    costingMethod,
                },
            }

            await createMovement.mutateAsync(sellMov)

            // 2. Credit USDT in the same exchange
            // Find existing USDT instrument or create one
            let usdtInstrument = instruments.find(
                (i: Instrument) => i.symbol === 'USDT' && i.category === 'STABLE'
            )

            if (!usdtInstrument) {
                usdtInstrument = {
                    id: 'usdt',
                    symbol: 'USDT',
                    name: 'Tether',
                    category: 'STABLE',
                    nativeCurrency: 'USDT',
                    priceKey: 'tether',
                    coingeckoId: 'tether',
                }
                await createInstrument.mutateAsync(usdtInstrument)
            }

            const creditMov: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: now,
                type: 'BUY',
                assetClass: 'crypto',
                accountId: item.accountId,
                instrumentId: usdtInstrument.id,
                ticker: 'USDT',
                assetName: 'Tether',
                quantity: allocation.totalProceedsUsd,
                unitPrice: 1,
                tradeCurrency: 'USD',
                totalAmount: allocation.totalProceedsUsd,
                totalUSD: allocation.totalProceedsUsd,
                fxAtTrade: criptoSellRate,
                fx: {
                    kind: 'CRIPTO',
                    side: 'sell',
                    rate: criptoSellRate,
                    asOf: now,
                },
                groupId,
                source: 'system',
                notes: `Acreditación por venta de ${detail.symbol}`,
            }

            await createMovement.mutateAsync(creditMov)

            toast({
                title: 'Venta registrada',
                description: `Vendiste ${formatQty(allocation.totalQtySold, 'CRYPTO')} ${detail.symbol} por ${formatMoneyUSD(allocation.totalProceedsUsd)}. USDT acreditado en ${found.provider.name}.`,
                variant: 'success',
                duration: 5000,
            })

            // Reset simulator
            setSellQty('')
            setSellPrice('')
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
    }, [found, allocation, effectiveSellPrice, costingMethod, criptoSellRate, instruments, createMovement, createInstrument, toast, navigate])

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
                    {symbol ? `Sin tenencia de ${symbol}` : 'Activo no encontrado'}
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

    const { item, provider, detail } = found
    const totalHolding = detail.totalQty

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            {/* Breadcrumb + Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/mis-activos-v2')}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <nav className="flex items-center text-sm font-mono text-muted-foreground">
                        <Link to="/mis-activos-v2" className="hover:text-foreground transition-colors">
                            Mis Activos
                        </Link>
                        <span className="mx-2">/</span>
                        <span>Cripto</span>
                        <span className="mx-2">/</span>
                        <span className="text-foreground font-medium">{item.label}</span>
                    </nav>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded bg-background border border-border text-[10px] font-mono text-muted-foreground">
                        TC Venta: <span className="text-sky-400 font-bold">${criptoSellRate.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <button
                        onClick={() => navigate('/movements')}
                        className="p-2 rounded-lg text-primary border border-primary/30 hover:bg-primary/10 transition text-xs font-medium"
                    >
                        Ver Movimientos
                    </button>
                </div>
            </div>

            {/* Hero Section: 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Balance Card */}
                <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="relative z-10">
                        <div className="flex items-start justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                                    <Bitcoin className="w-7 h-7" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold">{item.label}</h1>
                                    <p className="text-sm text-muted-foreground">
                                        {provider.name} · {item.symbol}
                                    </p>
                                </div>
                            </div>
                            {detail.pnlPct !== 0 && (
                                <div className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm font-mono font-medium border",
                                    detail.pnlPct >= 0
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                )}>
                                    {detail.pnlPct >= 0 ? '▲' : '▼'} {formatPnlPct(detail.pnlPct)}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-mono text-muted-foreground">Valor de Mercado</div>
                            <div className="text-4xl md:text-5xl font-mono font-medium tracking-tight flex items-baseline gap-2">
                                {formatMoneyUSD(detail.currentValueUsd)}
                                <span className="text-lg text-muted-foreground font-normal">USD</span>
                            </div>
                            <div className="text-lg font-mono text-emerald-400">
                                ≈ {formatMoneyARS(detail.currentValueArs)} ARS
                            </div>
                        </div>
                    </div>
                </div>

                {/* KPI Grid Card */}
                <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Tenencia (Qty)</div>
                        <div className="text-xl font-mono">
                            {formatQty(detail.totalQty, 'CRYPTO')} {item.symbol}
                        </div>
                    </div>
                    <div className="h-px bg-border my-4" />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-[10px] font-mono text-muted-foreground uppercase">Precio Promedio</div>
                            <div className="text-sm font-mono mt-1">{formatMoneyUSD(detail.avgCostUsd)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-mono text-muted-foreground uppercase">Precio Actual</div>
                            <div className="text-sm font-mono text-primary mt-1">{formatMoneyUSD(detail.currentPriceUsd)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-mono text-muted-foreground uppercase">Invertido</div>
                            <div className="text-sm font-mono mt-1">{formatMoneyUSD(detail.totalCostUsd)}</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-mono text-muted-foreground uppercase">Ganancia Total</div>
                            <div className={cn(
                                "text-sm font-mono mt-1 font-bold",
                                detail.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                {formatDeltaMoneyUSD(detail.pnlUsd)} ({formatPnlPct(detail.pnlPct)})
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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

            {/* Tab Content: Lots (sortable) */}
            {activeTab === 'lots' && (
                <div className="space-y-4 pt-2">
                    {sortedLots.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No hay lotes registrados para este activo.</p>
                            <p className="text-sm mt-2">Registrá una compra desde Movimientos para ver el detalle.</p>
                        </div>
                    ) : (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-muted/50 border-b border-border text-xs font-mono text-muted-foreground uppercase">
                                        <tr>
                                            <SortableHeader label="Fecha" sortKey="date" current={sortKey} dir={sortDir} onSort={toggleSort} />
                                            <SortableHeader label="Cantidad" sortKey="qty" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <SortableHeader label="Precio Compra" sortKey="unitCost" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <SortableHeader label="Invertido" sortKey="totalCost" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <SortableHeader label="Valor Hoy" sortKey="value" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <SortableHeader label="Resultado" sortKey="pnl" current={sortKey} dir={sortDir} onSort={toggleSort} align="right" />
                                            <th className="px-6 py-3 font-medium text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {sortedLots.map((lot) => (
                                            <LotRow
                                                key={lot.id}
                                                lot={lot}
                                                onSell={handleSellFromLot}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Summary row */}
                    {sortedLots.length > 0 && (
                        <div className="flex items-center justify-between px-6 py-3 bg-muted/30 rounded-lg text-sm font-mono">
                            <span className="text-muted-foreground">
                                {sortedLots.length} lote{sortedLots.length !== 1 ? 's' : ''} · {COSTING_METHODS.find(m => m.value === costingMethod)?.label ?? costingMethod}
                            </span>
                            <span className={cn(
                                "font-bold",
                                detail.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            )}>
                                Total: {formatDeltaMoneyUSD(detail.pnlUsd)} ({formatPnlPct(detail.pnlPct)})
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Tab Content: Sale Simulator */}
            {activeTab === 'simulator' && (
                <div className="space-y-6 pt-2">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Input */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                            <h3 className="font-bold text-sm">Simular venta de {item.symbol}</h3>

                            {/* Quantity */}
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1.5">
                                    Cantidad a vender
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        max={totalHolding}
                                        value={costingMethod === 'MANUAL' ? manualTotalQty || '' : sellQty}
                                        onChange={(e) => setSellQty(e.target.value)}
                                        disabled={costingMethod === 'MANUAL'}
                                        placeholder={`Máx: ${formatQty(totalHolding, 'CRYPTO')}`}
                                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                                    />
                                    <button
                                        onClick={() => {
                                            if (costingMethod !== 'MANUAL') {
                                                setSellQty(String(totalHolding))
                                            }
                                        }}
                                        disabled={costingMethod === 'MANUAL'}
                                        className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary/20 transition disabled:opacity-50"
                                    >
                                        MAX
                                    </button>
                                </div>
                                {effectiveSellQty > totalHolding && (
                                    <p className="text-rose-400 text-xs mt-1">No podés vender más de lo que tenés.</p>
                                )}
                            </div>

                            {/* Price */}
                            <div>
                                <label className="block text-xs font-mono text-muted-foreground mb-1.5">
                                    Precio de venta (USD)
                                </label>
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={sellPrice}
                                    onChange={(e) => setSellPrice(e.target.value)}
                                    placeholder={`Actual: ${formatMoneyUSD(detail.currentPriceUsd)}`}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>

                            {/* Manual lot selector */}
                            {costingMethod === 'MANUAL' && (
                                <ManualLotSelector
                                    lots={detail.lots}
                                    allocs={manualAllocs}
                                    onChange={setManualAllocs}
                                />
                            )}

                            {/* Confirm button */}
                            {allocation && allocation.totalQtySold > 0 && (
                                <button
                                    onClick={handleConfirmSale}
                                    disabled={isConfirming}
                                    className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
                                >
                                    {isConfirming
                                        ? 'Registrando...'
                                        : `Generar movimiento de venta (${formatQty(allocation.totalQtySold, 'CRYPTO')} ${item.symbol})`
                                    }
                                </button>
                            )}
                        </div>

                        {/* Right: Preview */}
                        <div className="space-y-4">
                            {allocation && allocation.totalQtySold > 0 ? (
                                <>
                                    {/* Proceeds */}
                                    <div className="bg-card border border-border rounded-xl p-5">
                                        <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Producido (Recibido)</div>
                                        <div className="text-2xl font-mono font-bold">
                                            {formatMoneyUSD(allocation.totalProceedsUsd)} <span className="text-sm text-muted-foreground font-normal">USD</span>
                                        </div>
                                        <div className="text-sm font-mono text-emerald-400">
                                            ≈ {formatMoneyARS(allocation.totalProceedsUsd * criptoSellRate)} ARS
                                        </div>
                                    </div>

                                    {/* Cost assigned */}
                                    <div className="bg-card border border-border rounded-xl p-5">
                                        <div className="text-xs font-mono text-muted-foreground uppercase mb-1">
                                            Costo asignado ({COSTING_METHODS.find(m => m.value === costingMethod)?.short})
                                        </div>
                                        <div className="text-xl font-mono">
                                            {formatMoneyUSD(allocation.totalCostUsd)}
                                        </div>
                                    </div>

                                    {/* PnL Card */}
                                    <div className={cn(
                                        "rounded-xl p-5 border-2",
                                        allocation.realizedPnlUsd >= 0
                                            ? 'bg-emerald-500/5 border-emerald-500/30'
                                            : 'bg-rose-500/5 border-rose-500/30'
                                    )}>
                                        <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Ganancia / Pérdida Realizada</div>
                                        <div className={cn(
                                            "text-2xl font-mono font-bold",
                                            allocation.realizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                        )}>
                                            {formatDeltaMoneyUSD(allocation.realizedPnlUsd)}
                                            <span className="text-sm ml-2">
                                                ({formatPnlPct(allocation.realizedPnlPct)})
                                            </span>
                                        </div>
                                        <div className={cn(
                                            "text-sm font-mono mt-1",
                                            allocation.realizedPnlUsd >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'
                                        )}>
                                            ≈ {formatMoneyARS(allocation.realizedPnlUsd * criptoSellRate)} ARS
                                        </div>
                                    </div>

                                    {/* Lot allocation visualization (non-PPP) */}
                                    {costingMethod !== 'PPP' && allocation.allocations.length > 0 && (
                                        <div className="bg-card border border-border rounded-xl p-5">
                                            <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Lotes a consumir</div>
                                            <div className="space-y-2">
                                                {allocation.allocations.map((a, i) => {
                                                    const lot = detail.lots.find(l => l.id === a.lotId)
                                                    return (
                                                        <div key={i} className="flex items-center justify-between text-xs font-mono py-1.5 px-3 bg-muted/30 rounded">
                                                            <span className="text-muted-foreground">
                                                                {lot ? formatDateShort(lot.dateISO) : a.lotId}
                                                            </span>
                                                            <span>
                                                                {formatQty(a.qty, 'CRYPTO')} × {formatMoneyUSD(lot?.unitCostNative ?? 0)}
                                                            </span>
                                                            <span className="text-muted-foreground">
                                                                = {formatMoneyUSD(a.costUsd)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
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

            {/* Tab Content: Info */}
            {activeTab === 'info' && (
                <div className="space-y-4 max-w-2xl pt-2">
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Precio Promedio Ponderado (PPP)</h4>
                        <p className="text-sm text-muted-foreground">
                            Calcula un costo único dividiendo el total invertido por la cantidad total de tokens.
                            Es el método más común para simplificar el seguimiento.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">PEPS / FIFO</h4>
                        <p className="text-sm text-muted-foreground">
                            Primeras Entradas, Primeras Salidas. Asume que vendés primero los tokens más antiguos.
                            Suele generar mayor ganancia fiscal si compraste barato hace mucho.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">UEPS / LIFO</h4>
                        <p className="text-sm text-muted-foreground">
                            Últimas Entradas, Primeras Salidas. Asume que vendés lo último que compraste.
                            Útil si querés realizar pérdidas o vender lo caro primero.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Baratos primero</h4>
                        <p className="text-sm text-muted-foreground">
                            Consume primero los lotes con menor precio de compra unitario.
                            Si dos lotes tienen el mismo costo, se consume el más antiguo.
                            Útil para minimizar ganancia fiscal realizada.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Manual</h4>
                        <p className="text-sm text-muted-foreground">
                            Seleccioná manualmente qué lotes y cuánta cantidad vender de cada uno.
                            Ideal para estrategia fiscal precisa.
                        </p>
                    </div>
                    <div className="bg-card border border-border p-5 rounded-xl">
                        <h4 className="font-bold mb-2">Valuación en ARS</h4>
                        <p className="text-sm text-muted-foreground">
                            Todos los precios y resultados se calculan en USD (moneda nativa de cripto).
                            La valuación en ARS usa el tipo de cambio "Cripto Venta" del mercado,
                            y se muestra como referencia secundaria.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Sortable Header Component
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
        <th className={cn("px-6 py-3 font-medium", align === 'right' && 'text-right')}>
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
// Lot Row Component
// =============================================================================

function LotRow({
    lot,
    onSell,
}: {
    lot: LotDetail
    onSell: (lot: LotDetail) => void
}) {
    const pnlPositive = lot.pnlNative >= 0

    return (
        <tr className="hover:bg-muted/30 transition group">
            <td className="px-6 py-4 text-muted-foreground">
                {formatDateShort(lot.dateISO)}
            </td>
            <td className="px-6 py-4 text-right">
                {formatQty(lot.qty, 'CRYPTO')}
            </td>
            <td className="px-6 py-4 text-right text-muted-foreground text-xs">
                {formatMoneyUSD(lot.unitCostNative)}
            </td>
            <td className="px-6 py-4 text-right text-xs">
                {formatMoneyUSD(lot.totalCostNative)}
            </td>
            <td className="px-6 py-4 text-right text-xs">
                {formatMoneyUSD(lot.currentValueNative)}
            </td>
            <td className="px-6 py-4 text-right">
                <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold border",
                    pnlPositive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                )}>
                    {pnlPositive ? '+' : ''}{formatMoneyUSD(lot.pnlNative)} ({formatPnlPct(lot.pnlPct)})
                </span>
            </td>
            <td className="px-6 py-4 text-right">
                <button
                    onClick={() => onSell(lot)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1 rounded text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10"
                >
                    Vender
                </button>
            </td>
        </tr>
    )
}

// =============================================================================
// Manual Lot Selector Component
// =============================================================================

function ManualLotSelector({
    lots,
    allocs,
    onChange,
}: {
    lots: LotDetail[]
    allocs: Record<string, string>
    onChange: (allocs: Record<string, string>) => void
}) {
    // Sort lots by date for manual selection
    const sorted = useMemo(() =>
        [...lots].sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()),
        [lots]
    )

    return (
        <div className="space-y-2">
            <label className="block text-xs font-mono text-muted-foreground">
                Seleccioná lotes y cantidades
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {sorted.map((lot) => (
                    <div key={lot.id} className="flex items-center gap-2 text-xs font-mono bg-muted/30 rounded px-3 py-2">
                        <span className="text-muted-foreground w-24 shrink-0">{formatDateShort(lot.dateISO)}</span>
                        <span className="text-muted-foreground w-20 shrink-0 text-right">{formatMoneyUSD(lot.unitCostNative)}</span>
                        <span className="text-muted-foreground mx-1">×</span>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            max={lot.qty}
                            value={allocs[lot.id] ?? ''}
                            onChange={(e) => {
                                const next = { ...allocs }
                                if (e.target.value === '' || e.target.value === '0') {
                                    delete next[lot.id]
                                } else {
                                    next[lot.id] = e.target.value
                                }
                                onChange(next)
                            }}
                            placeholder={`Máx ${formatQty(lot.qty, 'CRYPTO')}`}
                            className="w-28 bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <span className="text-muted-foreground text-[10px]">/ {formatQty(lot.qty, 'CRYPTO')}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
