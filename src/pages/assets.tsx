import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Edit2 } from 'lucide-react'
import { cn, formatCurrency, formatPercent, getChangeColor } from '@/lib/utils'
import { useComputedPortfolio } from '@/hooks/use-computed-portfolio'
import { useManualPrices } from '@/hooks/use-manual-prices'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ManualPriceDialog } from '@/components/assets/ManualPriceDialog'
import type { AssetCategory } from '@/domain/types'

const categoryLabels: Record<AssetCategory, string> = {
    CEDEAR: 'Cedears',
    CRYPTO: 'Cripto',
    STABLE: 'Stablecoins',
    USD_CASH: 'Dólares',
    ARS_CASH: 'Pesos',
    FCI: 'FCI',
    PF: 'Plazos Fijos',
    WALLET: 'Wallets',
    DEBT: 'Deudas',
}

export function AssetsPage() {
    const navigate = useNavigate()
    const { data: portfolio, isLoading } = useComputedPortfolio()
    const { priceMap: manualPrices } = useManualPrices()
    const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'all'>('all')
    const [searchQuery, setSearchQuery] = useState('')

    // Manual Price Dialog State
    const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
    const [editingSymbol, setEditingSymbol] = useState('')
    const [editingPrice, setEditingPrice] = useState<number | undefined>(undefined)

    // Flatten holdings from all categories
    const allHoldings = useMemo(() => {
        if (!portfolio) return []
        return portfolio.categories.flatMap((cat) =>
            cat.items.map((item) => ({
                id: item.instrumentId,
                symbol: item.instrument.symbol,
                name: item.instrument.name,
                category: item.instrument.category,
                nativeCurrency: item.instrument.nativeCurrency,
                quantity: item.totalQuantity,
                avgCost: item.avgCost,
                currentPrice: item.currentPrice,
                valueARS: item.valueARS ?? 0,
                valueUSD: item.valueUSD ?? 0,
                unrealizedPnL: item.unrealizedPnL ?? 0,
                unrealizedPnLPercent: item.unrealizedPnLPercent ?? 0,
                changePct1dArs: item.changePct1dArs,
                changePct1dUsd: item.changePct1dUsd,
                fxUsed: item.fxUsed,
            }))
        )
    }, [portfolio])

    const filteredHoldings = useMemo(() => {
        return allHoldings.filter((holding) => {
            const matchesCategory = selectedCategory === 'all' || holding.category === selectedCategory
            const matchesSearch =
                searchQuery === '' ||
                holding.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                holding.name.toLowerCase().includes(searchQuery.toLowerCase())
            return matchesCategory && matchesSearch
        })
    }, [allHoldings, selectedCategory, searchQuery])

    const categories: (AssetCategory | 'all')[] = useMemo(() => {
        const uniqueCategories = new Set(allHoldings.map((h) => h.category))
        return ['all', ...Array.from(uniqueCategories)] as (AssetCategory | 'all')[]
    }, [allHoldings])

    const openPriceDialog = (e: React.MouseEvent, id: string, symbol: string, price?: number) => {
        e.stopPropagation()
        setEditingPriceId(id)
        setEditingSymbol(symbol)
        setEditingPrice(price)
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Mis Activos</h1>
                    <p className="text-muted-foreground">
                        {allHoldings.length} activo{allHoldings.length !== 1 ? 's' : ''} en tu portfolio
                    </p>
                </div>

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

            {/* Category filter */}
            {categories.length > 1 && (
                <Tabs
                    value={selectedCategory}
                    onValueChange={(v) => setSelectedCategory(v as AssetCategory | 'all')}
                >
                    <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                        <TabsList className="w-max">
                            {categories.map((cat) => (
                                <TabsTrigger key={cat} value={cat}>
                                    {cat === 'all' ? 'Todos' : categoryLabels[cat] ?? cat}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </Tabs>
            )}

            {/* Holdings table */}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : filteredHoldings.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">
                            {allHoldings.length === 0 ? (
                                <>
                                    <p className="text-lg font-medium mb-2">Sin activos</p>
                                    <p>Cargá tu primer movimiento para ver tus holdings aquí</p>
                                </>
                            ) : searchQuery ? (
                                'No se encontraron resultados'
                            ) : (
                                'Sin activos en esta categoría'
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px]">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Activo</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Categoría</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Cantidad</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Precio Actual</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Var 1d</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Valuación</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">FX</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">PnL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredHoldings.map((holding) => {
                                        const isCedear = holding.category === 'CEDEAR'
                                        const isManual = manualPrices.has(holding.id)
                                        const isAuto = isCedear && !isManual && (holding.currentPrice ?? 0) > 0
                                        const displayCurrency = holding.nativeCurrency === 'ARS' || isCedear ? 'ARS' : 'USD'

                                        return (
                                            <tr
                                                key={holding.id}
                                                onClick={() => navigate(`/assets/${holding.id}`)}
                                                className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                                            >
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                                                            {holding.symbol.slice(0, 2)}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{holding.symbol}</p>
                                                            <p className="text-sm text-muted-foreground">{holding.name}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <Badge variant="secondary">{categoryLabels[holding.category] ?? holding.category}</Badge>
                                                </td>
                                                <td className="p-4 text-right font-numeric">
                                                    {holding.quantity < 1 ? holding.quantity.toFixed(8) : holding.quantity.toFixed(2)}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span className="font-numeric">
                                                                {holding.currentPrice ? formatCurrency(holding.currentPrice, displayCurrency) : '—'}
                                                            </span>
                                                            {isCedear && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-6 w-6"
                                                                    onClick={(e) => openPriceDialog(e, holding.id, holding.symbol, holding.currentPrice)}
                                                                >
                                                                    <Edit2 className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                        {isCedear && (holding.currentPrice ?? 0) > 0 && (
                                                            <div className="flex gap-1">
                                                                {isManual ? (
                                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-normal">
                                                                        MANUAL
                                                                    </Badge>
                                                                ) : isAuto ? (
                                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-normal">
                                                                        AUTO
                                                                    </Badge>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        {holding.changePct1dUsd !== undefined ? (
                                                            <span className={cn("font-medium text-xs", getChangeColor(holding.changePct1dUsd))}>
                                                                USD {formatPercent(holding.changePct1dUsd)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}

                                                        {holding.changePct1dArs !== undefined && holding.changePct1dUsd !== undefined && Math.abs((holding.changePct1dArs) - (holding.changePct1dUsd)) > 0.01 && (
                                                            <span className={cn("text-[10px]", getChangeColor(holding.changePct1dArs))}>
                                                                ARS {formatPercent(holding.changePct1dArs)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right font-numeric">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{formatCurrency(holding.valueUSD, 'USD')}</span>
                                                        <span className="text-xs text-muted-foreground">{formatCurrency(holding.valueARS, 'ARS')}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right">
                                                    {holding.fxUsed && (
                                                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                                                            {holding.fxUsed}
                                                        </Badge>
                                                    )}
                                                </td>
                                                <td className={cn('p-4 text-right font-numeric', getChangeColor(holding.unrealizedPnLPercent))}>
                                                    {formatPercent(holding.unrealizedPnLPercent)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ManualPriceDialog
                isOpen={!!editingPriceId}
                onOpenChange={(open) => !open && setEditingPriceId(null)}
                instrumentId={editingPriceId || ''}
                symbol={editingSymbol}
                currentPrice={editingPrice}
            />
        </div>
    )
}

