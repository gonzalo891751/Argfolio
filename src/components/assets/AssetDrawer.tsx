/**
 * Asset Drawer
 * Slide-in detail panel for individual asset
 */

import { useState, useEffect, useMemo } from 'react'
import { X, Info, Box } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatQty, formatPercent } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { AssetRowMetrics } from '@/domain/assets/types'
import { useMovements } from '@/hooks/use-movements'
import { buildFifoLots } from '@/domain/portfolio/fifo'
import { useMarketCedears } from '@/hooks/useMarketCedears'
import { formatNumberAR } from '@/lib/format'

interface AssetDrawerProps {
    asset: AssetRowMetrics | null
    isOpen: boolean
    onClose: () => void
}

const categoryLabels: Record<string, string> = {
    CEDEAR: 'CEDEAR',
    CRYPTO: 'Cripto',
    STABLE: 'Stablecoin',
    CASH_ARS: 'Pesos',
    CASH_USD: 'Dólares',
    FCI: 'FCI',
    OTHER: 'Otro',
}

export function AssetDrawer({ asset, isOpen, onClose }: AssetDrawerProps) {
    const [tab, setTab] = useState("resumen")
    const { data: allMovements = [] } = useMovements()

    // Reset tab when asset changes
    useEffect(() => {
        if (isOpen) setTab("resumen")
    }, [isOpen, asset?.instrumentId])

    // Compute FIFO Inventory Lots for this asset
    const inventoryLots = useMemo(() => {
        if (!asset) return []

        // Filter movements for this asset AND account
        const assetMovements = allMovements.filter(m =>
            m.instrumentId === asset.instrumentId &&
            m.accountId === asset.accountId
        )

        // Build FIFO lots
        // Note: buildFifoLots expects all movements (buy/sell) to compute remaining.
        const result = buildFifoLots(assetMovements)

        // Return remaining lots
        return result.lots
    }, [asset, allMovements])

    // if (!asset) return null // MOVED TO BOTTOM

    const pnlColor = (asset?.pnlPct ?? 0) >= 0 ? 'text-success' : 'text-destructive'
    const changeColor = (asset?.changePct1d ?? 0) >= 0 ? 'text-success' : 'text-destructive'
    const pnlSign = (asset?.pnlArs ?? 0) >= 0 ? '+' : ''

    // Formatting helper
    const isCedear = asset?.category === 'CEDEAR'
    // For Drawer "Resumen" specific display logic:
    // User requested "Costo prom USD eq" in summary.

    // Fetch Market Data for Structure Tab (if CEDEAR, ensuring singular result)
    // We reuse useMarketCedears to avoid duplicate fetching logic, leveraging its caching
    const { rows: marketRows, isPricesLoading } = useMarketCedears({
        query: isCedear && asset?.symbol ? asset.symbol : '',
        pageSize: 1,
        mode: 'all', // Ensure we search broadly
        enabled: isOpen && isCedear && !!asset?.symbol
    })

    // Get the first matching item (should be the correct one due to exact query match mostly)
    // But safely check ticker
    const marketDetails = marketRows.find(r => r.ticker === asset?.symbol) ?? null

    const exposureDetails = useMemo(() => {
        if (!marketDetails || !marketDetails.underlyingUsd || !marketDetails.ratio || !asset?.quantity) return null
        const underlyingShares = asset.quantity / marketDetails.ratio
        return {
            underlyingShares,
            exposureUsd: underlyingShares * marketDetails.underlyingUsd
        }
    }, [marketDetails, asset?.quantity])

    if (!asset) return null // Safe early return MOVED HERE

    const hasStructure = isCedear // Always show structure tab for CEDEARs, loading state handles content

    return (
        <>
            {/* Overlay */}
            <div
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div
                className={cn(
                    "fixed right-0 top-0 h-full w-full max-w-md bg-background border-l shadow-2xl flex flex-col overflow-hidden z-50",
                    "transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header (Opaque, Sticky) */}
                <div className="flex items-start justify-between p-6 border-b bg-background z-10 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold">{asset.symbol}</h2>
                            <Badge variant="secondary" className="text-xs">
                                {categoryLabels[asset.category] ?? asset.category}
                            </Badge>
                            <Badge variant="outline" className="text-xs ml-auto">
                                {asset.accountName}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{asset.name}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-muted">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-muted/5 p-6">
                    <Tabs value={tab} onValueChange={setTab} className="w-full h-full flex flex-col">
                        <TabsList className="w-full grid grid-cols-3 mb-6">
                            <TabsTrigger value="resumen">Resumen</TabsTrigger>
                            <TabsTrigger value="inventario">Inventario</TabsTrigger>
                            <TabsTrigger value="estructura" disabled={!hasStructure}>Estructura</TabsTrigger>
                        </TabsList>

                        <TabsContent value="resumen" className="flex-1 space-y-6 mt-0">
                            {/* Big Valuation Card */}
                            <div className="glass rounded-xl p-6 border shadow-sm">
                                <p className="text-sm text-muted-foreground mb-1">Valuación Total</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold tracking-tight">
                                        {formatMoneyARS(asset.valArs)}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground font-medium mt-1">
                                    ≈ {formatMoneyUSD(asset.valUsdEq)}
                                </p>
                            </div>

                            {/* Key Metrics Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* PnL */}
                                <div className="glass rounded-lg p-4 border">
                                    <div className="flex items-center gap-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Ganancia</p>
                                    </div>
                                    <div className={cn("flex flex-col", pnlColor)}>
                                        <span className="text-lg font-bold font-numeric">
                                            {asset.pnlArs != null ? `${pnlSign}${formatMoneyARS(Math.abs(asset.pnlArs))}` : '—'}
                                        </span>
                                        {asset.pnlUsdEq != null && (
                                            <span className="text-xs font-mono opacity-90 mt-1">
                                                ≈ {(asset.pnlUsdEq >= 0 ? '+' : '') + formatMoneyUSD(asset.pnlUsdEq)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Var 1D */}
                                <div className="glass rounded-lg p-4 border">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Var. Diario</p>
                                    <div className={cn("flex flex-col", changeColor)}>
                                        <span className="text-lg font-bold font-numeric">
                                            {asset.changePct1d != null ? formatPercent(asset.changePct1d) : '—'}
                                        </span>
                                        <span className="text-xs font-medium">
                                            {asset.changeArs1d != null ? (asset.changeArs1d >= 0 ? '+' : '') + formatMoneyARS(asset.changeArs1d) : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Position Details List */}
                            <div className="glass rounded-xl border p-1 space-y-px bg-border/50">
                                <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors first:rounded-t-lg">
                                    <span className="text-sm text-muted-foreground">Cantidad</span>
                                    <span className="font-medium font-numeric">{formatQty(asset.quantity, asset.category)}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors">
                                    <span className="text-sm text-muted-foreground">Precio Actual</span>
                                    {/* Implied Price Display */}
                                    <div className="text-right">
                                        <span className="block font-medium font-numeric">{asset.valArs && asset.quantity ? formatMoneyARS(asset.valArs / asset.quantity) : '—'}</span>
                                        {asset.valUsdEq && asset.quantity && (
                                            <span className="block text-xs font-mono text-emerald-500 dark:text-emerald-400">
                                                ≈ {formatMoneyUSD(asset.valUsdEq / asset.quantity)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors">
                                    <span className="text-sm text-muted-foreground">Costo Promedio</span>
                                    <div className="text-right">
                                        <span className="block font-medium font-numeric">{formatMoneyARS(asset.avgCost)}</span>
                                        {asset.avgCostUsdEq != null && (
                                            <span className="block text-xs font-mono text-emerald-500 dark:text-emerald-400">
                                                ≈ {formatMoneyUSD(asset.avgCostUsdEq)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors">
                                    <span className="text-sm text-muted-foreground">Invertido</span>
                                    <div className="text-right">
                                        <span className="block font-medium font-numeric">{formatMoneyARS(asset.investedArs)}</span>
                                        {asset.costUsdEq != null && (
                                            <span className="block text-xs font-mono text-emerald-500 dark:text-emerald-400">
                                                ≈ {formatMoneyUSD(asset.costUsdEq)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors last:rounded-b-lg">
                                    <span className="text-sm text-muted-foreground">FX Referencia</span>
                                    <span className="font-medium text-xs bg-muted px-2 py-1 rounded">
                                        {asset.fxUsedLabel}
                                    </span>
                                </div>
                            </div>
                        </TabsContent>

                        {/* INVENTARIO TAB (WAS MOVIMIENTOS) */}
                        <TabsContent value="inventario" className="flex-1 space-y-6 mt-0">
                            {inventoryLots.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    Sin inventario activo.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 px-1">
                                        <Box className="h-4 w-4" />
                                        <span>Lotes Restantes (PEPS/FIFO)</span>
                                    </div>

                                    {inventoryLots.map((lot, idx) => (
                                        <div key={idx} className="glass rounded-lg border p-3 bg-background/40">
                                            <div className="flex justify-between mb-3 border-b pb-2">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {new Date(lot.date).toLocaleDateString()}
                                                </span>
                                                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                                                    {formatQty(lot.quantity, asset.category)} nominales
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                {/* Unit Cost */}
                                                <div>
                                                    <span className="text-muted-foreground text-xs block mb-1">Costo Unitario</span>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium font-numeric">{formatMoneyARS(lot.unitCostArs)}</span>
                                                        <span className="text-[10px] text-emerald-500 font-mono">
                                                            ≈ {formatMoneyUSD(lot.unitCostUsd)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Total Cost of Lot */}
                                                <div className="text-right">
                                                    <span className="text-muted-foreground text-xs block mb-1">Costo Lote</span>
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold font-numeric">{formatMoneyARS(lot.unitCostArs * lot.quantity)}</span>
                                                        <span className="text-[10px] text-emerald-500 font-mono">
                                                            ≈ {formatMoneyUSD(lot.unitCostUsd * lot.quantity)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* FX Info */}
                                                <div className="col-span-2 flex justify-between items-center text-xs text-muted-foreground bg-muted/30 p-1.5 rounded mt-1">
                                                    <span>FX de compra</span>
                                                    <span className="font-mono">
                                                        {formatMoneyARS(lot.unitCostArs / (lot.unitCostUsd || 1))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        {hasStructure && (
                            <TabsContent value="estructura" className="flex-1 space-y-6 mt-0">
                                <div className="glass rounded-xl p-6 border shadow-sm flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                        <Info className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">Estructura CEDEAR</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Detalle del activo subyacente y tipo de cambio implícito en tiempo real.
                                        </p>
                                    </div>
                                </div>

                                <div className="glass rounded-xl border p-1 space-y-px bg-border/50">
                                    {/* Ratio */}
                                    <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors first:rounded-t-lg">
                                        <span className="text-sm text-muted-foreground">Ratio de Conversión</span>
                                        <Badge variant="outline">
                                            {marketDetails?.ratioText ?? asset.cedearDetails?.ratioText ?? '—'}
                                        </Badge>
                                    </div>

                                    {/* Subyacente USD */}
                                    <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors">
                                        <span className="text-sm text-muted-foreground">Precio Subyacente (USD)</span>
                                        <span className={cn("font-medium font-numeric", marketDetails?.underlyingUsd ? "text-sky-500" : "")}>
                                            {marketDetails?.underlyingUsd != null
                                                ? formatMoneyUSD(marketDetails.underlyingUsd)
                                                : isPricesLoading ? 'Cargando...' : '—'}
                                        </span>
                                    </div>

                                    {/* Exposición Real USD */}
                                    <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors">
                                        <span className="text-sm text-muted-foreground">Exposición Real (USD)</span>
                                        <div className="text-right">
                                            <span className={cn("font-medium font-numeric block", exposureDetails?.exposureUsd ? "text-sky-500" : "")}>
                                                {exposureDetails?.exposureUsd != null
                                                    ? formatMoneyUSD(exposureDetails.exposureUsd)
                                                    : isPricesLoading ? 'Cargando...' : '—'}
                                            </span>
                                            {exposureDetails?.underlyingShares != null && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    ≈ {formatNumberAR(exposureDetails.underlyingShares, 2)} acciones
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* CCL Implícito */}
                                    <div className="flex justify-between items-center p-3 bg-background/50 hover:bg-background/80 transition-colors last:rounded-b-lg">
                                        <span className="text-sm text-muted-foreground">Dólar Implícito (CCL)</span>
                                        <span className="font-medium font-numeric">
                                            {marketDetails?.cclImplicit != null
                                                ? formatMoneyARS(marketDetails.cclImplicit)
                                                : isPricesLoading ? 'Cargando...' : '—'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground text-center">
                                    Datos de mercado (PPI + Stooq). Puede haber delay.
                                </div>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>
            </div>
        </>
    )
}
