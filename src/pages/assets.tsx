
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatQty, formatPercent, formatDeltaMoneyARS, formatDeltaMoneyUSD } from '@/lib/format'
import { useAssetsRows } from '@/features/assets/useAssetsRows'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioSummaryCard } from '@/components/assets/PortfolioSummaryCard'
import { AssetDrawer } from '@/components/assets/AssetDrawer'
import type { AssetClass, AssetRowMetrics } from '@/domain/assets/types'
import { PFList } from './assets/components/PFList'
import { usePF } from '@/hooks/use-pf'
// pfStore removed

const categoryLabels: Record<AssetClass | 'all', string> = {
    all: 'Todos',
    CEDEAR: 'CEDEARs',
    CRYPTO: 'Cripto',
    STABLE: 'Stablecoins',
    CASH_USD: 'Dólares',
    CASH_ARS: 'Pesos',
    FCI: 'FCI',
    OTHER: 'Otros',
}

// ============================================================================
// Main Assets Page Component
// ============================================================================

export function AssetsPage() {
    // State
    const [categoryFilter, setCategoryFilter] = useState<AssetClass | 'all'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedAsset, setSelectedAsset] = useState<AssetRowMetrics | null>(null)

    // PF Hook (Handles logic, toast, and valuation)
    const { active: activePFs, totals: pfTotals } = usePF()



    // Data Hooks
    const {
        groupedRows,
        totals,
        isLoading,
    } = useAssetsRows({
        categoryFilter,
        searchQuery,
    })

    // Get unique categories from data
    const categories: (AssetClass | 'all')[] = useMemo(() => {
        if (!groupedRows) return ['all']
        const allMetrics = Object.values(groupedRows).flatMap(g => g.metrics)
        const cats = new Set(allMetrics.map(r => r.category))
        return ['all', ...Array.from(cats)] as (AssetClass | 'all')[]
    }, [groupedRows])



    return (
        <div className="space-y-6">
            {/* Header Row: Title + Controls */}
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                {/* Portfolio Summary */}
                <PortfolioSummaryCard
                    totalArs={totals.totalArs + pfTotals.totalActiveARS + pfTotals.totalMaturedARS}
                    totalUsdEq={totals.totalUsdEq + pfTotals.totalActiveUSD + pfTotals.totalMaturedUSD}
                    pnlArs={totals.totalPnlArs} // PF PnL not currently tracked in same way, could add interest as PnL?
                    pnlPct={totals.totalPnlPct}
                    className="lg:max-w-md"
                />

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Buscar activo..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 w-full sm:w-64 rounded-lg border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </div>
                </div>
            </div>

            {/* Category Tabs */}
            {categories.length > 1 && (
                <Tabs
                    value={categoryFilter}
                    onValueChange={(v) => setCategoryFilter(v as AssetClass | 'all')}
                >
                    <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                        <TabsList className="w-max">
                            {categories.map((cat) => (
                                <TabsTrigger key={cat} value={cat}>
                                    {categoryLabels[cat] ?? cat}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </Tabs>
            )}

            {/* Empty State (Modified to check PFs too) */}
            {!isLoading && Object.keys(groupedRows).length === 0 && activePFs.length === 0 && (
                <div className="text-center py-20 border rounded-xl bg-muted/5 border-dashed">
                    <p className="text-muted-foreground">No se encontraron activos.</p>
                </div>
            )}

            {/* PF SECTION */}
            {activePFs.length > 0 && (categoryFilter === 'all' || categoryFilter === ('pf' as any)) && (
                <PFList positions={activePFs} />
            )}

            {/* SECTIONS PER ACCOUNT */}
            {!isLoading && Object.entries(groupedRows).map(([accountId, group]) => {
                const { accountName, metrics, totals: groupTotals } = group
                if (metrics.length === 0) return null

                // ROI Calculation for Group
                const investedArs = groupTotals.valArs - groupTotals.pnlArs
                const groupRoiPct = investedArs !== 0 ? (groupTotals.pnlArs / investedArs) : 0
                const groupPnlColor = groupTotals.pnlArs >= 0 ? 'text-emerald-500' : 'text-red-500'

                // Count types
                const cedearsCount = metrics.filter(m => m.category === 'CEDEAR').length
                const cryptosCount = metrics.filter(m => m.category === 'CRYPTO').length
                const stablesCount = metrics.filter(m => m.category === 'STABLE').length
                const fciCount = metrics.filter(m => m.category === 'FCI').length

                return (
                    <div key={accountId} className="space-y-4">
                        {/* Account Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {accountName}
                                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                        {metrics.length} activos
                                    </Badge>
                                </h2>
                                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                                    {cedearsCount > 0 && <span className="bg-muted px-2 py-0.5 rounded">CEDEAR: {cedearsCount}</span>}
                                    {cryptosCount > 0 && <span className="bg-muted px-2 py-0.5 rounded">CRYPTO: {cryptosCount}</span>}
                                    {stablesCount > 0 && <span className="bg-muted px-2 py-0.5 rounded">Stablecoins: {stablesCount}</span>}
                                    {fciCount > 0 && <span className="bg-muted px-2 py-0.5 rounded">FCI: {fciCount}</span>}
                                </div>
                            </div>

                            {/* Account Summary Chips */}
                            <div className="flex flex-wrap gap-4 items-center">
                                {/* Valuation */}
                                <div className="text-right">
                                    <span className="block text-xs uppercase tracking-wider text-muted-foreground">Valuación</span>
                                    <div className="flex flex-col items-end">
                                        {metrics[0]?.category === 'CRYPTO' || metrics[0]?.category === 'STABLE' ? (
                                            <>
                                                <span className="font-bold font-numeric text-lg">{formatMoneyUSD(groupTotals.valUsd)}</span>
                                                <span className="text-xs font-mono text-muted-foreground">{formatMoneyARS(groupTotals.valArs)}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-bold font-numeric text-lg">{formatMoneyARS(groupTotals.valArs)}</span>
                                                <span className="text-xs font-mono text-sky-500">
                                                    ≈ {formatMoneyUSD(groupTotals.valUsd)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* PnL */}
                                <div className="text-right pl-4 border-l">
                                    <span className="block text-xs uppercase tracking-wider text-muted-foreground">Ganancia</span>
                                    <div className="flex flex-col items-end">
                                        {metrics[0]?.category === 'CRYPTO' || metrics[0]?.category === 'STABLE' ? (
                                            <>
                                                <span className={cn("font-bold font-numeric text-lg", groupPnlColor)}>
                                                    {formatDeltaMoneyUSD(groupTotals.pnlUsd)}
                                                </span>
                                                <span className={cn("text-xs font-mono opacity-90", groupPnlColor)}>
                                                    {formatDeltaMoneyARS(groupTotals.pnlArs)}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className={cn("font-bold font-numeric text-lg", groupPnlColor)}>
                                                    {formatDeltaMoneyARS(groupTotals.pnlArs)}
                                                </span>
                                                <span className={cn("text-xs font-mono opacity-90", groupPnlColor)}>
                                                    ≈ {formatDeltaMoneyUSD(groupTotals.pnlUsd)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* ROI */}
                                <div className="text-right pl-4 border-l">
                                    <span className="block text-xs uppercase tracking-wider text-muted-foreground">Rendimiento %</span>
                                    <span className={cn("font-bold font-numeric text-lg block", groupPnlColor)}>
                                        {/* For Crypto Group, calculate ROI on USD basis if possible, else fallback to groupRoiPct (ARS) */}
                                        {(() => {
                                            const isCryptoGroup = metrics[0]?.category === 'CRYPTO' || metrics[0]?.category === 'STABLE'
                                            if (isCryptoGroup && groupTotals.totalCostUsdEq) {
                                                return formatPercent(groupTotals.pnlUsd / groupTotals.totalCostUsdEq)
                                            }
                                            return formatPercent(groupRoiPct)
                                        })()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Account Table */}
                        <div className="border rounded-xl overflow-hidden bg-background/50 shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            {/* 1. Activo */}
                                            <th className="text-left p-4 font-medium text-muted-foreground w-[240px]">Activo</th>
                                            {/* 2. Cantidad */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Cant.</th>
                                            {/* 3. Costo prom (ARS + USD) */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Costo prom.</th>
                                            {/* 4. Invertido (ARS + USD) */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Invertido</th>
                                            {/* 5. Precio actual (ARS + USD Mkt) */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Precio</th>
                                            {/* 6. Valor actual (ARS + USD Mkt) */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Valor actual</th>
                                            {/* 7. Ganancia (ARS + USD Hist) */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">Ganancia</th>
                                            {/* 8. % Retorno */}
                                            <th className="text-right p-4 font-medium text-muted-foreground">%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {metrics.map((row) => {
                                            const pnlColor = (row.pnlPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                                            const roiColor = (row.roiPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                                            // USD Mkt Price (Derived from Valuation / Qty or explicitly passed if calc'd)
                                            const impliedPriceUsd = (row.valUsdEq && row.quantity) ? row.valUsdEq / row.quantity : 0

                                            const isCrypto = row.category === 'CRYPTO' || row.category === 'STABLE'

                                            return (
                                                <tr
                                                    key={`${row.instrumentId}-${row.accountId}`}
                                                    onClick={() => setSelectedAsset(row)}
                                                    className="hover:bg-muted/50 cursor-pointer transition-colors group"
                                                >
                                                    {/* 1. Activo */}
                                                    <td className="p-4 align-top">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 rounded-full bg-muted/20 flex items-center justify-center text-xs font-bold text-muted-foreground border border-border/50">
                                                                {row.symbol.substring(0, 2)}
                                                            </div>
                                                            <div>
                                                                <span className="block font-bold text-foreground group-hover:text-primary transition-colors">
                                                                    {row.symbol}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground line-clamp-1 max-w-[160px]">
                                                                    {row.name}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* 2. Cantidad */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <span className="font-numeric font-medium block">
                                                            {formatQty(row.quantity, row.category)}
                                                        </span>
                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1 mt-1 font-normal opacity-70">
                                                            {categoryLabels[row.category] ?? row.category}
                                                        </Badge>
                                                    </td>

                                                    {/* 3. Costo prom */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className="flex flex-col items-end">
                                                            {isCrypto ? (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyUSD(row.avgCostUsdEq)}
                                                                    </span>
                                                                    <span className="text-xs font-mono text-muted-foreground">
                                                                        {row.costArs && row.quantity ? formatMoneyARS(row.costArs / row.quantity) : '-'}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyARS(row.avgCost)}
                                                                    </span>
                                                                    {row.avgCostUsdEq != null && (
                                                                        <span className="text-xs font-mono text-sky-500">
                                                                            ≈ {formatMoneyUSD(row.avgCostUsdEq)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 4. Invertido */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className="flex flex-col items-end">
                                                            {isCrypto ? (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyUSD(row.costUsdEq)}
                                                                    </span>
                                                                    <span className="text-xs font-mono text-muted-foreground">
                                                                        {formatMoneyARS(row.investedArs)}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyARS(row.investedArs)}
                                                                    </span>
                                                                    {row.costUsdEq != null && (
                                                                        <span className="text-xs font-mono text-sky-500">
                                                                            ≈ {formatMoneyUSD(row.costUsdEq)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 5. Precio actual */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className="flex flex-col items-end">
                                                            {isCrypto ? (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyUSD(row.currentPrice)}
                                                                    </span>
                                                                    {/* Implied ARS Price = Price USD * FX Now */}
                                                                    <span className="text-xs font-mono text-muted-foreground">
                                                                        {formatMoneyARS((row.currentPrice || 0) * (row.fxRate || 0))}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyARS(row.currentPrice)}
                                                                    </span>
                                                                    {impliedPriceUsd > 0 && (
                                                                        <span className="text-xs font-mono text-sky-500">
                                                                            ≈ {formatMoneyUSD(impliedPriceUsd)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 6. Valor actual */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className="flex flex-col items-end">
                                                            {isCrypto ? (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyUSD(row.valUsdEq)}
                                                                    </span>
                                                                    <span className="text-xs font-mono text-muted-foreground">
                                                                        {formatMoneyARS(row.valArs)}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatMoneyARS(row.valArs)}
                                                                    </span>
                                                                    {row.valUsdEq != null && (
                                                                        <span className="text-xs font-mono text-sky-500">
                                                                            ≈ {formatMoneyUSD(row.valUsdEq)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}

                                                            {row.fxUsedLabel && (
                                                                <span className="text-[10px] text-muted-foreground uppercase tracking-tighter mt-0.5">
                                                                    {row.fxUsedLabel === 'Cripto' ? 'Cripto (C)' : row.fxUsedLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 7. Ganancia */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className={cn("flex flex-col items-end", pnlColor)}>
                                                            {isCrypto ? (
                                                                <>
                                                                    {/* Primary: Real USD PnL */}
                                                                    <span className="font-numeric font-medium">
                                                                        {formatDeltaMoneyUSD(row.pnlUsdEq)}
                                                                    </span>
                                                                    {/* Secondary: ARS PnL (Liquidación) */}
                                                                    <div className="flex items-center justify-end gap-1.5 opacity-90">
                                                                        <span className="text-xs font-mono">
                                                                            {formatDeltaMoneyARS(row.pnlArs)}
                                                                        </span>
                                                                        {row.category === 'STABLE' && (
                                                                            <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1 rounded h-3.5 flex items-center" title="Impacto por tipo de cambio">
                                                                                FX
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="font-numeric font-medium">
                                                                        {formatDeltaMoneyARS(row.pnlArs)}
                                                                    </span>
                                                                    {/* Secondary: USD Equivalent of ARS PnL */}
                                                                    {(() => {
                                                                        const pnlUsdEquiv = (row.pnlArs !== null && row.fxRate) ? row.pnlArs / row.fxRate : row.pnlUsdEq
                                                                        if (pnlUsdEquiv == null) return null
                                                                        return (
                                                                            <span className="text-xs font-mono opacity-90">
                                                                                ≈ {formatDeltaMoneyUSD(pnlUsdEquiv)}
                                                                            </span>
                                                                        )
                                                                    })()}
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 8. % Retorno */}
                                                    <td className="p-4 text-right align-top pt-5">
                                                        <div className={cn("flex flex-col items-end", roiColor)}>
                                                            <span className="font-numeric font-bold">
                                                                {row.roiPct != null ? formatPercent(row.roiPct) : '—'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
            })}

            {/* Asset Drawer */}
            <AssetDrawer
                asset={selectedAsset}
                isOpen={selectedAsset !== null}
                onClose={() => setSelectedAsset(null)}
            />
        </div>
    )
}
