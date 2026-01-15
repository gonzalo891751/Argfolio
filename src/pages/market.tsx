import { useState, useMemo, useEffect } from 'react'
import {
    RefreshCw, Search, Star, TrendingUp, TrendingDown,
    BarChart3, Clock, DollarSign, Activity, AlertTriangle,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    ArrowUpDown
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatNumberAR } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { useMarketCedears } from '@/hooks/useMarketCedears'
import { useMarketCrypto, type CryptoMarketItem } from '@/hooks/useMarketCrypto'
import { useMarketIndicators } from '@/hooks/useMarketIndicators'
import { useFxRates } from '@/hooks/use-fx-rates'

// Types
type TabId = 'cedears' | 'crypto' | 'fci' | 'favorites'

interface MarketAsset {
    id: string
    kind: 'cedear' | 'crypto'
    ticker: string
    name: string
    lastPrice: number
    currency: 'ARS' | 'USD'
    changePct: number | null
    volume: number | null
    marketCap?: number | null
    ratioText?: string | null
    ratio?: number | null
    lastQuoteTime?: string | null
    image?: string | null
}

const TABS: { id: TabId; label: string }[] = [
    { id: 'cedears', label: 'CEDEARs' },
    { id: 'crypto', label: 'Cripto' },
    { id: 'fci', label: 'FCI' },
    { id: 'favorites', label: 'Favoritos' },
]

const FAVORITES_KEY = 'market:favorites'

function loadFavorites(): Set<string> {
    try {
        const stored = localStorage.getItem(FAVORITES_KEY)
        return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
        return new Set()
    }
}

function saveFavorites(favorites: Set<string>) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]))
}

// Format large numbers (market cap, volume)
function formatLargeNumber(num: number | null | undefined): string {
    if (num == null || !Number.isFinite(num)) return '—'
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
    return formatNumberAR(num, 0, 0)
}

export function MarketPage() {
    const [currentTab, setCurrentTab] = useState<TabId>('cedears')
    const [searchText, setSearchText] = useState('')
    const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)
    const [selectedAsset, setSelectedAsset] = useState<MarketAsset | null>(null)

    // CEDEARs State
    const [cedearMode, setCedearMode] = useState<'top' | 'all'>('top')
    const [cedearPage, setCedearPage] = useState(1)
    const [cedearSort, setCedearSort] = useState('volume')
    const [cedearDir, setCedearDir] = useState<'asc' | 'desc'>('desc')

    // Crypto State
    const [cryptoMode, setCryptoMode] = useState<'my' | 'top100' | 'top250'>('my')
    const [cryptoPage, setCryptoPage] = useState(1)
    const [cryptoSort, setCryptoSort] = useState('marketCap')
    const [cryptoDir, setCryptoDir] = useState<'asc' | 'desc'>('desc')
    const [cryptoPageSize, setCryptoPageSize] = useState(50)

    // Data Hooks
    // Note: handling 'favorites' tab logic -> if favorites, we ideally need full datasets to filter.
    // For CEDEARs, if tab is favorites, we switch hook mode to 'all' to ensure we have the data.
    const effectiveCedearMode = currentTab === 'favorites' ? 'all' : cedearMode
    // For Crypto, 'top250' gives us the widest net (250 items). 'my' only gives 50 specific.
    // We'll trust the user to have favorites mostly within top 250 or 'my'.
    // A robust impl would fetch specific IDs, but for now we rely on loaded data.

    // CEDEARs Hook
    const cedearHookPageSize = currentTab === 'favorites' ? 1000 : 50;
    const {
        rows: cedearRows,
        total: cedearTotal,
        isLoading: cedearsLoading,
        refetch: refetchCedears,
        dataUpdatedAt: cedearsUpdatedAt,
        error: cedearsError
    } = useMarketCedears({
        page: currentTab === 'favorites' ? undefined : cedearPage, // If favorites, fetch all (default page 1 usually implies paged, but 'all' mode in logic might behave differently? Provider paginates 'all' too. We might not get all favorites if paginated.)
        // Correction: Provider paginates. So we can't easily filter client-side favorites unless we fetch EVERYTHING (page size 1000).
        // Let's modify the pageSize if favorites.
        pageSize: cedearHookPageSize,
        mode: effectiveCedearMode,
        sort: cedearSort,
        dir: cedearDir
    })

    // Crypto Hook
    const {
        rows: cryptoRows,
        total: cryptoTotal,
        isLoading: cryptoLoading,
        refetch: refetchCrypto
    } = useMarketCrypto({
        mode: cryptoMode,
        page: cryptoPage,
        pageSize: cryptoPageSize,
        sort: cryptoSort,
        dir: cryptoDir
    })

    const { data: indicatorsData, isLoading: indicatorsLoading } = useMarketIndicators()
    const { data: fxRates } = useFxRates()

    // Transform CEDEAR data
    const cedearAssets: MarketAsset[] = useMemo(() => {
        if (!Array.isArray(cedearRows)) return []
        return cedearRows.map(item => ({
            id: `cedear-${item.ticker}`,
            kind: 'cedear' as const,
            ticker: item.ticker,
            name: item.name || item.ticker,
            lastPrice: item.lastPriceArs,
            currency: 'ARS' as const,
            changePct: item.changePct1d ?? null,
            volume: item.volume ?? null,
            ratioText: item.ratioText ?? item.ratio?.toString() ?? null,
            ratio: item.ratio ?? null,
            lastQuoteTime: item.lastQuoteTime ?? null,
        }))
    }, [cedearRows])

    // Transform Crypto data
    const cryptoAssets: MarketAsset[] = useMemo(() => {
        if (!Array.isArray(cryptoRows)) return []
        return cryptoRows.map((item: CryptoMarketItem) => ({
            id: `crypto-${item.ticker}`,
            kind: 'crypto' as const,
            ticker: item.ticker,
            name: item.name,
            lastPrice: item.priceUsd,
            currency: 'USD' as const,
            changePct: item.changePct24h,
            volume: item.volume24h,
            marketCap: item.marketCap,
            image: item.image,
        }))
    }, [cryptoRows])

    // Combine for favorites filtering
    // Note: This relies on the current "page" of data containing the favorites.
    // This is a limitation of client-side filtering on server-side paginated properties.
    const allAssets = useMemo(() => {
        // For favorites tab, we tried to fetch "all" cedears (size 1000).
        // Crypto might be limited to 50/100/250.
        return [...cedearAssets, ...cryptoAssets]
    }, [cedearAssets, cryptoAssets])

    // Determine assets to display
    const displayedAssets = useMemo(() => {
        let assets: MarketAsset[] = []

        switch (currentTab) {
            case 'cedears':
                assets = cedearAssets
                break
            case 'crypto':
                assets = cryptoAssets
                break
            case 'favorites':
                assets = allAssets.filter(a => favorites.has(a.id))
                break
            case 'fci':
                assets = []
                break
        }

        // Client-side search (Server side search not yet implemented in provider)
        if (searchText.trim()) {
            const query = searchText.toLowerCase()
            return assets.filter(a =>
                a.ticker.toLowerCase().includes(query) ||
                a.name.toLowerCase().includes(query)
            )
        }

        return assets
    }, [currentTab, cedearAssets, cryptoAssets, allAssets, favorites, searchText])

    // Handlers
    const toggleFavorite = (id: string) => {
        setFavorites(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            saveFavorites(next)
            return next
        })
    }

    const handleRefresh = () => {
        refetchCedears()
        refetchCrypto()
    }

    const handleSort = (column: string) => {
        if (currentTab === 'cedears') {
            if (cedearSort === column) {
                setCedearDir(prev => prev === 'asc' ? 'desc' : 'asc')
            } else {
                setCedearSort(column)
                setCedearDir('desc') // Default to desc for metrics
            }
        } else if (currentTab === 'crypto') {
            if (cryptoSort === column) {
                setCryptoDir(prev => prev === 'asc' ? 'desc' : 'asc')
            } else {
                setCryptoSort(column)
                setCryptoDir('desc')
            }
        }
    }

    // Reset page when switching modes or tabs
    useEffect(() => {
        setCedearPage(1)
    }, [cedearMode, currentTab])

    useEffect(() => {
        setCryptoPage(1)
    }, [cryptoMode, currentTab])

    // Derived values for pagination
    const totalItems = currentTab === 'cedears' ? (cedearTotal ?? 0)
        : currentTab === 'crypto' ? (cryptoTotal ?? 0)
            : displayedAssets.length

    const currentPage = currentTab === 'cedears' ? cedearPage : cryptoPage
    // cedearPageSize is effectively 50 or 1000. We can just use the state logic or assume 50 for normal view.
    // Simpler: use the effective pageSize we passed.
    const effectiveCedearPageSize = currentTab === 'favorites' ? 1000 : 50
    const pageSize = currentTab === 'cedears' ? effectiveCedearPageSize : cryptoPageSize

    const totalPages = Math.ceil(totalItems / pageSize)
    const startItem = (currentPage - 1) * pageSize + 1
    const endItem = Math.min(currentPage * pageSize, totalItems)

    const isLoading = currentTab === 'cedears' ? cedearsLoading : currentTab === 'crypto' ? cryptoLoading : false
    const lastUpdated = currentTab === 'cedears' ? cedearsUpdatedAt : undefined

    const SortIcon = ({ column, activeSort, activeDir }: { column: string, activeSort: string, activeDir: 'asc' | 'desc' }) => {
        if (activeSort !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/30" />
        return activeDir === 'asc'
            ? <ChevronUp className="h-3 w-3 ml-1 text-primary" />
            : <ChevronDown className="h-3 w-3 ml-1 text-primary" />
    }

    return (
        <div className="flex flex-col min-h-full">
            {/* Header */}
            <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold">Mercado</h1>
                            <p className="text-sm text-muted-foreground">
                                Cotizaciones en tiempo real
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
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
                                size="icon"
                                onClick={handleRefresh}
                                disabled={isLoading}
                            >
                                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                            </Button>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Indicators Cards */}
            <div className="px-4 py-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* MERVAL */}
                    <div className="glass rounded-xl p-4 border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Activity className="h-4 w-4" />
                            <span className="text-xs font-medium">MERVAL</span>
                        </div>
                        <p className="font-semibold text-lg">
                            {indicatorsLoading ? '...' : indicatorsData?.merval.value ? formatNumberAR(indicatorsData.merval.value, 0, 0) : '—'}
                        </p>
                        <p className={cn(
                            "text-sm",
                            (indicatorsData?.merval.changePct1d ?? 0) > 0 ? "text-success" : (indicatorsData?.merval.changePct1d ?? 0) < 0 ? "text-destructive" : ""
                        )}>
                            {indicatorsData?.merval.changePct1d != null ? (
                                <span className="flex items-center gap-1">
                                    {indicatorsData.merval.changePct1d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {indicatorsData.merval.changePct1d > 0 ? '+' : ''}{indicatorsData.merval.changePct1d.toFixed(2)}%
                                </span>
                            ) : '—'}
                        </p>
                    </div>

                    {/* S&P 500 */}
                    <div className="glass rounded-xl p-4 border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <BarChart3 className="h-4 w-4" />
                            <span className="text-xs font-medium">S&P 500</span>
                        </div>
                        <p className="font-semibold text-lg">
                            {indicatorsLoading ? '...' : indicatorsData?.sp500.value ? formatNumberAR(indicatorsData.sp500.value, 0, 0) : '—'}
                        </p>
                        <p className={cn(
                            "text-sm",
                            (indicatorsData?.sp500.changePct1d ?? 0) > 0 ? "text-success" : (indicatorsData?.sp500.changePct1d ?? 0) < 0 ? "text-destructive" : ""
                        )}>
                            {indicatorsData?.sp500.changePct1d != null ? (
                                <span className="flex items-center gap-1">
                                    {indicatorsData.sp500.changePct1d > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                    {indicatorsData.sp500.changePct1d > 0 ? '+' : ''}{indicatorsData.sp500.changePct1d.toFixed(2)}%
                                </span>
                            ) : '—'}
                        </p>
                    </div>

                    {/* Dólar CCL */}
                    <div className="glass rounded-xl p-4 border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <DollarSign className="h-4 w-4" />
                            <span className="text-xs font-medium">Dólar CCL</span>
                        </div>
                        <p className="font-semibold text-lg">
                            {indicatorsLoading ? '...' : indicatorsData?.ccl.value ? formatMoneyARS(indicatorsData.ccl.value) : '—'}
                        </p>
                        <p className="text-sm text-muted-foreground">—</p>
                    </div>

                    {/* Riesgo País */}
                    <div className="glass rounded-xl p-4 border">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-xs font-medium">Riesgo País</span>
                        </div>
                        <p className="font-semibold text-lg">
                            {indicatorsLoading ? '...' : indicatorsData?.riesgoPais.value ? formatNumberAR(indicatorsData.riesgoPais.value, 0, 0) : '—'}
                        </p>
                        <p className={cn(
                            "text-sm",
                            (indicatorsData?.riesgoPais.changeAbs1d ?? 0) < 0 ? "text-success" : (indicatorsData?.riesgoPais.changeAbs1d ?? 0) > 0 ? "text-destructive" : ""
                        )}>
                            {indicatorsData?.riesgoPais.changeAbs1d != null ? (
                                <span className="flex items-center gap-1">
                                    {indicatorsData.riesgoPais.changeAbs1d > 0 ? '+' : ''}{indicatorsData.riesgoPais.changeAbs1d} pts
                                </span>
                            ) : '—'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-4 sm:px-6 lg:px-8 border-b">
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setCurrentTab(tab.id)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                                currentTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {tab.id === 'favorites' && favorites.size > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                                    {favorites.size}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Controls Bar */}
            <div className="px-4 py-3 sm:px-6 lg:px-8 bg-muted/20 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto">
                    {currentTab === 'cedears' && (
                        <>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Modo:</span>
                            <div className="flex bg-muted rounded-lg p-1">
                                <button
                                    onClick={() => setCedearMode('top')}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        cedearMode === 'top' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Top 50
                                </button>
                                <button
                                    onClick={() => setCedearMode('all')}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        cedearMode === 'all' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Todos
                                </button>
                            </div>
                        </>
                    )}

                    {currentTab === 'crypto' && (
                        <>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Modo:</span>
                            <div className="flex bg-muted rounded-lg p-1">
                                <button
                                    onClick={() => setCryptoMode('my')}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        cryptoMode === 'my' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Mis criptos
                                </button>
                                <button
                                    onClick={() => setCryptoMode('top100')}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        cryptoMode === 'top100' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Top 100
                                </button>
                                <button
                                    onClick={() => setCryptoMode('top250')}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium",
                                        cryptoMode === 'top250' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Top 250
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Pagination Info / Page Size */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                        {totalItems > 0 ? (
                            `Mostrando ${startItem}–${endItem} de ${totalItems}`
                        ) : (
                            '0 activos'
                        )}
                    </span>
                    {(currentTab === 'crypto' && cryptoMode !== 'my') && (
                        <select
                            value={cryptoPageSize}
                            onChange={(e) => {
                                setCryptoPageSize(Number(e.target.value))
                                setCryptoPage(1)
                            }}
                            className="bg-transparent border rounded px-2 py-0.5 text-xs"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    )}
                </div>
            </div>

            {/* Error state */}
            {cedearsError && currentTab === 'cedears' && (
                <div className="px-4 py-4 sm:px-6 lg:px-8">
                    <div className="bg-destructive/10 text-destructive rounded-lg p-4 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        <p>Error al cargar CEDEARs: {(cedearsError as Error).message}</p>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {currentTab === 'fci' ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-lg font-medium">Próximamente</p>
                        <p className="text-sm">Los FCI estarán disponibles pronto</p>
                    </div>
                ) : isLoading ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                        <p>Cargando cotizaciones...</p>
                    </div>
                ) : displayedAssets.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                        <p>No hay activos para mostrar</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-muted/50 sticky top-0">
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="px-4 py-3 w-10"></th>

                                <th
                                    className="px-4 py-3 cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleSort(currentTab === 'cedears' ? 'ticker' : 'marketCap')} // Crypto 'marketCap' is usually default ranking fallback, but by ticker 'ticker'.
                                >
                                    <div className="flex items-center">
                                        Activo
                                        {/* Sort icon logic generalized */}
                                    </div>
                                </th>

                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleSort('lastPrice')}
                                >
                                    <div className="flex items-center justify-end">
                                        Último
                                        <SortIcon
                                            column="lastPrice"
                                            activeSort={currentTab === 'cedears' ? cedearSort : cryptoSort}
                                            activeDir={currentTab === 'cedears' ? cedearDir : cryptoDir}
                                        />
                                    </div>
                                </th>

                                <th
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleSort('changePct')}
                                >
                                    <div className="flex items-center justify-end">
                                        Var.
                                        <SortIcon
                                            column="changePct"
                                            activeSort={currentTab === 'cedears' ? cedearSort : cryptoSort}
                                            activeDir={currentTab === 'cedears' ? cedearDir : cryptoDir}
                                        />
                                    </div>
                                </th>

                                {currentTab === 'crypto' && (
                                    <>
                                        <th
                                            className="px-4 py-3 text-right hidden md:table-cell cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleSort('marketCap')}
                                        >
                                            <div className="flex items-center justify-end">
                                                Market Cap
                                                <SortIcon column="marketCap" activeSort={cryptoSort} activeDir={cryptoDir} />
                                            </div>
                                        </th>
                                        <th
                                            className="px-4 py-3 text-right hidden md:table-cell cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleSort('volume')}
                                        >
                                            <div className="flex items-center justify-end">
                                                Vol 24h
                                                <SortIcon column="volume" activeSort={cryptoSort} activeDir={cryptoDir} />
                                            </div>
                                        </th>
                                    </>
                                )}
                                {currentTab === 'cedears' && (
                                    <>
                                        <th
                                            className="px-4 py-3 text-right hidden md:table-cell cursor-pointer hover:bg-muted/50"
                                            onClick={() => handleSort('volume')}
                                        >
                                            <div className="flex items-center justify-end">
                                                Volumen
                                                <SortIcon column="volume" activeSort={cedearSort} activeDir={cedearDir} />
                                            </div>
                                        </th>
                                        <th className="px-4 py-3 text-center hidden lg:table-cell">Ratio</th>
                                    </>
                                )}
                                <th className="px-4 py-3 w-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {displayedAssets.map(asset => (
                                <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => toggleFavorite(asset.id)}
                                            className="text-muted-foreground hover:text-warning transition-colors"
                                        >
                                            <Star
                                                className={cn(
                                                    "h-4 w-4",
                                                    favorites.has(asset.id) && "fill-warning text-warning"
                                                )}
                                            />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {asset.image && (
                                                <img src={asset.image} alt="" className="h-6 w-6 rounded-full" />
                                            )}
                                            <div>
                                                <p className="font-medium">{asset.ticker}</p>
                                                <p className="text-xs text-muted-foreground">{asset.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {asset.currency === 'ARS'
                                            ? formatMoneyARS(asset.lastPrice)
                                            : formatMoneyUSD(asset.lastPrice)}
                                    </td>
                                    <td className={cn(
                                        "px-4 py-3 text-right font-mono",
                                        (asset.changePct ?? 0) > 0 ? "text-success" : (asset.changePct ?? 0) < 0 ? "text-destructive" : ""
                                    )}>
                                        {asset.changePct != null ? (
                                            <span className="flex items-center justify-end gap-1">
                                                {asset.changePct > 0 ? <TrendingUp className="h-3 w-3" /> : asset.changePct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                                {asset.changePct > 0 ? '+' : ''}{asset.changePct.toFixed(2)}%
                                            </span>
                                        ) : '—'}
                                    </td>
                                    {currentTab === 'crypto' && (
                                        <>
                                            <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                                {formatLargeNumber(asset.marketCap)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                                {formatLargeNumber(asset.volume)}
                                            </td>
                                        </>
                                    )}
                                    {currentTab === 'cedears' && (
                                        <>
                                            <td className="px-4 py-3 text-right font-mono hidden md:table-cell">
                                                {asset.volume ? formatNumberAR(asset.volume, 0, 0) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center hidden lg:table-cell">
                                                {asset.ratioText ? (
                                                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                                                        {asset.ratioText}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-4 py-3">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedAsset(asset)}
                                        >
                                            Ver
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Footer */}
            {(totalPages > 1 && (currentTab === 'cedears' || currentTab === 'crypto')) && (
                <div className="px-4 py-3 border-t bg-card/50 flex items-center justify-between">
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

            {/* Timestamps */}
            {lastUpdated && (
                <div className="px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20 text-center">
                    <span className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3" />
                        Actualizado: {new Date(lastUpdated).toLocaleTimeString('es-AR')}
                    </span>
                </div>
            )}

            {/* Detail Modal */}
            {selectedAsset && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedAsset(null)}>
                    <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                {selectedAsset.image && (
                                    <img src={selectedAsset.image} alt="" className="h-10 w-10 rounded-full" />
                                )}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold">{selectedAsset.ticker}</h2>
                                        <span className={cn(
                                            "px-2 py-0.5 text-xs rounded-full font-medium",
                                            selectedAsset.kind === 'cedear' ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500"
                                        )}>
                                            {selectedAsset.kind === 'cedear' ? 'CEDEAR' : 'CRYPTO'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{selectedAsset.name}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedAsset(null)}>
                                ✕
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Último precio</p>
                                    <p className="text-lg font-semibold">
                                        {selectedAsset.currency === 'ARS'
                                            ? formatMoneyARS(selectedAsset.lastPrice)
                                            : formatMoneyUSD(selectedAsset.lastPrice)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Variación</p>
                                    <p className={cn(
                                        "text-lg font-semibold",
                                        (selectedAsset.changePct ?? 0) > 0 ? "text-success" : (selectedAsset.changePct ?? 0) < 0 ? "text-destructive" : ""
                                    )}>
                                        {selectedAsset.changePct != null
                                            ? `${selectedAsset.changePct > 0 ? '+' : ''}${selectedAsset.changePct.toFixed(2)}%`
                                            : '—'}
                                    </p>
                                </div>
                            </div>

                            {/* CEDEAR specific: Ratio */}
                            {selectedAsset.kind === 'cedear' && selectedAsset.ratioText && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Ratio CEDEAR</p>
                                    <p className="font-medium">{selectedAsset.ratioText}</p>
                                </div>
                            )}

                            {/* Volume */}
                            {selectedAsset.volume != null && (
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        {selectedAsset.kind === 'crypto' ? 'Volumen 24h' : 'Volumen'}
                                    </p>
                                    <p className="font-medium">{formatLargeNumber(selectedAsset.volume)}</p>
                                </div>
                            )}

                            {/* Crypto specific: Market Cap */}
                            {selectedAsset.kind === 'crypto' && selectedAsset.marketCap != null && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Market Cap</p>
                                    <p className="font-medium">{formatLargeNumber(selectedAsset.marketCap)}</p>
                                </div>
                            )}

                            {/* Conversion */}
                            {selectedAsset.currency === 'ARS' && fxRates?.mep && (
                                <div className="pt-2 border-t">
                                    <p className="text-xs text-muted-foreground">Equivalente USD (MEP)</p>
                                    <p className="font-medium">{formatMoneyUSD(selectedAsset.lastPrice / fxRates.mep)}</p>
                                </div>
                            )}
                            {selectedAsset.currency === 'USD' && fxRates?.cripto && (
                                <div className="pt-2 border-t">
                                    <p className="text-xs text-muted-foreground">Equivalente ARS (Cripto)</p>
                                    <p className="font-medium">{formatMoneyARS(selectedAsset.lastPrice * fxRates.cripto)}</p>
                                </div>
                            )}

                            {/* CEDEAR: Implied CCL */}
                            {selectedAsset.kind === 'cedear' && selectedAsset.ratio && fxRates?.ccl && (
                                <div>
                                    <p className="text-xs text-muted-foreground">CCL Implícito</p>
                                    <p className="font-medium text-sm">
                                        {formatMoneyARS((selectedAsset.lastPrice * selectedAsset.ratio))}
                                        <span className="text-muted-foreground"> / acción subyacente</span>
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                Fuente: {selectedAsset.kind === 'cedear' ? 'PPI' : 'CoinGecko'}
                                {selectedAsset.kind === 'cedear' && (
                                    <span className="px-1.5 py-0.5 bg-warning/10 text-warning text-xs rounded ml-2">
                                        Delay 15min
                                    </span>
                                )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Dato informativo / puede tener delay
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
