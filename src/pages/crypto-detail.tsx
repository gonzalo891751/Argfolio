/**
 * Crypto Detail Page — Subpágina de detalle de activo cripto
 *
 * Muestra:
 * - Hero card con Valor de Mercado (USD + ARS equivalente)
 * - KPIs: Tenencia, Precio Promedio, Precio Actual, Invertido, Ganancia Total
 * - Tabla de Lotes (compras FIFO) con PnL puntual y CTA "Vender"
 * - Tab "Cómo se calcula"
 *
 * Diseño basado en docs/prototypes/mis_activos/Cripto.html
 */

import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Bitcoin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatDeltaMoneyUSD, formatQty } from '@/lib/format'
import { usePortfolioV2 } from '@/features/portfolioV2'
import type { CryptoDetail, LotDetail, ItemV2, ProviderV2 } from '@/features/portfolioV2/types'

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

type TabId = 'lots' | 'info'

// =============================================================================
// Main Component
// =============================================================================

export function CryptoDetailPage() {
    const { accountId, symbol } = useParams<{ accountId: string; symbol: string }>()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<TabId>('lots')

    // Data hooks
    const portfolio = usePortfolioV2()

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

    // Sort lots by date descending for display
    const sortedLots = [...detail.lots].sort(
        (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
    )

    // Handler: Sell from lot → navigate to movements with prefill
    const handleSellFromLot = (lot: LotDetail) => {
        // Build a prefill movement object for the wizard
        const prefillMovement = {
            id: '', // empty = new movement
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
                    {/* Background Glow */}
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

            {/* Tabs */}
            <div className="border-b border-border mt-6">
                <nav className="flex gap-6" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('lots')}
                        className={cn(
                            "py-4 px-1 text-sm font-medium transition-colors border-b-2",
                            activeTab === 'lots'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Compras (Lotes)
                    </button>
                    <button
                        onClick={() => setActiveTab('info')}
                        className={cn(
                            "py-4 px-1 text-sm font-medium transition-colors border-b-2",
                            activeTab === 'info'
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        Cómo se calcula
                    </button>
                </nav>
            </div>

            {/* Tab Content: Lots */}
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
                                            <th className="px-6 py-3 font-medium">Fecha</th>
                                            <th className="px-6 py-3 font-medium text-right">Cantidad</th>
                                            <th className="px-6 py-3 font-medium text-right">Precio Compra</th>
                                            <th className="px-6 py-3 font-medium text-right">Invertido</th>
                                            <th className="px-6 py-3 font-medium text-right">Valor Hoy</th>
                                            <th className="px-6 py-3 font-medium text-right">Resultado</th>
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
                                {sortedLots.length} lote{sortedLots.length !== 1 ? 's' : ''} · PPP (Precio Promedio Ponderado)
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
