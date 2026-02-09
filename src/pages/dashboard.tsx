
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
    AreaChart,
    Area,
    CartesianGrid,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import {
    ArrowRight,
    BarChart3,
    Bell,
    Clock3,
    Info,
    Plus,
    RefreshCw,
    Sparkles,
    TrendingDown,
    TrendingUp,
    Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import { usePortfolioV2, type ItemV2 } from '@/features/portfolioV2'
import { useMovements } from '@/hooks/use-movements'
import {
    useAutoSnapshotsSetting,
    useClearSnapshots,
    useSaveSnapshot,
    useSnapshots,
} from '@/hooks/use-snapshots'
import { MovementWizard } from '@/pages/movements/components'
import {
    computeAnnualizedVolatility,
    computeMaxDrawdown,
    computeReturns,
    computeSharpeRatio,
    getSnapshotForPeriod,
    type SnapshotPeriod,
} from '@/features/dashboardV2/snapshot-helpers'
import { buildSnapshotAssetKey } from '@/features/dashboardV2/snapshot-v2'
import {
    computeDashboardMetrics,
    type DashboardRange,
    type DriverMetricRow,
} from '@/features/dashboardV2/dashboard-metrics'
import {
    computeProjectedEarningsByRubro,
    type HorizonKey,
    type ProjectedEarningsByRubroRow,
} from '@/features/dashboardV2/projected-earnings'
import { computeCurrencyExposureSummary } from '@/features/dashboardV2/currency-exposure'

type ChartCurrency = 'ARS' | 'USD'
type ChartRange = '1D' | '7D' | '30D' | '90D' | '1Y' | 'MAX'
type ChartMode = 'HIST' | 'PROJ'
type DriversRange = DashboardRange
type IncomeRange = DashboardRange
type DriversMode = 'historico' | 'proyeccion'

const GLASS_PANEL = 'glass-panel rounded-xl border border-white/10'

const CHART_RANGES: ChartRange[] = ['1D', '7D', '30D', '90D', '1Y', 'MAX']
const DRIVERS_RANGES: DriversRange[] = ['TOTAL', '1D', '7D', '30D', '90D', '1Y']
const INCOME_RANGES: IncomeRange[] = ['1D', '7D', '30D', '90D', '1Y', 'TOTAL']
const DRIVERS_PROJECTION_LABELS: Record<DriversRange, string> = {
    TOTAL: 'HOY',
    '1D': 'MAN',
    '7D': '7D',
    '30D': '30D',
    '90D': '90D',
    '1Y': '1A',
}
const DRIVERS_PROJECTION_HORIZONS: Record<DriversRange, HorizonKey> = {
    TOTAL: 'HOY',
    '1D': 'MAN',
    '7D': '7D',
    '30D': '30D',
    '90D': '90D',
    '1Y': '1A',
}

const RUBRO_LABELS: Record<string, string> = {
    wallets: 'Billeteras',
    frascos: 'Frascos',
    plazos: 'Plazos Fijos',
    cedears: 'CEDEARs',
    crypto: 'Cripto',
    fci: 'Fondos (FCI)',
}

const RUBRO_COLORS: Record<string, string> = {
    wallets: '#6366F1',
    frascos: '#8B5CF6',
    plazos: '#0EA5E9',
    cedears: '#10B981',
    crypto: '#F59E0B',
    fci: '#3B82F6',
    unknown: '#64748B',
}

interface DisplayDelta {
    deltaArs: number
    deltaUsd: number
    deltaPct: number | null
}

interface AssetLookup {
    label: string
    symbol: string
    route: string | null
}

function formatCompactMoney(value: number): string {
    const abs = Math.abs(value)
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    return value.toFixed(0)
}

function formatSignedPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'N/A'
    const formatted = new Intl.NumberFormat('es-AR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.abs(value))
    return `${value >= 0 ? '+' : '-'}${formatted}`
}

function formatShortDate(dateKey: string): string {
    const date = new Date(`${dateKey}T00:00:00`)
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function getFxRefUsdArs(portfolio: ReturnType<typeof usePortfolioV2> | null): number | null {
    if (!portfolio || portfolio.isLoading) return null
    const fx = portfolio.fx.mepSell || portfolio.fx.officialSell || portfolio.fx.mepBuy || portfolio.fx.officialBuy || 0
    return fx > 0 ? fx : null
}

function resolveUsdValue(valueUsd: number, valueArs: number, fxRef: number | null): number | null {
    if (Number.isFinite(valueUsd)) return valueUsd
    if (fxRef === null || fxRef <= 0) return null
    if (!Number.isFinite(valueArs)) return null
    return valueArs / fxRef
}

function average(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10)
}

function mapItemToRoute(item: ItemV2): string | null {
    switch (item.kind) {
        case 'wallet_yield':
        case 'cash_ars':
        case 'cash_usd':
            return `/mis-activos-v2/billeteras/${item.accountId}?kind=${item.kind}`
        case 'plazo_fijo':
            return `/mis-activos-v2/plazos-fijos/${item.id}`
        case 'crypto':
        case 'stable':
            return `/mis-activos-v2/cripto/${item.accountId}/${item.symbol}`
        case 'cedear':
            return `/mis-activos-v2/cedears/${item.accountId}/${item.symbol}`
        case 'fci':
            return `/mis-activos-v2/fondos/${item.accountId}/${encodeURIComponent(item.instrumentId ?? item.symbol)}`
        default:
            return null
    }
}

export function DashboardPage() {
    const navigate = useNavigate()
    const portfolio = usePortfolioV2()
    const { data: snapshots = [] } = useSnapshots()
    const { data: movements = [] } = useMovements()
    const saveSnapshot = useSaveSnapshot()
    const clearSnapshots = useClearSnapshots()
    const { autoSnapshotsEnabled, setAutoSnapshotsEnabled } = useAutoSnapshotsSetting()

    const [movementWizardOpen, setMovementWizardOpen] = useState(false)
    const [chartCurrency, setChartCurrency] = useState<ChartCurrency>('ARS')
    const [chartRange, setChartRange] = useState<ChartRange>('30D')
    const [chartMode, setChartMode] = useState<ChartMode>('HIST')
    const [driversRange, setDriversRange] = useState<DriversRange>('TOTAL')
    const [driversMode, setDriversMode] = useState<DriversMode>('historico')
    const [netIncomeRange, setNetIncomeRange] = useState<IncomeRange>('30D')
    const [selectedDriverRubro, setSelectedDriverRubro] = useState<string | null>(null)
    const [hoveredSlice, setHoveredSlice] = useState<string | null>(null)

    const userName = useMemo(() => {
        const firstName = localStorage.getItem('argfolio.user.firstName')?.trim()
        const fullName = localStorage.getItem('argfolio.user.name')?.trim()
        if (firstName) return firstName
        if (!fullName) return ''
        return fullName.split(' ')[0]
    }, [])

    const snapshotsV2Asc = useMemo(() => {
        return snapshots
            .filter((snapshot) => snapshot.source === 'v2')
            .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
    }, [snapshots])

    const currentAssetLookup = useMemo(() => {
        const lookup = new Map<string, AssetLookup>()
        if (!portfolio || portfolio.isLoading) return lookup

        for (const rubro of portfolio.rubros) {
            for (const provider of rubro.providers) {
                for (const item of provider.items) {
                    const assetKey = buildSnapshotAssetKey(item)
                    lookup.set(assetKey, {
                        label: item.label || item.symbol,
                        symbol: item.symbol,
                        route: mapItemToRoute(item),
                    })
                }
            }
        }

        return lookup
    }, [portfolio])

    const chartSeries = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return []

        const baseSeries = snapshotsV2Asc.map((snapshot) => ({
            dateKey: snapshot.dateLocal,
            ars: snapshot.totalARS,
            usd: snapshot.totalUSD,
        }))

        const todayKey = toDateKey(new Date())
        const currentPoint = {
            dateKey: todayKey,
            ars: portfolio.kpis.totalArs,
            usd: portfolio.kpis.totalUsd,
        }

        if (baseSeries.length === 0) {
            baseSeries.push(currentPoint)
        } else if (baseSeries[baseSeries.length - 1].dateKey === todayKey) {
            baseSeries[baseSeries.length - 1] = currentPoint
        } else {
            baseSeries.push(currentPoint)
        }

        if (chartRange === 'MAX') return baseSeries

        const baseline = getSnapshotForPeriod(
            snapshotsV2Asc,
            chartRange as SnapshotPeriod,
            new Date()
        )
        if (!baseline) return baseSeries

        return baseSeries.filter((point) => point.dateKey >= baseline.dateLocal)
    }, [portfolio, snapshotsV2Asc, chartRange])

    const chartData = useMemo(() => {
        if (chartSeries.length === 0) return []

        const values = chartSeries.map((point) => chartCurrency === 'ARS' ? point.ars : point.usd)
        const returns = computeReturns(values)
        const recentTrend = returns.length >= 7
            ? clamp(average(returns.slice(-14)), -0.03, 0.03)
            : 0

        let yieldWeightedRate = 0
        let nonYieldWeightedRate = 0

        if (portfolio && !portfolio.isLoading) {
            const items = portfolio.rubros.flatMap((rubro) => rubro.providers.flatMap((provider) => provider.items))
            const totalCurrent = chartCurrency === 'ARS' ? portfolio.kpis.totalArs : portfolio.kpis.totalUsd

            if (totalCurrent > 0) {
                let yieldValue = 0
                let weightedYieldGrowth = 0

                for (const item of items) {
                    const itemValue = chartCurrency === 'ARS' ? item.valArs : item.valUsd
                    const tna = item.yieldMeta?.tna ?? 0
                    if (tna <= 0 || itemValue <= 0) continue
                    const dailyRate = (Math.pow(1 + (tna / 100), 1 / 365)) - 1
                    yieldValue += itemValue
                    weightedYieldGrowth += itemValue * dailyRate
                }

                yieldWeightedRate = weightedYieldGrowth / totalCurrent
                nonYieldWeightedRate = ((totalCurrent - yieldValue) / totalCurrent) * recentTrend
            }
        }

        const projectionDailyRate = yieldWeightedRate + nonYieldWeightedRate
        const horizonByRange: Record<ChartRange, number> = {
            '1D': 1,
            '7D': 7,
            '30D': 30,
            '90D': 45,
            '1Y': 60,
            'MAX': 90,
        }

        type DashboardChartPoint = {
            dateKey: string
            label: string
            historical?: number
            projected?: number
        }

        const base: DashboardChartPoint[] = chartSeries.map((point) => ({
            dateKey: point.dateKey,
            label: formatShortDate(point.dateKey),
            historical: chartCurrency === 'ARS' ? point.ars : point.usd,
            projected: undefined as number | undefined,
        }))

        if (chartMode === 'HIST') return base

        const withProjection = [...base]
        const lastPoint = withProjection[withProjection.length - 1]
        if (!lastPoint) return withProjection
        const lastHistorical = lastPoint.historical ?? 0
        lastPoint.projected = lastHistorical

        let rollingValue = lastHistorical
        const rollingDate = new Date(`${lastPoint.dateKey}T00:00:00`)

        for (let idx = 1; idx <= horizonByRange[chartRange]; idx++) {
            rollingDate.setDate(rollingDate.getDate() + 1)
            rollingValue = rollingValue * (1 + projectionDailyRate)
            const dateKey = toDateKey(rollingDate)
            withProjection.push({
                dateKey,
                label: formatShortDate(dateKey),
                projected: rollingValue,
            })
        }

        return withProjection
    }, [chartSeries, chartCurrency, chartMode, chartRange, portfolio])

    const exposureSummary = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return null
        return computeCurrencyExposureSummary(portfolio.rubros, portfolio.fx)
    }, [portfolio])

    const riskMetrics = useMemo(() => {
        if (!portfolio || portfolio.isLoading) {
            return {
                volatility30d: null as number | null,
                maxDrawdown90d: null as number | null,
                sharpe1y: null as number | null,
                exposureUsdPct: null as number | null,
            }
        }

        const arsSeries = chartSeries.map((point) => point.ars)
        const volatility30d = computeAnnualizedVolatility(computeReturns(arsSeries.slice(-31)))
        const maxDrawdown90d = computeMaxDrawdown(arsSeries.slice(-91))
        const sharpe1y = computeSharpeRatio(computeReturns(arsSeries.slice(-366)))

        return {
            volatility30d,
            maxDrawdown90d,
            sharpe1y,
            exposureUsdPct: exposureSummary?.pctHard ?? null,
        }
    }, [chartSeries, portfolio, exposureSummary])

    const dashboardMetricsForDrivers = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return null
        return computeDashboardMetrics({
            portfolio,
            snapshots,
            movements,
            range: driversRange,
        })
    }, [portfolio, snapshots, movements, driversRange])

    const periodDeltas = useMemo(() => ({
        day: dashboardMetricsForDrivers?.variation24h.value ?? null,
        dayHint: dashboardMetricsForDrivers?.variation24h.missingHint ?? 'Falta historial para variacion diaria.',
        mtd: dashboardMetricsForDrivers?.mtd.value ?? null,
        mtdHint: dashboardMetricsForDrivers?.mtd.missingHint ?? 'Falta snapshot base del mes.',
        ytd: dashboardMetricsForDrivers?.ytd.value ?? null,
        ytdHint: dashboardMetricsForDrivers?.ytd.missingHint ?? 'Falta snapshot base del ano.',
    }), [dashboardMetricsForDrivers])

    const liquidity = useMemo(() => {
        if (!portfolio || portfolio.isLoading) {
            return {
                cashArs: 0,
                investedArs: 0,
                investedPct: 0,
            }
        }

        const cashArs = portfolio.rubros
            .filter((rubro) => rubro.id === 'wallets' || rubro.id === 'frascos')
            .reduce((sum, rubro) => sum + rubro.totals.ars, 0)
        const investedArs = Math.max(0, portfolio.kpis.totalArs - cashArs)
        const investedPct = portfolio.kpis.totalArs > 0 ? (investedArs / portfolio.kpis.totalArs) * 100 : 0

        return { cashArs, investedArs, investedPct }
    }, [portfolio])

    const netIncomeMetric = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return null
        if (dashboardMetricsForDrivers && netIncomeRange === driversRange) {
            return dashboardMetricsForDrivers.netIncome
        }
        return computeDashboardMetrics({
            portfolio,
            snapshots,
            movements,
            range: netIncomeRange,
        }).netIncome
    }, [portfolio, snapshots, movements, netIncomeRange, driversRange, dashboardMetricsForDrivers])

    const driversComputation = useMemo(() => {
        if (!dashboardMetricsForDrivers) {
            return {
                rows: [] as DriverMetricRow[],
                label: '',
                status: 'missing_history' as const,
                missingHint: 'Falta historial para calcular drivers.',
            }
        }
        return dashboardMetricsForDrivers.drivers
    }, [dashboardMetricsForDrivers])

    const driversFxRef = useMemo(() => getFxRefUsdArs(portfolio), [portfolio])

    const projectedDriversHorizon = DRIVERS_PROJECTION_HORIZONS[driversRange]

    const projectedDrivers = useMemo(() => {
        if (!portfolio || portfolio.isLoading) {
            return {
                rows: [] as ProjectedEarningsByRubroRow[],
                totals: {
                    tenenciaArs: 0,
                    tenenciaUsd: 0,
                    projectedGainArs: 0,
                    projectedGainUsd: 0,
                    pnlNowArs: 0,
                    pnlNowUsd: 0,
                },
                horizon: projectedDriversHorizon,
                horizonDays: 0,
                fxRef: null as number | null,
            }
        }

        return computeProjectedEarningsByRubro({
            portfolio,
            horizon: projectedDriversHorizon,
            now: new Date(),
        })
    }, [portfolio, projectedDriversHorizon])

    const projectedDriversRows = projectedDrivers.rows

    const historicalTotals = useMemo(() => {
        return driversComputation.rows.reduce((acc, row) => {
            const resultUsd = resolveUsdValue(row.resultUsd, row.resultArs, driversFxRef)
            const currentUsd = resolveUsdValue(row.currentUsd, row.currentArs, driversFxRef)
            acc.resultArs += row.resultArs
            acc.resultUsd += resultUsd ?? 0
            acc.tenenciaArs += row.currentArs
            acc.tenenciaUsd += currentUsd ?? 0
            return acc
        }, {
            resultArs: 0,
            resultUsd: 0,
            tenenciaArs: 0,
            tenenciaUsd: 0,
        })
    }, [driversComputation.rows, driversFxRef])

    const driversHeaderLabel = driversMode === 'historico'
        ? driversComputation.label
        : `Proyeccion ${DRIVERS_PROJECTION_LABELS[driversRange]}`

    const selectedHistoricalDriverCategory = useMemo(() => {
        if (!selectedDriverRubro) return null
        return driversComputation.rows.find((row) => row.rubroId === selectedDriverRubro) ?? null
    }, [driversComputation.rows, selectedDriverRubro])

    const selectedProjectedDriverCategory = useMemo(() => {
        if (!selectedDriverRubro) return null
        return projectedDriversRows.find((row) => row.rubroId === selectedDriverRubro) ?? null
    }, [projectedDriversRows, selectedDriverRubro])

    const distributionSlices = useMemo(() => {
        if (!portfolio || portfolio.isLoading) return []
        const totalUsd = portfolio.rubros.reduce((sum, rubro) => sum + rubro.totals.usd, 0)
        if (totalUsd <= 0) return []

        return portfolio.rubros
            .map((rubro) => ({
                rubroId: rubro.id,
                label: RUBRO_LABELS[rubro.id] ?? rubro.name,
                color: RUBRO_COLORS[rubro.id] ?? RUBRO_COLORS.unknown,
                amountArs: rubro.totals.ars,
                amountUsd: rubro.totals.usd,
                pct: (rubro.totals.usd / totalUsd) * 100,
            }))
            .filter((slice) => slice.pct > 0.01)
    }, [portfolio])

    if (!portfolio || portfolio.isLoading) {
        return (
            <div className="min-h-[420px] flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Cargando dashboard v2...</span>
                </div>
            </div>
        )
    }

    const hasData = portfolio.kpis.totalArs > 0 || portfolio.rubros.length > 0
    const netIncome = netIncomeMetric ?? {
        status: 'missing_history' as const,
        missingHint: 'Falta historial para calcular ingresos netos.',
        netArs: 0,
        netUsd: 0,
        interestArs: 0,
        variationArs: 0,
        feesArs: 0,
        interestEstimated: false,
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col xl:flex-row gap-6 xl:items-end justify-between">
                <div>
                    <h1 className="font-display text-3xl font-bold text-white mb-1">
                        {userName ? `Hola, ${userName}` : 'Hola'}
                    </h1>
                    <p className="text-slate-400 text-sm">Este es tu portafolio.</p>
                </div>

                <div className="flex flex-wrap md:flex-nowrap gap-3 w-full xl:w-auto items-stretch">
                    <QuickActionCard
                        title="Activos"
                        subtitle="Ir a"
                        icon={<Wallet className="w-4 h-4" />}
                        accent="blue"
                        onClick={() => navigate('/mis-activos-v2')}
                    />
                    <QuickActionCard
                        title="Movimientos"
                        subtitle="Ver"
                        icon={<ArrowRight className="w-4 h-4" />}
                        accent="indigo"
                        onClick={() => navigate('/movements')}
                    />
                    <QuickActionCard
                        title="Mercado"
                        subtitle="Ir a"
                        icon={<BarChart3 className="w-4 h-4" />}
                        accent="sky"
                        onClick={() => navigate('/market')}
                    />
                    <button
                        onClick={() => setMovementWizardOpen(true)}
                        className="px-4 py-2.5 rounded-xl bg-primary text-white shadow-glow hover:bg-primary/90 flex items-center justify-center gap-2 transition-all flex-1 xl:flex-none min-w-[160px] border border-white/10"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="font-medium text-sm">Agregar movimiento</span>
                    </button>
                </div>
            </section>

            {!hasData && (
                <div className={cn(GLASS_PANEL, 'p-10 text-center')}>
                    <p className="text-lg text-white mb-2">Tu tablero esta vacio</p>
                    <p className="text-slate-400 mb-6">Conecta cuentas o carga un movimiento para empezar.</p>
                    <button
                        className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
                        onClick={() => navigate('/mis-activos-v2')}
                    >
                        Ir a Mis Activos
                    </button>
                </div>
            )}

            {hasData && (
                <>
                    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                        <div className={cn(GLASS_PANEL, 'p-6 xl:col-span-6')}>
                            <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-slate-400 text-xs font-mono uppercase tracking-wider">Patrimonio Total Estimado</h3>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-sm text-slate-500 font-mono">ARS</span>
                                    <span className="text-3xl lg:text-4xl font-mono font-bold text-white tracking-tight">
                                        {formatMoneyARS(portfolio.kpis.totalArs)}
                                    </span>
                                </div>
                                <span className="hidden sm:inline text-slate-600">|</span>
                                <span className="text-lg font-mono text-slate-400">~ {formatMoneyUSD(portfolio.kpis.totalUsd)}</span>
                            </div>
                        </div>

                        <DeltaCard title="Variacion Hoy (24h)" delta={periodDeltas.day} missingHint={periodDeltas.dayHint} />
                        <DeltaCard title="Rendimiento Mes (MTD)" delta={periodDeltas.mtd} missingHint={periodDeltas.mtdHint} />
                        <DeltaCard title="Rendimiento Anio (YTD)" delta={periodDeltas.ytd} missingHint={periodDeltas.ytdHint} />
                    </section>

                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className={cn(GLASS_PANEL, 'p-5')}>
                            <div className="flex justify-between items-end mb-3">
                                <h3 className="text-slate-400 text-xs font-mono uppercase tracking-wider">Liquidez</h3>
                                <span className="text-xs text-white font-medium">{liquidity.investedPct.toFixed(1)}% Invertido</span>
                            </div>
                            <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-primary" style={{ width: `${100 - liquidity.investedPct}%` }} />
                                <div className="h-full bg-slate-600" style={{ width: `${liquidity.investedPct}%` }} />
                            </div>
                            <div className="flex justify-between mt-2 text-[10px] font-mono text-slate-500">
                                <span>Cash: {formatMoneyARS(liquidity.cashArs)}</span>
                                <span>Invertido: {formatMoneyARS(liquidity.investedArs)}</span>
                            </div>
                        </div>

                        <div className={cn(GLASS_PANEL, 'p-5')}>
                            <div className="flex flex-col gap-3 mb-3">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-slate-400 text-xs font-mono uppercase tracking-wider">
                                            Ingresos Netos ({netIncomeRange})
                                        </h3>
                                        <span title="Cambio de patrimonio contra snapshot base del rango. Total = Int + Var + Fees.">
                                            <Info className="w-3 h-3 text-slate-500" />
                                        </span>
                                    </div>
                                    <span className={cn(
                                        'text-lg font-mono font-bold',
                                        netIncome.netArs >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    )}>
                                        {netIncome.netArs >= 0 ? '+' : ''}{formatMoneyARS(netIncome.netArs)}
                                    </span>
                                </div>

                                <div className="flex bg-slate-900/50 p-0.5 rounded-lg border border-white/5 overflow-x-auto">
                                    {INCOME_RANGES.map((range) => (
                                        <button
                                            key={range}
                                            onClick={() => setNetIncomeRange(range)}
                                            className={cn(
                                                'px-3 py-1 text-[10px] rounded transition',
                                                netIncomeRange === range ? 'font-bold bg-white/10 text-white' : 'font-medium text-slate-400 hover:text-white'
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <span
                                    className="px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-medium"
                                    title={netIncome.interestEstimated
                                        ? 'Intereses devengados estimados (wallets remuneradas y PF en curso).'
                                        : 'Intereses realizados registrados en movimientos del periodo.'}
                                >
                                    Int. {netIncome.interestArs >= 0 ? '+' : ''}{formatCompactMoney(netIncome.interestArs)}{netIncome.interestEstimated ? ' (estimado)' : ''}
                                </span>
                                <span
                                    className="px-3 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-300 text-xs font-medium"
                                    title="Variacion de valuacion (mark-to-market) del periodo, neta de intereses y fees."
                                >
                                    Var. {netIncome.variationArs >= 0 ? '+' : ''}{formatCompactMoney(netIncome.variationArs)}
                                </span>
                                <span
                                    className="px-3 py-1 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs font-medium"
                                    title="Comisiones y gastos del periodo."
                                >
                                    Fees {formatCompactMoney(netIncome.feesArs)}
                                </span>
                            </div>
                            {netIncome.status !== 'ok' && (
                                <p className="text-[11px] text-amber-300 mt-2">{netIncome.missingHint}</p>
                            )}
                            <p className="text-[10px] text-slate-500 mt-2">~ {formatMoneyUSD(netIncome.netUsd)}</p>
                        </div>
                    </section>

                    <section className={cn(GLASS_PANEL, 'p-1 rounded-xl')}>
                        <div className="p-5 flex flex-col lg:flex-row justify-between items-center gap-4 border-b border-white/5">
                            <div className="flex items-center gap-4">
                                <h3 className="font-display text-lg text-white">Evolucion Patrimonio</h3>
                                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-white/10">
                                    <button
                                        onClick={() => setChartMode('HIST')}
                                        className={cn(
                                            'px-3 py-1 text-[10px] uppercase rounded-md transition-all',
                                            chartMode === 'HIST' ? 'font-bold bg-white/10 text-white shadow' : 'font-medium text-slate-400 hover:text-white'
                                        )}
                                    >
                                        Historico
                                    </button>
                                    <button
                                        onClick={() => setChartMode('PROJ')}
                                        className={cn(
                                            'px-3 py-1 text-[10px] uppercase rounded-md transition-all',
                                            chartMode === 'PROJ' ? 'font-bold bg-white/10 text-white shadow' : 'font-medium text-slate-400 hover:text-white'
                                        )}
                                        title="Proyeccion estimada segun rendimientos actuales y tendencia reciente (si hay datos)."
                                    >
                                        Proyectado
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end overflow-x-auto">
                                <div className="bg-slate-900 p-0.5 rounded-lg border border-white/10 flex">
                                    <button
                                        onClick={() => setChartCurrency('ARS')}
                                        className={cn(
                                            'px-2 py-1 rounded text-xs transition-all',
                                            chartCurrency === 'ARS' ? 'font-bold bg-white/10 text-white shadow' : 'font-medium text-slate-400 hover:text-white'
                                        )}
                                    >
                                        ARS
                                    </button>
                                    <button
                                        onClick={() => setChartCurrency('USD')}
                                        className={cn(
                                            'px-2 py-1 rounded text-xs transition-all',
                                            chartCurrency === 'USD' ? 'font-bold bg-white/10 text-white shadow' : 'font-medium text-slate-400 hover:text-white'
                                        )}
                                    >
                                        USD
                                    </button>
                                </div>
                                <div className="flex bg-slate-900/50 p-0.5 rounded-lg border border-white/5">
                                    {CHART_RANGES.map((range) => (
                                        <button
                                            key={range}
                                            onClick={() => setChartRange(range)}
                                            className={cn(
                                                'px-2 py-1 text-xs rounded transition',
                                                chartRange === range ? 'font-medium bg-white/10 text-white shadow-sm' : 'font-medium text-slate-400 hover:text-white'
                                            )}
                                        >
                                            {range}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="h-[350px] w-full p-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="dashHistFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.28} />
                                            <stop offset="100%" stopColor="#6366F1" stopOpacity={0.04} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748B" />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        stroke="#64748B"
                                        tickFormatter={(value: number) => chartCurrency === 'ARS'
                                            ? `$${formatCompactMoney(value)}`
                                            : `US$${formatCompactMoney(value)}`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#0B1121',
                                            border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: 8,
                                        }}
                                        formatter={(value: number, key: string) => {
                                            if (!Number.isFinite(value)) return ['N/A', key]
                                            const formatted = chartCurrency === 'ARS'
                                                ? formatMoneyARS(value)
                                                : formatMoneyUSD(value)
                                            if (key === 'projected') return [formatted, 'Proyeccion (estimada)']
                                            return [formatted, 'Historico']
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="historical"
                                        stroke="#6366F1"
                                        strokeWidth={2}
                                        fill="url(#dashHistFill)"
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="projected"
                                        stroke="#A5B4FC"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className={cn(GLASS_PANEL, 'col-span-1 xl:col-span-2 overflow-hidden')}>
                            <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/[0.01]">
                                <div>
                                    <h3 className="font-display text-lg">Drivers del Periodo</h3>
                                    <p className="text-[10px] text-slate-500 font-mono uppercase">{driversHeaderLabel}</p>
                                    {driversMode === 'historico' && driversComputation.status !== 'ok' && driversComputation.missingHint && (
                                        <p className="text-[10px] text-amber-300 mt-1">{driversComputation.missingHint}</p>
                                    )}
                                    {driversMode === 'proyeccion' && (
                                        <>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                Escenario sin cambio de precio para CEDEAR/Cripto/FCI (incremental=0).
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                HOY y MAN usan proyeccion de 1 dia.
                                            </p>
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-white/10">
                                        <button
                                            onClick={() => {
                                                setDriversMode('historico')
                                                setSelectedDriverRubro(null)
                                            }}
                                            className={cn(
                                                'px-3 py-1 text-[10px] uppercase rounded-md transition-all',
                                                driversMode === 'historico'
                                                    ? 'font-bold bg-white/10 text-white shadow'
                                                    : 'font-medium text-slate-400 hover:text-white'
                                            )}
                                        >
                                            Historico
                                        </button>
                                        <button
                                            onClick={() => {
                                                setDriversMode('proyeccion')
                                                setSelectedDriverRubro(null)
                                            }}
                                            className={cn(
                                                'px-3 py-1 text-[10px] uppercase rounded-md transition-all',
                                                driversMode === 'proyeccion'
                                                    ? 'font-bold bg-white/10 text-white shadow'
                                                    : 'font-medium text-slate-400 hover:text-white'
                                            )}
                                        >
                                            Proyeccion
                                        </button>
                                    </div>
                                    <div className="flex bg-slate-900/50 p-0.5 rounded-lg border border-white/5 overflow-x-auto">
                                        {DRIVERS_RANGES.map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setDriversRange(range)}
                                                className={cn(
                                                    'px-3 py-1 text-[10px] rounded transition',
                                                    driversRange === range ? 'font-bold bg-white/10 text-white' : 'font-medium text-slate-400 hover:text-white'
                                                )}
                                            >
                                                {driversMode === 'historico' ? range : DRIVERS_PROJECTION_LABELS[range]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-xs font-mono text-slate-400 border-b border-white/5 bg-slate-900/40">
                                            <th className="p-4 font-medium uppercase">Categoria</th>
                                            <th className="p-4 font-medium uppercase text-right">
                                                {driversMode === 'historico' ? 'Resultado' : 'Ganancia (ARS)'}
                                            </th>
                                            <th className="p-4 font-medium uppercase text-right">Tenencia</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm divide-y divide-white/5">
                                        {driversMode === 'historico' ? (
                                            <>
                                                {driversComputation.rows.length === 0 && (
                                                    <tr>
                                                        <td className="p-6 text-center text-slate-500" colSpan={3}>
                                                            {driversComputation.missingHint ?? 'Sin datos de drivers para el periodo seleccionado.'}
                                                        </td>
                                                    </tr>
                                                )}
                                                {driversComputation.rows.map((row) => {
                                                    const positive = row.resultArs >= 0
                                                    const rubroName = RUBRO_LABELS[row.rubroId] ?? row.rubroId
                                                    const showResult = driversComputation.status !== 'missing_history'
                                                    const resultUsd = resolveUsdValue(row.resultUsd, row.resultArs, driversFxRef)
                                                    const currentUsd = resolveUsdValue(row.currentUsd, row.currentArs, driversFxRef)
                                                    return (
                                                        <tr
                                                            key={row.rubroId}
                                                            className="hover:bg-white/[0.04] transition cursor-pointer"
                                                            onClick={() => setSelectedDriverRubro(row.rubroId)}
                                                        >
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-1.5 h-8 rounded-full"
                                                                        style={{ backgroundColor: RUBRO_COLORS[row.rubroId] ?? RUBRO_COLORS.unknown }}
                                                                    />
                                                                    <div>
                                                                        <span className="text-white font-medium block">{rubroName}</span>
                                                                        <span className="text-xs text-slate-500">{row.items.length} activos</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {showResult ? (
                                                                    <>
                                                                        <div className={cn('font-mono text-sm', positive ? 'text-emerald-400' : 'text-rose-400')}>
                                                                            {positive ? '+' : ''}{formatMoneyARS(row.resultArs)}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-400">
                                                                            {resultUsd === null
                                                                                ? 'N/A'
                                                                                : `${resultUsd >= 0 ? '+' : ''}${formatMoneyUSD(resultUsd)}`}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-500">
                                                                            {formatSignedPercent(row.resultPct)}
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className="font-mono text-sm text-slate-500">N/A</div>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="font-mono text-slate-300">{formatMoneyARS(row.currentArs)}</div>
                                                                <div className="text-[10px] text-slate-500">
                                                                    {currentUsd === null ? 'N/A' : `≈ ${formatMoneyUSD(currentUsd)}`}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                                <tr className="bg-slate-900/50 font-mono">
                                                    <td className="p-4 text-xs uppercase text-slate-300 font-semibold">Totales</td>
                                                    <td className="p-4 text-right">
                                                        <div className={cn(
                                                            'text-sm font-semibold',
                                                            historicalTotals.resultArs >= 0 ? 'text-emerald-300' : 'text-rose-300'
                                                        )}>
                                                            {historicalTotals.resultArs >= 0 ? '+' : ''}{formatMoneyARS(historicalTotals.resultArs)}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400">
                                                            {historicalTotals.resultUsd >= 0 ? '+' : ''}{formatMoneyUSD(historicalTotals.resultUsd)}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="text-slate-200 font-semibold">{formatMoneyARS(historicalTotals.tenenciaArs)}</div>
                                                        <div className="text-[10px] text-slate-500">≈ {formatMoneyUSD(historicalTotals.tenenciaUsd)}</div>
                                                    </td>
                                                </tr>
                                            </>
                                        ) : (
                                            <>
                                                {projectedDriversRows.length === 0 && (
                                                    <tr>
                                                        <td className="p-6 text-center text-slate-500" colSpan={3}>
                                                            Sin rubros para proyectar con el portfolio actual.
                                                        </td>
                                                    </tr>
                                                )}
                                                {projectedDriversRows.map((row) => {
                                                    const positive = row.projectedGainArs >= 0
                                                    const showPnlNow = row.rubroId === 'cedears' || row.rubroId === 'crypto' || row.rubroId === 'fci'
                                                    return (
                                                        <tr
                                                            key={row.rubroId}
                                                            className="hover:bg-white/[0.04] transition cursor-pointer"
                                                            onClick={() => setSelectedDriverRubro(row.rubroId)}
                                                        >
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-1.5 h-8 rounded-full"
                                                                        style={{ backgroundColor: RUBRO_COLORS[row.rubroId] ?? RUBRO_COLORS.unknown }}
                                                                    />
                                                                    <div>
                                                                        <span className="text-white font-medium block">{row.label}</span>
                                                                        <span className="text-xs text-slate-500">{row.items.length} activos</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className={cn('font-mono text-sm', positive ? 'text-emerald-400' : 'text-rose-400')}>
                                                                    {positive ? '+' : ''}{formatMoneyARS(row.projectedGainArs)}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400">
                                                                    {row.projectedGainUsd >= 0 ? '+' : ''}{formatMoneyUSD(row.projectedGainUsd)}
                                                                </div>
                                                                {showPnlNow && (
                                                                    <div className="text-[10px] text-amber-300">
                                                                        PnL actual: {row.pnlNowArs >= 0 ? '+' : ''}{formatMoneyARS(row.pnlNowArs)} ({row.pnlNowUsd >= 0 ? '+' : ''}{formatMoneyUSD(row.pnlNowUsd)})
                                                                    </div>
                                                                )}
                                                                {row.status === 'missing_data' && row.notes[0] && (
                                                                    <div className="text-[10px] text-amber-300">{row.notes[0]}</div>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="font-mono text-xs text-slate-300">{formatMoneyARS(row.tenenciaArs)}</div>
                                                                <div className="text-[10px] text-slate-500">≈ {formatMoneyUSD(row.tenenciaUsd)}</div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                                <tr className="bg-slate-900/50 font-mono">
                                                    <td className="p-4 text-xs uppercase text-slate-300 font-semibold">Totales</td>
                                                    <td className="p-4 text-right">
                                                        <div className={cn(
                                                            'text-sm font-semibold',
                                                            projectedDrivers.totals.projectedGainArs >= 0 ? 'text-emerald-300' : 'text-rose-300'
                                                        )}>
                                                            {projectedDrivers.totals.projectedGainArs >= 0 ? '+' : ''}{formatMoneyARS(projectedDrivers.totals.projectedGainArs)}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400">
                                                            {projectedDrivers.totals.projectedGainUsd >= 0 ? '+' : ''}{formatMoneyUSD(projectedDrivers.totals.projectedGainUsd)}
                                                        </div>
                                                        <div className="text-[10px] text-amber-300">
                                                            PnL actual: {projectedDrivers.totals.pnlNowArs >= 0 ? '+' : ''}{formatMoneyARS(projectedDrivers.totals.pnlNowArs)} ({projectedDrivers.totals.pnlNowUsd >= 0 ? '+' : ''}{formatMoneyUSD(projectedDrivers.totals.pnlNowUsd)})
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="text-slate-200 font-semibold">{formatMoneyARS(projectedDrivers.totals.tenenciaArs)}</div>
                                                        <div className="text-[10px] text-slate-500">≈ {formatMoneyUSD(projectedDrivers.totals.tenenciaUsd)}</div>
                                                    </td>
                                                </tr>
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className={cn(GLASS_PANEL, 'p-5 flex flex-col items-center justify-center relative')}>
                                <h3 className="font-display text-sm text-slate-300 absolute top-4 left-4">Distribucion</h3>
                                <div className="mt-6 relative w-36 h-36">
                                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1E293B" strokeWidth="12" />
                                        {(() => {
                                            let offset = 0
                                            const circumference = 2 * Math.PI * 40
                                            return distributionSlices.map((slice) => {
                                                const length = (slice.pct / 100) * circumference
                                                const segment = (
                                                    <circle
                                                        key={slice.rubroId}
                                                        cx="50"
                                                        cy="50"
                                                        r="40"
                                                        fill="transparent"
                                                        stroke={slice.color}
                                                        strokeWidth="12"
                                                        strokeDasharray={`${length} ${circumference}`}
                                                        strokeDashoffset={-offset}
                                                        className="cursor-pointer transition-opacity hover:opacity-80"
                                                        onMouseEnter={() => setHoveredSlice(slice.rubroId)}
                                                        onMouseLeave={() => setHoveredSlice(null)}
                                                    />
                                                )
                                                offset += length
                                                return segment
                                            })
                                        })()}
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center text-white font-mono text-xs">
                                        {hoveredSlice
                                            ? `${distributionSlices.find((slice) => slice.rubroId === hoveredSlice)?.pct.toFixed(1) ?? '0.0'}%`
                                            : '100%'}
                                    </div>
                                </div>
                                <div className="w-full mt-4 space-y-1">
                                    {distributionSlices.map((slice) => (
                                        <div
                                            key={slice.rubroId}
                                            className="flex items-center justify-between text-xs cursor-default"
                                            onMouseEnter={() => setHoveredSlice(slice.rubroId)}
                                            onMouseLeave={() => setHoveredSlice(null)}
                                        >
                                            <span className="flex items-center gap-2 text-slate-300">
                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: slice.color }} />
                                                {slice.label}
                                            </span>
                                            <span className="font-mono text-slate-400">{slice.pct.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                                {hoveredSlice && (
                                    <div className="absolute top-4 right-4 bg-[#0B1121] border border-white/20 p-2 rounded-lg text-xs shadow-xl pointer-events-none">
                                        <div className="font-bold text-white">
                                            {distributionSlices.find((slice) => slice.rubroId === hoveredSlice)?.label}
                                        </div>
                                        <div className="font-mono text-slate-300">
                                            {formatMoneyARS(distributionSlices.find((slice) => slice.rubroId === hoveredSlice)?.amountArs ?? 0)}
                                        </div>
                                        <div className="text-sky-400">
                                            {distributionSlices.find((slice) => slice.rubroId === hoveredSlice)?.pct.toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={cn(GLASS_PANEL, 'p-5')}>
                                <h3 className="font-display text-sm text-slate-300 mb-4">Riesgo & Metricas</h3>
                                <div className="grid grid-cols-1 gap-2">
                                    <MetricRow label="Volatilidad (30D)" value={riskMetrics.volatility30d === null ? 'N/A' : formatSignedPercent(riskMetrics.volatility30d)} tone="warn" />
                                    <MetricRow label="Max Drawdown (90D)" value={riskMetrics.maxDrawdown90d === null ? 'N/A' : formatSignedPercent(riskMetrics.maxDrawdown90d)} tone="down" />
                                    <MetricRow label="Sharpe (1Y)" value={riskMetrics.sharpe1y === null ? 'N/A' : riskMetrics.sharpe1y.toFixed(2)} tone="up" />
                                    <MetricRow label="Expo USD" value={riskMetrics.exposureUsdPct === null ? 'N/A' : `${riskMetrics.exposureUsdPct.toFixed(1)}%`} tone="neutral" />
                                </div>
                            </div>
                        </div>
                    </section>
                    <section className={cn(
                        'p-4 border border-white/5 rounded-xl bg-[rgba(21,30,50,0.5)]',
                        'flex flex-col lg:flex-row lg:items-center justify-between gap-4'
                    )}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                                <Clock3 className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-medium text-white">Snapshots automaticos</h4>
                                <p className="text-[10px] text-slate-500">
                                    {autoSnapshotsEnabled ? 'Historial diario activo (V2).' : 'Historial diario desactivado.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                className="text-xs text-slate-300 hover:text-white transition px-3 py-1 rounded-md border border-white/10"
                                onClick={() => saveSnapshot.mutate('MEP')}
                                disabled={saveSnapshot.isPending}
                            >
                                {saveSnapshot.isPending ? 'Guardando...' : 'Guardar ahora'}
                            </button>
                            <button
                                className="text-xs text-rose-400 hover:text-rose-300 transition px-3 py-1 rounded-md border border-rose-500/20 disabled:opacity-50"
                                onClick={() => {
                                    if (!confirm('Esto eliminara todo el historial de snapshots. Deseas continuar?')) return
                                    clearSnapshots.mutate()
                                }}
                                disabled={clearSnapshots.isPending}
                            >
                                {clearSnapshots.isPending ? 'Limpiando...' : 'Limpiar historial'}
                            </button>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={autoSnapshotsEnabled}
                                onClick={() => setAutoSnapshotsEnabled(!autoSnapshotsEnabled)}
                                className={cn(
                                    'w-9 h-5 rounded-full relative cursor-pointer shadow-inner transition-colors',
                                    autoSnapshotsEnabled ? 'bg-primary' : 'bg-slate-700'
                                )}
                                title="Snapshots automaticos diarios"
                            >
                                <span
                                    className={cn(
                                        'w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform',
                                        autoSnapshotsEnabled && 'translate-x-4'
                                    )}
                                />
                            </button>
                        </div>
                    </section>

                    <section className={cn(GLASS_PANEL, 'p-4 flex items-start gap-3 bg-[rgba(14,165,233,0.08)] border-sky-400/20')}>
                        <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center mt-0.5">
                            <Bell className="w-4 h-4" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                Alertas inteligentes
                                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                            </h4>
                            <p className="text-xs text-slate-400">Proximamente: reglas de riesgo, desvio por rubro y alertas de variacion diaria.</p>
                        </div>
                    </section>
                </>
            )}

            <DriversModal
                open={selectedDriverRubro !== null}
                onClose={() => setSelectedDriverRubro(null)}
                mode={driversMode}
                historicalCategory={selectedHistoricalDriverCategory}
                projectedCategory={selectedProjectedDriverCategory}
                period={driversRange}
                assetLookup={currentAssetLookup}
                onAssetClick={(route) => {
                    setSelectedDriverRubro(null)
                    navigate(route)
                }}
            />

            <MovementWizard
                open={movementWizardOpen}
                onOpenChange={setMovementWizardOpen}
            />
        </div>
    )
}

function QuickActionCard({
    title,
    subtitle,
    icon,
    accent,
    onClick,
}: {
    title: string
    subtitle: string
    icon: ReactNode
    accent: 'blue' | 'indigo' | 'sky'
    onClick: () => void
}) {
    const accentClass = {
        blue: 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500',
        indigo: 'bg-primary/10 text-primary group-hover:bg-primary',
        sky: 'bg-sky-500/10 text-sky-400 group-hover:bg-sky-500',
    }[accent]

    return (
        <button
            onClick={onClick}
            className="glass-panel px-4 py-3 rounded-xl flex items-center gap-3 flex-1 xl:flex-none xl:w-40 transition-all group hover:bg-white/10"
        >
            <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-colors group-hover:text-white',
                accentClass
            )}>
                {icon}
            </div>
            <div className="text-left">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">{subtitle}</div>
                <div className="font-medium text-sm text-white">{title}</div>
            </div>
        </button>
    )
}

function DeltaCard({
    title,
    delta,
    missingHint,
}: {
    title: string
    delta: DisplayDelta | null
    missingHint: string
}) {
    const positive = (delta?.deltaArs ?? 0) >= 0
    return (
        <div className={cn(GLASS_PANEL, 'p-5 xl:col-span-2')}>
            <h3 className="text-slate-400 text-[10px] font-mono uppercase tracking-wider mb-2 truncate">{title}</h3>
            {delta ? (
                <>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                            'text-xl font-mono font-bold',
                            positive ? 'text-emerald-400' : 'text-rose-400'
                        )}>
                            {formatSignedPercent(delta.deltaPct)}
                        </span>
                        {positive ? (
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-rose-400" />
                        )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono flex flex-col gap-0.5">
                        <span>{delta.deltaArs >= 0 ? '+' : ''}{formatMoneyARS(delta.deltaArs)}</span>
                        <span className="opacity-70">{delta.deltaUsd >= 0 ? '+' : ''}{formatMoneyUSD(delta.deltaUsd)}</span>
                    </div>
                </>
            ) : (
                <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span>N/A</span>
                    <span title={missingHint}>
                        <Info className="w-3 h-3" />
                    </span>
                </div>
            )}
        </div>
    )
}

function MetricRow({
    label,
    value,
    tone,
}: {
    label: string
    value: string
    tone: 'warn' | 'down' | 'up' | 'neutral'
}) {
    const dotClass = {
        warn: 'bg-amber-400',
        down: 'bg-rose-400',
        up: 'bg-emerald-400',
        neutral: 'bg-slate-400',
    }[tone]

    return (
        <div className="flex justify-between items-center p-2 rounded bg-white/5">
            <span className="text-[10px] text-slate-500 font-mono uppercase">{label}</span>
            <div className="flex items-center gap-1.5">
                <div className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
                <span className="text-xs font-mono text-white">{value}</span>
            </div>
        </div>
    )
}

function DriversModal({
    open,
    onClose,
    mode,
    historicalCategory,
    projectedCategory,
    period,
    assetLookup,
    onAssetClick,
}: {
    open: boolean
    onClose: () => void
    mode: DriversMode
    historicalCategory: DriverMetricRow | null
    projectedCategory: ProjectedEarningsByRubroRow | null
    period: DriversRange
    assetLookup: Map<string, AssetLookup>
    onAssetClick: (route: string) => void
}) {
    const [mounted, setMounted] = useState(false)
    const [active, setActive] = useState(false)
    const [renderedMode, setRenderedMode] = useState<DriversMode>(mode)
    const [renderedHistorical, setRenderedHistorical] = useState<DriverMetricRow | null>(historicalCategory)
    const [renderedProjected, setRenderedProjected] = useState<ProjectedEarningsByRubroRow | null>(projectedCategory)

    useEffect(() => {
        if (open) {
            setMounted(true)
            setRenderedMode(mode)
            setRenderedHistorical(historicalCategory)
            setRenderedProjected(projectedCategory)
            const raf = window.requestAnimationFrame(() => setActive(true))
            return () => window.cancelAnimationFrame(raf)
        }
        if (!mounted) return
        setActive(false)
        const timeout = window.setTimeout(() => {
            setMounted(false)
        }, 220)
        return () => window.clearTimeout(timeout)
    }, [open, mode, historicalCategory, projectedCategory, mounted])

    useEffect(() => {
        if (!mounted) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }

        window.addEventListener('keydown', onKeyDown)
        return () => {
            document.body.style.overflow = originalOverflow
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [mounted, onClose])

    const historical = renderedMode === 'historico' ? renderedHistorical : null
    const projected = renderedMode === 'proyeccion' ? renderedProjected : null
    const title = historical
        ? (RUBRO_LABELS[historical.rubroId] ?? historical.rubroId)
        : (projected ? (RUBRO_LABELS[projected.rubroId] ?? projected.rubroId) : null)

    if (!mounted || !title) return null

    return createPortal(
        <div className="fixed inset-0 z-[120]">
            <div
                className={cn(
                    'absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200',
                    active ? 'opacity-100' : 'opacity-0'
                )}
                onClick={onClose}
            />

            <div className="absolute inset-0 p-4 sm:p-6 flex items-center justify-center">
                <div
                    className={cn(
                        'w-full max-w-5xl bg-[#151E32] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[90vh]',
                        'transition-all duration-200 ease-out',
                        active ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
                    )}
                >
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                        <div>
                            <h3 className="font-display text-xl text-white">
                                Detalle de Drivers: <span className="text-primary">{title}</span>
                            </h3>
                            <p className="text-xs text-slate-400">Rango seleccionado: {period}</p>
                            {renderedMode === 'proyeccion' && (
                                <p className="text-xs text-slate-500 mt-1">
                                    Proyeccion incremental; PnL actual mostrado aparte.
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white">Cerrar</button>
                    </div>

                    <div className="overflow-y-auto flex-1 rounded-lg border border-white/5 bg-slate-900/50 mb-4">
                        {historical && (
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-slate-500 uppercase bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                                    <tr>
                                        <th className="px-4 py-3">Activo</th>
                                        <th className="px-4 py-3 text-right">Tenencia</th>
                                        <th className="px-4 py-3 text-right">Resultado ARS</th>
                                        <th className="px-4 py-3 text-right">Resultado USD</th>
                                        <th className="px-4 py-3 text-right">Resultado %</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                                    {historical.items.length === 0 && (
                                        <tr>
                                            <td className="p-6 text-center text-slate-500" colSpan={5}>Sin datos para este periodo.</td>
                                        </tr>
                                    )}
                                    {historical.items.map((item) => {
                                        const lookup = assetLookup.get(item.assetKey)
                                        const route = lookup?.route
                                        const positive = item.deltaArs >= 0
                                        const symbol = lookup?.symbol ?? item.assetKey.split(':').pop() ?? item.assetKey

                                        return (
                                            <tr
                                                key={item.assetKey}
                                                className={cn('hover:bg-white/[0.04] transition', route && 'cursor-pointer')}
                                                onClick={() => {
                                                    if (route) onAssetClick(route)
                                                }}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-white">{symbol}</div>
                                                    <div className="text-xs text-slate-500 truncate max-w-[260px]">{lookup?.label ?? item.assetKey}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-300">{formatMoneyARS(item.currentArs)}</td>
                                                <td className={cn('px-4 py-3 text-right', positive ? 'text-emerald-300' : 'text-rose-300')}>
                                                    {positive ? '+' : ''}{formatMoneyARS(item.deltaArs)}
                                                </td>
                                                <td className={cn('px-4 py-3 text-right', item.deltaUsd >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                                                    {item.deltaUsd >= 0 ? '+' : ''}{formatMoneyUSD(item.deltaUsd)}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-400">{formatSignedPercent(item.deltaPct)}</td>
                                            </tr>
                                        )
                                    })}
                                    {historical.items.length > 0 && (
                                        <tr className="bg-slate-900/40">
                                            <td className="px-4 py-3 text-xs uppercase text-slate-300 font-semibold">Totales</td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyARS(historical.items.reduce((sum, item) => sum + item.currentArs, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyARS(historical.items.reduce((sum, item) => sum + item.deltaArs, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyUSD(historical.items.reduce((sum, item) => sum + item.deltaUsd, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500">-</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}

                        {projected && (
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-slate-500 uppercase bg-white/5 sticky top-0 z-10 backdrop-blur-md">
                                    <tr>
                                        <th className="px-4 py-3">Activo</th>
                                        <th className="px-4 py-3 text-right">Tenencia</th>
                                        <th className="px-4 py-3 text-right">Ganancia proyectada</th>
                                        <th className="px-4 py-3 text-right">PnL actual</th>
                                        <th className="px-4 py-3 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 font-mono text-slate-300">
                                    {projected.items.length === 0 && (
                                        <tr>
                                            <td className="p-6 text-center text-slate-500" colSpan={5}>Sin datos para este periodo.</td>
                                        </tr>
                                    )}
                                    {projected.items.map((item) => {
                                        const lookup = assetLookup.get(item.assetKey)
                                        const route = lookup?.route
                                        const symbol = lookup?.symbol ?? item.symbol ?? item.assetKey
                                        const hasMissingModel = item.status === 'missing_data'

                                        return (
                                            <tr
                                                key={item.assetKey}
                                                className={cn('hover:bg-white/[0.04] transition', route && 'cursor-pointer')}
                                                onClick={() => {
                                                    if (route) onAssetClick(route)
                                                }}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-white">{symbol}</div>
                                                    <div className="text-xs text-slate-500 truncate max-w-[260px]">{lookup?.label ?? item.label}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div>{formatMoneyARS(item.tenenciaArs)}</div>
                                                    <div className="text-[10px] text-slate-500">≈ {formatMoneyUSD(item.tenenciaUsd)}</div>
                                                </td>
                                                <td className={cn('px-4 py-3 text-right', item.projectedGainArs >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                                                    <div>{item.projectedGainArs >= 0 ? '+' : ''}{formatMoneyARS(item.projectedGainArs)}</div>
                                                    <div className="text-[10px] text-slate-400">{item.projectedGainUsd >= 0 ? '+' : ''}{formatMoneyUSD(item.projectedGainUsd)}</div>
                                                </td>
                                                <td className={cn('px-4 py-3 text-right', item.pnlNowArs >= 0 ? 'text-amber-200' : 'text-rose-300')}>
                                                    <div>{item.pnlNowArs >= 0 ? '+' : ''}{formatMoneyARS(item.pnlNowArs)}</div>
                                                    <div className="text-[10px] text-slate-400">{item.pnlNowUsd >= 0 ? '+' : ''}{formatMoneyUSD(item.pnlNowUsd)}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-xs">
                                                    {hasMissingModel ? (
                                                        <span className="px-2 py-1 rounded border border-amber-400/40 text-amber-300">
                                                            sin modelo
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500">{item.notes[0] ?? 'ok'}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {projected.items.length > 0 && (
                                        <tr className="bg-slate-900/40">
                                            <td className="px-4 py-3 text-xs uppercase text-slate-300 font-semibold">Totales</td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyARS(projected.items.reduce((sum, item) => sum + item.tenenciaArs, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyARS(projected.items.reduce((sum, item) => sum + item.projectedGainArs, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-200">
                                                {formatMoneyARS(projected.items.reduce((sum, item) => sum + item.pnlNowArs, 0))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-500">-</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}



