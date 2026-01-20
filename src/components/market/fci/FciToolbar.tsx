/**
 * FCI Toolbar Component
 * 
 * Search, filters, favorites toggle, and refresh controls.
 */

import { Search, RefreshCw, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CATEGORY_LABELS } from './fciFormatters'
import type { FciCategory, FciCurrency } from '@/domain/fci/types'

export interface FciToolbarProps {
    searchText: string
    onSearchChange: (value: string) => void
    category: FciCategory | 'all'
    onCategoryChange: (value: FciCategory | 'all') => void
    currency: FciCurrency | 'all'
    onCurrencyChange: (value: FciCurrency | 'all') => void
    favOnly: boolean
    onFavToggle: () => void
    onRefresh: () => void
    isLoading: boolean
    lastUpdated: Date | null
}

const CATEGORIES: (FciCategory | 'all')[] = [
    'all',
    'Money Market',
    'Renta Fija',
    'Renta Mixta',
    'Renta Variable',
    'Infraestructura',
    'Otros',
]

export function FciToolbar({
    searchText,
    onSearchChange,
    category,
    onCategoryChange,
    currency,
    onCurrencyChange,
    favOnly,
    onFavToggle,
    onRefresh,
    isLoading,
    lastUpdated,
}: FciToolbarProps) {
    return (
        <div className="flex flex-col xl:flex-row gap-4 mb-6 justify-between items-start xl:items-center">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
                {/* Search */}
                <div className="relative w-full md:w-64 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition" />
                    <Input
                        type="text"
                        placeholder="Buscar fondo o gestora... (/)"
                        value={searchText}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Dropdowns */}
                <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
                    {/* Category Filter */}
                    <select
                        value={category}
                        onChange={(e) => onCategoryChange(e.target.value as FciCategory | 'all')}
                        className="bg-muted border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary hover:bg-muted/80 transition cursor-pointer appearance-none min-w-[160px]"
                    >
                        <option value="all">Todas las Categorías</option>
                        {CATEGORIES.filter(c => c !== 'all').map(cat => (
                            <option key={cat} value={cat}>
                                {CATEGORY_LABELS[cat] || cat}
                            </option>
                        ))}
                    </select>

                    {/* Currency Filter */}
                    <select
                        value={currency}
                        onChange={(e) => onCurrencyChange(e.target.value as FciCurrency | 'all')}
                        className="bg-muted border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:border-primary hover:bg-muted/80 transition cursor-pointer appearance-none"
                    >
                        <option value="all">Todas las monedas</option>
                        <option value="ARS">Pesos (ARS)</option>
                        <option value="USD">Dólares (USD)</option>
                    </select>

                    {/* Favorites Toggle */}
                    <button
                        onClick={onFavToggle}
                        className={cn(
                            "border rounded-lg py-2 px-3 flex items-center gap-2 whitespace-nowrap transition",
                            favOnly
                                ? "bg-warning/10 border-warning/30 text-warning"
                                : "bg-muted border-border text-muted-foreground hover:text-warning hover:border-warning/30"
                        )}
                    >
                        <Star className={cn("h-4 w-4", favOnly && "fill-warning")} />
                        <span className="hidden sm:inline">Mis Favoritos</span>
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 w-full xl:w-auto justify-between xl:justify-end">
                {lastUpdated && (
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            Última actualización
                        </div>
                        <div className="text-xs font-mono text-foreground">
                            {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}hs
                        </div>
                    </div>
                )}
                <Button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="gap-2"
                >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    Actualizar
                </Button>
            </div>
        </div>
    )
}
