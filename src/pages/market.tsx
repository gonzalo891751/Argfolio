import { useState, useMemo, useEffect, useCallback } from 'react'
import {
    RefreshCw, Search, Star, TrendingUp, TrendingDown,
    BarChart3, Clock, DollarSign, Activity, AlertTriangle,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    ArrowUpDown, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatNumberAR } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { useMarketCedears, type MarketCedearItem } from '@/hooks/useMarketCedears'
import { useMarketCrypto, type CryptoMarketItem } from '@/hooks/useMarketCrypto'
import { useMarketIndicators } from '@/hooks/useMarketIndicators'
import { useFxRates } from '@/hooks/use-fx-rates'
import { getFavorites, toggleFavorite as toggleFav } from '@/lib/favoritesStorage'

// ============================================================================
// Types
// ============================================================================

type TabId = 'cedears' | 'crypto' | 'fci' | 'plazos'
type FavFilter = 'all' | 'favorites'

const TABS: { id: TabId; label: string; enabled: boolean }[] = [
    { id: 'cedears', label: 'CEDEARs', enabled: true },
    { id: 'crypto', label: 'Cripto', enabled: true },
    { id: 'fci', label: 'FCI', enabled: false },
    { id: 'plazos', label: 'Plazos Fijos', enabled: false },
]

const PAGE_SIZE = 25

// ============================================================================
// Helper Components
// ============================================================================

function formatLargeNumber(num: number | null | undefined): string {
    if (num == null || !Number.isFinite(num)) return '—'
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
    return formatNumberAR(num, 0, 0)
}

function formatChange(val: number | null | undefined, prefix = '', suffix = '%'): string {
    if (val == null || !Number.isFinite(val)) return '—'
    const sign = val > 0 ? '+' : ''
    return `${prefix}${sign}${val.toFixed(2)}${suffix}`
}

function ChangeIndicator({ value, className }: { value: number | null | undefined; className?: string }) {
    if (value == null || !Number.isFinite(value)) {
        return <span className={cn("text-muted-foreground", className)}>—</span>
    }
    const isPositive = value > 0
    const isNegative = value < 0
    return (
        <span className={cn(
            "flex items-center gap-1",
            isPositive && "text-success",
            isNegative && "text-destructive",
            className
        )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : null}
            {formatChange(value)}
        </span>
    )
}

function SortIcon({ column, activeSort, activeDir }: { column: string; activeSort: string; activeDir: 'asc' | 'desc' }) {
    if (activeSort !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/30" />
    return activeDir === 'asc'
        ? <ChevronUp className="h-3 w-3 ml-1 text-primary" />
        : <ChevronDown className="h-3 w-3 ml-1 text-primary" />
}

// ============================================================================
// Dollar Strip Component
// ============================================================================

function DollarStrip({ oficial, mep, ccl, cripto }: { oficial?: number; mep?: number; ccl?: number; cripto?: number }) {
    const items = [
        { label: 'Oficial', value: oficial },
        { label: 'MEP', value: mep },
        { label: 'CCL', value: ccl },
        { label: 'Cripto', value: cripto },
    ]

    return (
        <div className="flex flex-wrap gap-2">
            {items.map(item => (
                <div
                    key={item.label}
                    className="glass rounded-full px-4 py-2 border flex items-center gap-2 text-sm"
                >
                    <span className="text-muted-foreground font-medium">{item.label}</span>
                    <span className="font-semibold">
                        {item.value != null ? formatMoneyARS(item.value) : '—'}
                    </span>
                </div>
            ))}
        </div>
    )
}

// ============================================================================
// Indices Grid Component
// ============================================================================

interface IndicesGridProps {
    merval: { value: number; changePct1d?: number | null }
    sp500: { value: number; changePct1d?: number | null }
    ccl: { value: number; changePct1d?: number | null }
    riesgoPais: { value: number; changeAbs1d?: number | null }
    isLoading: boolean
}

function IndicesGrid({ merval, sp500, ccl, riesgoPais, isLoading }: IndicesGridProps) {
    const cards = [
        {
            icon: Activity,
            label: 'MERVAL',
            value: merval.value,
            change: merval.changePct1d,
            format: (v: number) => formatNumberAR(v, 0, 0),
            changeType: 'percent' as const,
        },
        {
            icon: BarChart3,
            label: 'S&P 500',
            value: sp500.value,
            change: sp500.changePct1d,
            format: (v: number) => formatNumberAR(v, 0, 0),
            changeType: 'percent' as const,
        },
        {
            icon: DollarSign,
            label: 'Dólar CCL',
            value: ccl.value,
            change: ccl.changePct1d,
            format: (v: number) => formatMoneyARS(v),
            changeType: 'percent' as const,
        },
        {
            icon: AlertTriangle,
            label: 'Riesgo País',
            value: riesgoPais.value,
            change: riesgoPais.changeAbs1d,
            format: (v: number) => formatNumberAR(v, 0, 0),
            changeType: 'points' as const,
            invertColors: true,
        },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map(card => {
                const Icon = card.icon
                const isPositive = (card.change ?? 0) > 0
                const isNegative = (card.change ?? 0) < 0
                // For Riesgo País, lower is better
                const colorClass = card.invertColors
                    ? (isNegative ? 'text-success' : isPositive ? 'text-destructive' : '')
                    : (isPositive ? 'text-success' : isNegative ? 'text-destructive' : '')

                return (
                    <div key={card.label} className="glass rounded-xl p-4 border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Icon className="h-4 w-4" />
                            <span className="text-xs font-medium">{card.label}</span>
                        </div>
                        <p className="font-semibold text-lg">
                            {isLoading ? '...' : card.value ? card.format(card.value) : '—'}
                        </p>
                        <p className={cn("text-sm", colorClass)}>
                            {card.change != null ? (
                                <span className="flex items-center gap-1">
                                    {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : null}
                                    {card.changeType === 'percent'
                                        ? formatChange(card.change)
                                        : `${card.change > 0 ? '+' : ''}${card.change} pts`
                                    }
                                </span>
                            ) : '—'}
                        </p>
                    </div>
                )
            })}
        </div>
    )
}

// ============================================================================
// Coming Soon Panel
// ============================================================================

function ComingSoonPanel({ title }: { title: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Próximamente</p>
            <p className="text-sm">{title} estará disponible pronto</p>
        </div>
    )
}

// ============================================================================
// CEDEAR Detail Modal
// ============================================================================

interface CedearModalProps {
    item: MarketCedearItem
    mepRate: number
    cclRate: number
    onClose: () => void
}

function CedearDetailModal({ item, mepRate, cclRate, onClose }: CedearModalProps) {
    const [chartPeriod, setChartPeriod] = useState<'day' | 'month' | 'year'>('day')
    const [chartCurrency, setChartCurrency] = useState<'ars' | 'usd'>('ars')

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="glass rounded-xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 border max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-bold">{item.ticker}</h2>
                            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-blue-500/10 text-blue-500">
                                CEDEAR
                            </span>
                            <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-warning/10 text-warning">
                                Teórico
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.name}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Price Section */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="glass rounded-lg p-4 border">
                        <p className="text-xs text-muted-foreground mb-1">CEDEAR $ARS</p>
                        <p className="text-2xl font-bold">
                            {formatMoneyARS(item.lastPriceArs)}
                        </p>
                        <ChangeIndicator value={item.changePct1d} className="text-sm mt-1" />
                    </div>
                    <div className="glass rounded-lg p-4 border">
                        <p className="text-xs text-muted-foreground mb-1">CEDEAR U$S <span className="text-primary">(MEP)</span></p>
                        <p className="text-2xl font-bold">
                            {formatMoneyUSD(item.lastPriceUsd)}
                        </p>
                        <ChangeIndicator value={item.changePct1d} className="text-sm mt-1" />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="text-sm">
                        <span className="text-muted-foreground">Subyacente (U$S)</span>
                        <p className="font-medium">{formatMoneyUSD(item.underlyingUsd)}</p>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">Ratio</span>
                        <p className="font-medium">
                            {item.ratioText ? (
                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                                    {item.ratioText}
                                </span>
                            ) : '—'}
                        </p>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">CCL Implícito</span>
                        <p className="font-medium">{formatMoneyARS(item.cclImplicit)}</p>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">MEP Usado</span>
                        <p className="font-medium">{formatMoneyARS(mepRate)}</p>
                    </div>
                    <div className="text-sm col-span-2">
                        <span className="text-muted-foreground">CCL Referencia</span>
                        <p className="font-medium">{formatMoneyARS(cclRate)}</p>
                    </div>
                </div>

                {/* Mini Chart Placeholder */}
                <div className="glass rounded-lg p-4 border mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-1">
                            {(['day', 'month', 'year'] as const).map(period => (
                                <button
                                    key={period}
                                    onClick={() => setChartPeriod(period)}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        chartPeriod === period
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {period === 'day' ? 'Día' : period === 'month' ? 'Mes' : 'Año'}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-1">
                            {(['ars', 'usd'] as const).map(curr => (
                                <button
                                    key={curr}
                                    onClick={() => setChartCurrency(curr)}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        chartCurrency === curr
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {curr === 'ars' ? 'CEDEAR $' : 'CEDEAR U$S'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                        <div className="text-center">
                            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Gráfico histórico</p>
                            <p className="text-xs">(Próximamente)</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t text-xs text-muted-foreground">
                    <p>Fuente: Stooq (subyacente) + DolarAPI (FX)</p>
                    <p className="mt-1">Precios teóricos calculados. Delay ~15 min.</p>
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// Crypto Detail Modal
// ============================================================================

interface CryptoModalProps {
    item: CryptoMarketItem
    onClose: () => void
}

function CryptoDetailModal({ item, onClose }: CryptoModalProps) {
    const [chartPeriod, setChartPeriod] = useState<'day' | 'month' | 'year'>('day')

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="glass rounded-xl shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 border max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        {item.image && (
                            <img src={item.image} alt="" className="h-10 w-10 rounded-full" />
                        )}
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-2xl font-bold">{item.ticker}</h2>
                                <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-orange-500/10 text-orange-500">
                                    CRYPTO
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.name}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Price Section */}
                <div className="glass rounded-lg p-4 border mb-6">
                    <p className="text-xs text-muted-foreground mb-1">Precio USD</p>
                    <p className="text-3xl font-bold">
                        {formatMoneyUSD(item.priceUsd)}
                    </p>
                    <ChangeIndicator value={item.changePct24h} className="text-sm mt-1" />
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="text-sm">
                        <span className="text-muted-foreground">Market Cap</span>
                        <p className="font-medium">{formatLargeNumber(item.marketCap)}</p>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground">Volumen 24h</span>
                        <p className="font-medium">{formatLargeNumber(item.volume24h)}</p>
                    </div>
                </div>

                {/* Mini Chart Placeholder */}
                <div className="glass rounded-lg p-4 border mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-1">
                            {(['day', 'month', 'year'] as const).map(period => (
                                <button
                                    key={period}
                                    onClick={() => setChartPeriod(period)}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        chartPeriod === period
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {period === 'day' ? 'Día' : period === 'month' ? 'Mes' : 'Año'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                        <div className="text-center">
                            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Gráfico histórico</p>
                            <p className="text-xs">(Próximamente)</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t text-xs text-muted-foreground">
                    <p>Fuente: CoinGecko</p>
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// Main Market Page Component
// ============================================================================

export function MarketPage() {
    const [currentTab, setCurrentTab] = useState<TabId>('cedears')
    const [searchText, setSearchText] = useState('')
    const [favFilter, setFavFilter] = useState<FavFilter>('all')
    const [cedearFavorites, setCedearFavorites] = useState<Set<string>>(() => getFavorites('cedears'))
    const [cryptoFavorites, setCryptoFavorites] = useState<Set<string>>(() => getFavorites('crypto'))
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    // Modal state
    const [selectedCedear, setSelectedCedear] = useState<MarketCedearItem | null>(null)
    const [selectedCrypto, setSelectedCrypto] = useState<CryptoMarketItem | null>(null)

    // Memoize favorite Arrays to prevent hook re-runs
    const cedearFavIds = useMemo(() => Array.from(cedearFavorites), [cedearFavorites])
    const cryptoFavIds = useMemo(() => Array.from(cryptoFavorites), [cryptoFavorites])


    // CEDEARs State
    const [cedearPage, setCedearPage] = useState(1)
    const [cedearSort, setCedearSort] = useState('ticker')
    const [cedearDir, setCedearDir] = useState<'asc' | 'desc'>('asc')

    // Crypto State
    const [cryptoPage, setCryptoPage] = useState(1)
    const [cryptoSort, setCryptoSort] = useState('marketCap')
    const [cryptoDir, setCryptoDir] = useState<'asc' | 'desc'>('desc')

    // Data Hooks
    const {
        rows: cedearRows,
        total: cedearTotal,
        isPricesLoading: cedearsLoading,
        refetch: refetchCedears,
    } = useMarketCedears({
        page: cedearPage,
        pageSize: PAGE_SIZE,
        mode: 'all',
        sort: cedearSort,
        dir: cedearDir,
        query: searchText,
        onlyFavorites: favFilter === 'favorites',
        favoriteIds: cedearFavIds,
    })

    const {
        rows: cryptoRows,
        total: cryptoTotal,
        isLoading: cryptoLoading,
        refetch: refetchCrypto,
    } = useMarketCrypto({
        mode: 'top250',
        page: cryptoPage,
        pageSize: PAGE_SIZE,
        sort: cryptoSort,
        dir: cryptoDir,
        query: searchText,
        onlyFavorites: favFilter === 'favorites',
        favoriteIds: cryptoFavIds,
    })

    const { data: indicatorsData, isLoading: indicatorsLoading, refetch: refetchIndicators } = useMarketIndicators()
    const { data: fxRates, refetch: refetchFx } = useFxRates()

    // Refresh handler
    const handleRefresh = useCallback(() => {
        refetchCedears()
        refetchCrypto()
        refetchIndicators()
        refetchFx()
        setLastUpdated(new Date())
    }, [refetchCedears, refetchCrypto, refetchIndicators, refetchFx])

    // Initialize last updated
    useEffect(() => {
        setLastUpdated(new Date())
    }, [])

    // Favorite toggle handlers
    const handleToggleCedearFav = useCallback((ticker: string, e: React.MouseEvent) => {
        e.stopPropagation()
        toggleFav('cedears', ticker)
        setCedearFavorites(getFavorites('cedears'))
    }, [])

    const handleToggleCryptoFav = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        toggleFav('crypto', id)
        setCryptoFavorites(getFavorites('crypto'))
    }, [])

    // Filtering and display logic
    // Filtering is now handled by hooks
    const displayedCedears = cedearRows
    const displayedCryptos = cryptoRows

    // Sorting handlers
    const handleCedearSort = (column: string) => {
        if (cedearSort === column) {
            setCedearDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setCedearSort(column)
            setCedearDir('desc')
        }
    }

    const handleCryptoSort = (column: string) => {
        if (cryptoSort === column) {
            setCryptoDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setCryptoSort(column)
            setCryptoDir('desc')
        }
    }

    // Reset page on tab, search, or filter change
    useEffect(() => {
        setCedearPage(1)
        setCryptoPage(1)
    }, [currentTab, searchText, favFilter])


    // Derived values
    const isLoading = currentTab === 'cedears' ? cedearsLoading : cryptoLoading
    const totalItems = currentTab === 'cedears' ? cedearTotal : cryptoTotal
    const currentPage = currentTab === 'cedears' ? cedearPage : cryptoPage
    const totalPages = Math.ceil(totalItems / PAGE_SIZE)

    return (
        <div className="flex flex-col min-h-full">
            {/* Sticky Header */}
            <div className="border-b glass sticky top-0 z-20">
                <div className="px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold">Mercado</h1>
                            <p className="text-sm text-muted-foreground">
                                Cotizaciones en tiempo real
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    className="pl-9 w-48"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                disabled={isLoading}
                                className="gap-2"
                            >
                                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                                Actualizar
                            </Button>
                            {lastUpdated && (
                                <div className="glass rounded-full px-3 py-1.5 border text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                            <ThemeToggle />
                        </div>
                    </div>
                </div>
            </div>

            {/* Dollar Strip */}
            <div className="px-4 py-4 sm:px-6 lg:px-8">
                <DollarStrip
                    oficial={fxRates?.oficial}
                    mep={fxRates?.mep}
                    ccl={fxRates?.ccl}
                    cripto={fxRates?.cripto}
                />
            </div>

            {/* Indices Grid */}
            <div className="px-4 pb-4 sm:px-6 lg:px-8">
                <IndicesGrid
                    merval={{ value: indicatorsData?.merval.value ?? 0, changePct1d: indicatorsData?.merval.changePct1d }}
                    sp500={{ value: indicatorsData?.sp500.value ?? 0, changePct1d: indicatorsData?.sp500.changePct1d }}
                    ccl={{ value: indicatorsData?.ccl.value ?? 0, changePct1d: indicatorsData?.ccl.changePct1d }}
                    riesgoPais={{ value: indicatorsData?.riesgoPais.value ?? 0, changeAbs1d: indicatorsData?.riesgoPais.changeAbs1d }}
                    isLoading={indicatorsLoading}
                />
            </div>

            {/* Tabs */}
            <div className="px-4 sm:px-6 lg:px-8 border-b">
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => tab.enabled && setCurrentTab(tab.id)}
                            disabled={!tab.enabled}
                            className={cn(
                                "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                                currentTab === tab.id
                                    ? "border-primary text-primary"
                                    : tab.enabled
                                        ? "border-transparent text-muted-foreground hover:text-foreground"
                                        : "border-transparent text-muted-foreground/50 cursor-not-allowed"
                            )}
                        >
                            {tab.label}
                            {!tab.enabled && (
                                <span className="ml-1 text-xs opacity-75">(pronto)</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Segmented Filter + Pagination Info */}
            {(currentTab === 'cedears' || currentTab === 'crypto') && (
                <div className="px-4 py-3 sm:px-6 lg:px-8 bg-muted/20 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex bg-muted rounded-lg p-1">
                        <button
                            onClick={() => setFavFilter('all')}
                            className={cn(
                                "px-4 py-1.5 text-sm rounded-md transition-all font-medium",
                                favFilter === 'all'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => setFavFilter('favorites')}
                            className={cn(
                                "px-4 py-1.5 text-sm rounded-md transition-all font-medium flex items-center gap-1",
                                favFilter === 'favorites'
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Mis <Star className="h-3 w-3 fill-warning text-warning" />
                        </button>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        {totalItems > 0 ? (
                            `Mostrando ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalItems)} de ${totalItems}`
                        ) : (
                            '0 activos'
                        )}
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-auto">
                {/* FCI / Plazos Fijos Placeholders */}
                {currentTab === 'fci' && <ComingSoonPanel title="FCI" />}
                {currentTab === 'plazos' && <ComingSoonPanel title="Plazos Fijos" />}

                {/* CEDEARs Table */}
                {currentTab === 'cedears' && (
                    isLoading ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                            <p>Cargando cotizaciones...</p>
                        </div>
                    ) : displayedCedears.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No hay CEDEARs para mostrar</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-muted/50 sticky top-0">
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="px-4 py-3 w-10"></th>
                                    <th className="px-4 py-3 cursor-pointer hover:bg-muted/50" onClick={() => handleCedearSort('ticker')}>
                                        <div className="flex items-center">
                                            Activo
                                            <SortIcon column="ticker" activeSort={cedearSort} activeDir={cedearDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end">
                                            Ultimo $ARS
                                            <span className="ml-1 px-1.5 py-0.5 bg-success/10 text-success text-[10px] rounded">PPI</span>
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right hidden md:table-cell">Ultimo U$S</th>
                                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => handleCedearSort('changePct1d')}>
                                        <div className="flex items-center justify-end">
                                            VAR %
                                            <SortIcon column="changePct1d" activeSort={cedearSort} activeDir={cedearDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right hidden lg:table-cell">Subyacente (U$S)</th>
                                    <th className="px-4 py-3 text-right hidden lg:table-cell">CCL implícito</th>
                                    <th className="px-4 py-3 text-center hidden md:table-cell">Ratio</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {displayedCedears.map(item => (
                                    <tr
                                        key={item.ticker}
                                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                                        onClick={() => setSelectedCedear(item)}
                                    >
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={(e) => handleToggleCedearFav(item.ticker, e)}
                                                className="text-muted-foreground hover:text-warning transition-colors"
                                            >
                                                <Star
                                                    className={cn(
                                                        "h-4 w-4",
                                                        cedearFavorites.has(item.ticker) && "fill-warning text-warning"
                                                    )}
                                                />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium">{item.ticker}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.name}</p>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {formatMoneyARS(item.lastPriceArs)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                            <div className="flex flex-col items-end">
                                                <span>{formatMoneyUSD(item.lastPriceUsd)}</span>
                                                <span className="text-[10px] text-muted-foreground">MEP</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            <ChangeIndicator value={item.changePct1d} />
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono hidden lg:table-cell">
                                            {formatMoneyUSD(item.underlyingUsd)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono hidden lg:table-cell">
                                            {formatMoneyARS(item.cclImplicit)}
                                        </td>
                                        <td className="px-4 py-3 text-center hidden md:table-cell">
                                            {item.ratioText ? (
                                                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                                                    {item.ratioText}
                                                </span>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {/* Crypto Table */}
                {currentTab === 'crypto' && (
                    cryptoLoading ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                            <p>Cargando cotizaciones...</p>
                        </div>
                    ) : displayedCryptos.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No hay criptomonedas para mostrar</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-muted/50 sticky top-0">
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="px-4 py-3 w-10"></th>
                                    <th className="px-4 py-3 cursor-pointer hover:bg-muted/50" onClick={() => handleCryptoSort('ticker')}>
                                        <div className="flex items-center">
                                            Activo
                                            <SortIcon column="ticker" activeSort={cryptoSort} activeDir={cryptoDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => handleCryptoSort('priceUsd')}>
                                        <div className="flex items-center justify-end">
                                            Ultimo U$S
                                            <SortIcon column="priceUsd" activeSort={cryptoSort} activeDir={cryptoDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right cursor-pointer hover:bg-muted/50" onClick={() => handleCryptoSort('changePct24h')}>
                                        <div className="flex items-center justify-end">
                                            VAR %
                                            <SortIcon column="changePct24h" activeSort={cryptoSort} activeDir={cryptoDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right hidden md:table-cell cursor-pointer hover:bg-muted/50" onClick={() => handleCryptoSort('marketCap')}>
                                        <div className="flex items-center justify-end">
                                            Market Cap
                                            <SortIcon column="marketCap" activeSort={cryptoSort} activeDir={cryptoDir} />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right hidden md:table-cell cursor-pointer hover:bg-muted/50" onClick={() => handleCryptoSort('volume24h')}>
                                        <div className="flex items-center justify-end">
                                            Vol 24h
                                            <SortIcon column="volume24h" activeSort={cryptoSort} activeDir={cryptoDir} />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {displayedCryptos.map(item => (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                                        onClick={() => setSelectedCrypto(item)}
                                    >
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={(e) => handleToggleCryptoFav(item.id, e)}
                                                className="text-muted-foreground hover:text-warning transition-colors"
                                            >
                                                <Star
                                                    className={cn(
                                                        "h-4 w-4",
                                                        cryptoFavorites.has(item.id) && "fill-warning text-warning"
                                                    )}
                                                />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {item.image && (
                                                    <img src={item.image} alt="" className="h-6 w-6 rounded-full" />
                                                )}
                                                <div>
                                                    <p className="font-medium">{item.ticker}</p>
                                                    <p className="text-xs text-muted-foreground">{item.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {formatMoneyUSD(item.priceUsd)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            <ChangeIndicator value={item.changePct24h} />
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                            {formatLargeNumber(item.marketCap)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                            {formatLargeNumber(item.volume24h)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </div>

            {/* Pagination Footer */}
            {(currentTab === 'cedears' || currentTab === 'crypto') && totalPages > 1 && (
                <div className="px-4 py-3 border-t glass flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => {
                            if (currentTab === 'cedears') setCedearPage(p => p - 1)
                            else setCryptoPage(p => p - 1)
                        }}
                    >
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                        Página {currentPage} de {totalPages}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => {
                            if (currentTab === 'cedears') setCedearPage(p => p + 1)
                            else setCryptoPage(p => p + 1)
                        }}
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                </div>
            )}

            {/* CEDEAR Detail Modal */}
            {selectedCedear && (
                <CedearDetailModal
                    item={selectedCedear}
                    mepRate={fxRates?.mep ?? 0}
                    cclRate={fxRates?.ccl ?? 0}
                    onClose={() => setSelectedCedear(null)}
                />
            )}

            {/* Crypto Detail Modal */}
            {selectedCrypto && (
                <CryptoDetailModal
                    item={selectedCrypto}
                    onClose={() => setSelectedCrypto(null)}
                />
            )}
        </div>
    )
}
