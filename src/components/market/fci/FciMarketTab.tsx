/**
 * FCI Market Tab Component
 * 
 * Main container for the FCI section in the Market page.
 * Includes header, toolbar, table/cards, pagination, and modal.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, Search, AlertTriangle } from 'lucide-react'
import { useMarketFci } from '@/hooks/useMarketFci'
import { getFavorites, toggleFavorite as toggleFav } from '@/lib/favoritesStorage'
import { FciToolbar } from './FciToolbar'
import { FciTable, type SortKey, type SortDir } from './FciTable'
import { FciCardGrid } from './FciCardGrid'
import { FciDetailModal } from './FciDetailModal'
import { FciPagination } from './FciPagination'
import type { FciFund, FciCategory, FciCurrency } from '@/domain/fci/types'

const DEFAULT_PAGE_SIZE = 25

export function FciMarketTab() {
    // Data fetching
    const { items, asOf, isLoading, isFetching, isError, error, refetch } = useMarketFci()

    // UI State
    const [searchText, setSearchText] = useState('')
    const [category, setCategory] = useState<FciCategory | 'all'>('all')
    const [currency, setCurrency] = useState<FciCurrency | 'all'>('all')
    const [favOnly, setFavOnly] = useState(false)
    const [favorites, setFavorites] = useState<Set<string>>(() => getFavorites('fci'))
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

    // Sorting
    const [sortKey, setSortKey] = useState<SortKey>('name')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    // Pagination
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

    // Modal
    const [selectedFund, setSelectedFund] = useState<FciFund | null>(null)

    // Update lastUpdated when data loads
    useEffect(() => {
        if (asOf) {
            setLastUpdated(new Date(asOf))
        }
    }, [asOf])

    // Keyboard shortcut for search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault()
                document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]')?.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Filter and sort data
    const filteredItems = useMemo(() => {
        let result = [...items]

        // Filter by search
        if (searchText) {
            const query = searchText.toLowerCase()
            result = result.filter(
                (f) =>
                    f.name.toLowerCase().includes(query) ||
                    f.manager.toLowerCase().includes(query)
            )
        }

        // Filter by category
        if (category !== 'all') {
            result = result.filter((f) => f.category === category)
        }

        // Filter by currency
        if (currency !== 'all') {
            result = result.filter((f) => f.currency === currency)
        }

        // Filter by favorites
        if (favOnly) {
            result = result.filter((f) => favorites.has(f.id))
        }

        // Sort
        result.sort((a, b) => {
            let valA: string | number | null = null
            let valB: string | number | null = null

            switch (sortKey) {
                case 'name':
                    valA = a.name.toLowerCase()
                    valB = b.name.toLowerCase()
                    break
                case 'vcp':
                    valA = a.vcp
                    valB = b.vcp
                    break
                case 'variation1d':
                    valA = a.variation1d ?? -Infinity
                    valB = b.variation1d ?? -Infinity
                    break
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1
            if (valA > valB) return sortDir === 'asc' ? 1 : -1
            return 0
        })

        return result
    }, [items, searchText, category, currency, favOnly, favorites, sortKey, sortDir])

    // Paginated data
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize
        return filteredItems.slice(start, start + pageSize)
    }, [filteredItems, currentPage, pageSize])

    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchText, category, currency, favOnly, pageSize])

    // Handlers
    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir(key === 'name' ? 'asc' : 'desc')
        }
    }

    const handleToggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        toggleFav('fci', id)
        setFavorites(getFavorites('fci'))
    }, [])

    const handleRefresh = useCallback(() => {
        refetch()
        setLastUpdated(new Date())
    }, [refetch])

    // Loading state
    if (isLoading && items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin mb-4" />
                <p className="text-lg font-medium">Cargando fondos...</p>
                <p className="text-sm">Consultando mercado</p>
            </div>
        )
    }

    // Error state
    if (isError && items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-foreground font-medium mb-1">No pudimos cargar los datos</h3>
                <p className="text-muted-foreground text-sm mb-4 max-w-xs">
                    {error?.message || 'Hubo un error al conectar con el servidor. Por favor intentá de nuevo.'}
                </p>
                <button
                    onClick={handleRefresh}
                    className="text-primary text-sm font-medium hover:text-primary/80 hover:underline"
                >
                    Reintentar
                </button>
            </div>
        )
    }

    return (
        <div className="relative min-h-[400px]">
            {/* Loading Overlay */}
            {isFetching && (
                <div className="absolute inset-0 z-20 bg-background/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-4 h-4 border-2 border-muted border-l-primary rounded-full animate-spin" />
                        <span className="text-sm font-medium text-primary animate-pulse">
                            Consultando mercado...
                        </span>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="mb-8 relative">
                {/* Background decoration */}
                <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-muted text-muted-foreground border border-border/50">
                                Mercado Local
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-muted text-muted-foreground border border-border/50">
                                ArgentinaDatos
                            </span>
                        </div>
                        <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-2">
                            Fondos Comunes
                        </h1>
                        <p className="text-muted-foreground text-lg max-w-2xl">
                            Explorá y compará el rendimiento de los principales FCI de Argentina.
                            Valores de cuotaparte al cierre anterior.
                        </p>
                    </div>

                    {/* Summary Cards */}
                    <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
                        <div className="glass-panel p-3 rounded-xl min-w-[140px]">
                            <div className="text-xs text-muted-foreground font-medium mb-1">Total Fondos</div>
                            <div className="font-mono text-lg text-foreground font-medium">
                                {items.length}
                            </div>
                            <div className="text-[10px] text-muted-foreground">disponibles</div>
                        </div>
                        <div className="glass-panel p-3 rounded-xl min-w-[140px]">
                            <div className="text-xs text-muted-foreground font-medium mb-1">Money Market</div>
                            <div className="font-mono text-lg text-foreground font-medium">
                                {items.filter((f) => f.category === 'Money Market').length}
                            </div>
                            <div className="text-[10px] text-success">Rescate T+0</div>
                        </div>
                        <div className="glass-panel p-3 rounded-xl min-w-[140px]">
                            <div className="text-xs text-muted-foreground font-medium mb-1">Renta Fija</div>
                            <div className="font-mono text-lg text-foreground font-medium">
                                {items.filter((f) => f.category === 'Renta Fija').length}
                            </div>
                            <div className="text-[10px] text-muted-foreground">Rescate T+1</div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Toolbar */}
            <FciToolbar
                searchText={searchText}
                onSearchChange={setSearchText}
                category={category}
                onCategoryChange={setCategory}
                currency={currency}
                onCurrencyChange={setCurrency}
                favOnly={favOnly}
                onFavToggle={() => setFavOnly((v) => !v)}
                onRefresh={handleRefresh}
                isLoading={isFetching}
                lastUpdated={lastUpdated}
            />

            {/* Empty State */}
            {filteredItems.length === 0 ? (
                <div className="py-16 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                        <Search className="h-5 w-5" />
                    </div>
                    <h3 className="text-foreground font-medium mb-1">No encontramos resultados</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                        Probá cambiando los filtros o la búsqueda.
                    </p>
                    <button
                        onClick={() => {
                            setSearchText('')
                            setCategory('all')
                            setCurrency('all')
                            setFavOnly(false)
                        }}
                        className="text-primary text-sm font-medium hover:text-primary/80"
                    >
                        Limpiar filtros
                    </button>
                </div>
            ) : (
                <>
                    {/* Table (Desktop) */}
                    <FciTable
                        items={paginatedItems}
                        favorites={favorites}
                        onToggleFavorite={handleToggleFavorite}
                        onRowClick={setSelectedFund}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                    />

                    {/* Card Grid (Mobile) */}
                    <FciCardGrid
                        items={paginatedItems}
                        favorites={favorites}
                        onToggleFavorite={handleToggleFavorite}
                        onCardClick={setSelectedFund}
                    />

                    {/* Pagination */}
                    <FciPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredItems.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                    />
                </>
            )}

            {/* Detail Modal */}
            {selectedFund && (
                <FciDetailModal fund={selectedFund} onClose={() => setSelectedFund(null)} />
            )}
        </div>
    )
}
