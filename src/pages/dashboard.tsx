import { useMemo } from 'react'
import { TrendingUp, DollarSign, Wallet } from 'lucide-react'
import { useComputedPortfolio } from '@/hooks/use-computed-portfolio'
import { useSnapshots } from '@/hooks/use-snapshots'
import { useDebts } from '@/hooks/use-debts'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PortfolioChart } from '@/components/dashboard/portfolio-chart'
import { CompositionChart } from '@/components/dashboard/composition-chart'
import { TopPositionsChart } from '@/components/dashboard/top-positions'
import { DebtsSummaryCard } from '@/components/dashboard/debts-card'
import { EmptyState } from '@/components/dashboard/empty-state'



export function DashboardPage() {
    const { data: portfolio, isLoading } = useComputedPortfolio()
    const { data: snapshots = [] } = useSnapshots()
    const { data: debts = [] } = useDebts()

    const hasHoldings = portfolio && (portfolio.totalARS > 0 || portfolio.categories.length > 0)
    const hasSnapshots = snapshots.length > 0

    // Prepare chart data from snapshots
    const chartData = useMemo(() => {
        if (!hasSnapshots) return []
        return [...snapshots]
            .reverse()
            .map((s) => ({
                date: s.dateLocal,
                value: s.totalARS,
            }))
    }, [snapshots, hasSnapshots])

    // Prepare composition data
    const compositionData = useMemo(() => {
        if (!portfolio) return []
        return portfolio.categories
            .filter((c) => c.totalARS > 0)
            .map((c) => ({
                name: c.label,
                value: c.totalARS,
                category: c.category,
            }))
    }, [portfolio])

    // Prepare top positions data
    const topPositionsData = useMemo(() => {
        if (!portfolio) return []
        return portfolio.topPositions.map((p) => ({
            symbol: p.instrument.symbol,
            name: p.instrument.name,
            value: p.valueARS ?? 0,
        }))
    }, [portfolio])

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">Resumen de tu portfolio de inversiones</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Patrimonio Total"
                    valueArs={portfolio?.totalARS ?? 0}
                    valueUsd={portfolio?.totalUSD}
                    icon={Wallet}
                    isLoading={isLoading}
                    variant="highlight"
                />
                <KpiCard
                    title="Liquidez"
                    valueArs={portfolio?.liquidityARS ?? 0}
                    valueUsd={portfolio?.liquidityUSD}
                    icon={DollarSign}
                    isLoading={isLoading}
                />
                <KpiCard
                    title="PnL Realizado"
                    valueArs={portfolio?.realizedPnL ?? 0}
                    icon={TrendingUp}
                    isLoading={isLoading}
                />
                <KpiCard
                    title="PnL No Realizado"
                    valueArs={portfolio?.unrealizedPnL ?? 0}
                    icon={TrendingUp}
                    isLoading={isLoading}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <PortfolioChart data={chartData} hasData={hasSnapshots} />
                <CompositionChart data={compositionData} />
            </div>

            {/* Empty state or category cards */}
            {!isLoading && !hasHoldings ? (
                <EmptyState />
            ) : (
                <>
                    {/* Top positions */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <TopPositionsChart data={topPositionsData} />
                        {debts.length > 0 && <DebtsSummaryCard />}
                    </div>
                </>
            )}
        </div>
    )
}
