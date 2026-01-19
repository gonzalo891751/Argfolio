import { useState, useMemo, useEffect } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatQty, formatPercent, formatDeltaMoneyARS, formatDeltaMoneyUSD } from '@/lib/format'
import { useAssetsRows } from '@/features/assets/useAssetsRows'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioSummaryCard } from '@/components/assets/PortfolioSummaryCard'
import { AssetDrawer } from '@/components/assets/AssetDrawer'
import type { AssetClass, AssetRowMetrics } from '@/domain/assets/types'
import { AccountFixedDepositsBlock } from '@/components/assets/AccountFixedDepositsBlock'
import { usePF } from '@/hooks/use-pf'
import { generateAccrualMovements } from '@/domain/yield/accrual'
import { useAccounts } from '@/hooks/use-instruments'
import { useFxRates } from '@/hooks/use-fx-rates'
import type { Movement } from '@/domain/types'
import { useAccountMigration } from '@/hooks/use-account-dedupe'
import { YieldSummaryCard } from '@/components/assets/YieldSummaryCard'
import { db } from '@/db'
import { useToast } from '@/components/ui/toast'

const categoryLabels: Record<AssetClass | 'all', string> = {
    all: 'Todos',
    CEDEAR: 'CEDEARs',
    CRYPTO: 'Cripto',
    STABLE: 'Stablecoins',
    CASH_USD: 'Dólares',
    CASH_ARS: 'Pesos',
    FCI: 'FCI',
    PF: 'Plazos Fijos',
    OTHER: 'Otros',
}

// ============================================================================
// Main Assets Page Component
// ============================================================================

export function AssetsPage() {
    // State
    useAccountMigration()
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

    const { data: accounts } = useAccounts()
    const { data: fxRates } = useFxRates()

    // Get unique categories from data
    const categories: (AssetClass | 'all')[] = useMemo(() => {
        if (!groupedRows) return ['all']
        const allMetrics = Object.values(groupedRows).flatMap(g => g.metrics)
        const cats = new Set(allMetrics.map(r => r.category))
        return ['all', ...Array.from(cats)] as (AssetClass | 'all')[]
    }, [groupedRows])

    const { toast } = useToast()

    // ------------------------------------------------------------------------
    // YIELD ACCRUAL ENGINE TRIGGER
    // ------------------------------------------------------------------------
    useEffect(() => {
        const runAccrual = async () => {
            if (!accounts || !groupedRows) return

            let anyUpdates = false
            const allMovs: Movement[] = []
            // Use UTC Date for consistency, assuming midnight UTC cutoff
            const todayStr = new Date().toISOString().slice(0, 10)

            for (const acc of accounts) {
                if (acc.cashYield?.enabled) {
                    const group = groupedRows[acc.id]
                    if (!group) continue

                    // Calculate Cash Balance (ARS)
                    const cashArsParams = group.metrics.filter(m => m.category === 'CASH_ARS')
                    const cashBalance = cashArsParams.reduce((sum, m) => sum + (m.valArs || 0), 0)

                    if (cashBalance > 0) {
                        const { movements, newLastAccrued } = generateAccrualMovements(acc, cashBalance, todayStr)

                        if (movements.length > 0) {
                            allMovs.push(...movements)
                            await db.accounts.update(acc.id, {
                                cashYield: {
                                    ...acc.cashYield,
                                    lastAccruedDate: newLastAccrued
                                }
                            })

                            // Optimization: Check for dups before push? generateAccrual uses ID.
                            allMovs.push(...movements)
                            anyUpdates = true
                        }
                    }
                }
            }

            if (anyUpdates && allMovs.length > 0) {
                await db.movements.bulkPut(allMovs)
                toast({
                    title: 'Rendimiento Acreditado',
                    description: `Se han generado ${allMovs.length} movimientos de interés.`,
                })
            }
        }

        runAccrual()
    }, [accounts, groupedRows, toast])



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

            {/* PF SECTION REMOVED - Migrated to per-account view */}

            {/* SECTIONS PER ACCOUNT */}
            {!isLoading && accounts?.map((account) => {
                const accountId = account.id
                // Get pre-calculated group or fallback to empty
                const group = groupedRows?.[accountId]
                const metrics = group?.metrics || []
                const groupTotals = group?.totals || { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0, costArs: 0, costUsdEq: 0, totalCostUsdEq: 0, totalPnlArs: 0, totalPnlPct: 0 }
                const accountName = account.name

                // Check PFs
                const accountPFs = activePFs.filter(pf => pf.accountId === accountId)
                const hasPFs = accountPFs.length > 0

                // Visibility Check: Has Rows OR Has PFs
                if (metrics.length === 0 && !hasPFs) return null

                // ROI Calculation for Group
                const investedArs = groupTotals.valArs - groupTotals.pnlArs
                const groupRoiPct = investedArs !== 0 ? (groupTotals.pnlArs / investedArs) : 0
                const groupPnlColor = groupTotals.pnlArs >= 0 ? 'text-emerald-500' : 'text-red-500'

                // Count types for Chips
                const typeCounts = metrics.reduce((acc, m) => {
                    const catLabel = m.category === 'CASH_USD' ? 'Dólares' : (categoryLabels[m.category] ?? m.category)
                    acc[catLabel] = (acc[catLabel] || 0) + 1
                    return acc
                }, {} as Record<string, number>)

                // Add PF count if exists
                if (hasPFs) {
                    typeCounts['Plazos Fijos'] = (typeCounts['Plazos Fijos'] || 0) + accountPFs.length
                }

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
                                    {(() => {
                                        // Yield Badge moved to Summary Card
                                        return null
                                    })()}
                                </h2>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {Object.entries(typeCounts).map(([label, count]) => (
                                        <span key={label} className="bg-muted px-2 py-0.5 rounded text-xs text-muted-foreground border border-border/50">
                                            {label}: {count}
                                        </span>
                                    ))}
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

                        {/* Yield Summary Card */}
                        {(() => {
                            const account = accounts?.find(a => a.id === accountId)
                            const cashArsParams = metrics.filter(m => m.category === 'CASH_ARS')
                            const balanceArs = cashArsParams.reduce((sum, m) => sum + (m.valArs || 0), 0)
                            const cashUsdParams = metrics.filter(m => m.category === 'CASH_USD')
                            // For CASH_USD, valUsdEq IS the quantity (Price=1, if valArs is Price*Qty, valUsdEq is ValArs/FX?)
                            // Wait. CASH_USD. valArs = USD * FX. valUsdEq = USD.
                            // So valUsdEq is correct.
                            const balanceUsd = cashUsdParams.reduce((sum, m) => sum + (m.valUsdEq || 0), 0)

                            const hasCash = balanceArs > 0 || balanceUsd > 0
                            const hasYield = account?.cashYield?.enabled

                            if (hasCash || hasYield) {
                                return (
                                    <div className="px-1">
                                        <YieldSummaryCard
                                            account={account!}
                                            balanceArs={balanceArs}
                                            balanceUsd={balanceUsd}
                                            fxOfficial={fxRates?.oficial.sell || 1}
                                        />
                                    </div>
                                )
                            }
                            return null
                        })()}

                        {/* Fixed Deposits Block (Per Account) */}
                        {(() => {
                            const accountPFs = activePFs.filter(pf => pf.accountId === accountId)
                            if (accountPFs.length === 0) return null

                            return (
                                <AccountFixedDepositsBlock
                                    accountId={accountId}
                                    positions={accountPFs}
                                    fxOfficial={fxRates?.oficial.sell || 1}
                                />
                            )
                        })()}

                        {/* Account Table */}
                        {(() => {
                            const excludeCats = ['CASH_ARS', 'CASH_USD', 'PF']
                            const hasNonCashAssets = metrics.some(m => !excludeCats.includes(m.category))

                            if (!hasNonCashAssets) return null

                            const filteredMetrics = metrics.filter(m => !excludeCats.includes(m.category))

                            return (
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
                                                {filteredMetrics.map((row) => {
                                                    const pnlColor = (row.pnlPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                                                    // For USD Cash, user wants PnL to be neutral if USD PnL is 0
                                                    const pnlUsdColor = (row.pnlUsdEq ?? 0) === 0 ? 'text-muted-foreground' : ((row.pnlUsdEq ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500')

                                                    // ROI color based on ARS for Cash, or row.roiPct
                                                    const roiColor = (row.roiPct ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'

                                                    // Determine Primary Currency
                                                    const isUsdPrimary = row.category === 'CASH_USD' || row.category === 'CRYPTO' || row.category === 'STABLE'

                                                    // Labels
                                                    const categoryLabel = row.category === 'CASH_USD' ? 'Dólares' : (categoryLabels[row.category] ?? row.category)

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
                                                                    {categoryLabel}
                                                                </Badge>
                                                            </td>

                                                            {/* 3. Costo prom */}
                                                            <td className="p-4 text-right align-top pt-5">
                                                                <div className="flex flex-col items-end">
                                                                    {isUsdPrimary ? (
                                                                        <>
                                                                            <span className="font-numeric font-medium">
                                                                                {formatMoneyUSD(row.avgCostUsdEq ?? (row.category === 'CASH_USD' ? 1 : 0))}
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
                                                                    {isUsdPrimary ? (
                                                                        <>
                                                                            <span className="font-numeric font-medium">
                                                                                {formatMoneyUSD(row.costUsdEq)}
                                                                            </span>
                                                                            <span className="text-xs font-mono text-muted-foreground">
                                                                                {formatMoneyARS(row.costArs)}
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
                                                                    {isUsdPrimary ? (
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
                                                                            {row.valUsdEq && row.quantity ? (
                                                                                <span className="text-xs font-mono text-sky-500">
                                                                                    ≈ {formatMoneyUSD(row.valUsdEq / row.quantity)}
                                                                                </span>
                                                                            ) : null}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* 6. Valor actual */}
                                                            <td className="p-4 text-right align-top pt-5">
                                                                <div className="flex flex-col items-end">
                                                                    {isUsdPrimary ? (
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
                                                                            {row.fxUsedLabel === 'Cripto' ? 'Cripto' : row.fxUsedLabel}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* 7. Ganancia */}
                                                            <td className="p-4 text-right align-top pt-5">
                                                                <div className="flex flex-col items-end">
                                                                    {isUsdPrimary ? (
                                                                        <>
                                                                            {/* Primary: Real USD PnL (Neutral color for 0) */}
                                                                            <span className={cn("font-numeric font-medium", pnlUsdColor)}>
                                                                                {formatDeltaMoneyUSD(row.pnlUsdEq)}
                                                                            </span>
                                                                            {/* Secondary: ARS PnL (Colored) */}
                                                                            <div className={cn("flex items-center justify-end gap-1.5 opacity-90 text-xs font-mono", pnlColor)}>
                                                                                {formatDeltaMoneyARS(row.pnlArs)}
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className={cn("font-numeric font-medium", pnlColor)}>
                                                                                {formatDeltaMoneyARS(row.pnlArs)}
                                                                            </span>
                                                                            {/* Secondary: USD Equivalent of ARS PnL */}
                                                                            {(() => {
                                                                                const pnlUsdEquiv = (row.pnlArs !== null && row.fxRate) ? row.pnlArs / row.fxRate : row.pnlUsdEq
                                                                                if (pnlUsdEquiv == null) return null
                                                                                return (
                                                                                    <span className={cn("text-xs font-mono opacity-90", pnlColor)}>
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
                            )
                        })()}
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
