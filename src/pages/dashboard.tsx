
import { useMemo, useState, type ReactNode } from 'react'
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
import { usePortfolioV2 } from '@/features/portfolioV2'
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
import {
    computeDashboardMetrics,
    type DashboardRange,
} from '@/features/dashboardV2/dashboard-metrics'
import { computeCurrencyExposureSummary } from '@/features/dashboardV2/currency-exposure'
import { ResultsCard } from '@/components/dashboard/ResultsCard'

type ChartCurrency = 'ARS' | 'USD'
type ChartRange = '1D' | '7D' | '30D' | '90D' | '1Y' | 'MAX'
type ChartMode = 'HIST' | 'PROJ'
type DriversRange = DashboardRange
type IncomeRange = DashboardRange
const GLASS_PANEL = 'glass-panel rounded-xl border border-white/10'

const CHART_RANGES: ChartRange[] = ['1D', '7D', '30D', '90D', '1Y', 'MAX']
const INCOME_RANGES: IncomeRange[] = ['1D', '7D', '30D', '90D', '1Y', 'TOTAL']
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
    const [driversRange] = useState<DriversRange>('TOTAL')
    const [netIncomeRange, setNetIncomeRange] = useState<IncomeRange>('30D')
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
                        <div className="col-span-1 xl:col-span-2">
                            {portfolio && !portfolio.isLoading && (
                                <ResultsCard portfolio={portfolio} snapshots={snapshots} />
                            )}
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




