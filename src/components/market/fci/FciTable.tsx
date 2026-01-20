/**
 * FCI Table Component
 * 
 * Desktop table view for FCI funds with sortable columns.
 */

import { Star, TrendingUp, TrendingDown, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatVcp, formatVariation, formatDateAR } from './fciFormatters'
import type { FciFund } from '@/domain/fci/types'

export type SortKey = 'name' | 'vcp' | 'variation1d'
export type SortDir = 'asc' | 'desc'

export interface FciTableProps {
    items: FciFund[]
    favorites: Set<string>
    onToggleFavorite: (id: string, e: React.MouseEvent) => void
    onRowClick: (item: FciFund) => void
    sortKey: SortKey
    sortDir: SortDir
    onSort: (key: SortKey) => void
}

function SortIcon({ column, activeSort, activeDir }: { column: SortKey; activeSort: SortKey; activeDir: SortDir }) {
    if (activeSort !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/30" />
    return activeDir === 'asc'
        ? <ChevronUp className="h-3 w-3 ml-1 text-primary" />
        : <ChevronDown className="h-3 w-3 ml-1 text-primary" />
}

export function FciTable({
    items,
    favorites,
    onToggleFavorite,
    onRowClick,
    sortKey,
    sortDir,
    onSort,
}: FciTableProps) {
    return (
        <div className="hidden md:block glass-panel rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-border/50 bg-muted/50 text-xs text-muted-foreground uppercase tracking-wider font-mono">
                        <th
                            className="py-3 px-6 font-medium cursor-pointer hover:text-foreground transition group"
                            onClick={() => onSort('name')}
                        >
                            <div className="flex items-center">
                                Fondo / Gestora
                                <SortIcon column="name" activeSort={sortKey} activeDir={sortDir} />
                            </div>
                        </th>
                        <th className="py-3 px-4 font-medium">Categoría</th>
                        <th
                            className="py-3 px-4 font-medium text-right cursor-pointer hover:text-foreground transition group"
                            onClick={() => onSort('vcp')}
                        >
                            <div className="flex items-center justify-end">
                                VCP
                                <SortIcon column="vcp" activeSort={sortKey} activeDir={sortDir} />
                            </div>
                        </th>
                        <th
                            className="py-3 px-4 font-medium text-right cursor-pointer hover:text-foreground transition group"
                            onClick={() => onSort('variation1d')}
                        >
                            <div className="flex items-center justify-end">
                                Var. Día
                                <SortIcon column="variation1d" activeSort={sortKey} activeDir={sortDir} />
                            </div>
                        </th>
                        <th className="py-3 px-4 font-medium text-right">Rescate</th>
                        <th className="py-3 px-6 text-center w-16">
                            <Star className="h-4 w-4 text-muted-foreground/50 mx-auto" />
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/30 text-sm">
                    {items.map((item) => {
                        const isFav = favorites.has(item.id)
                        const variation = item.variation1d
                        const isPositive = variation != null && variation > 0
                        const isNegative = variation != null && variation < 0

                        return (
                            <tr
                                key={item.id}
                                className="group hover:bg-muted/30 transition cursor-pointer"
                                onClick={() => onRowClick(item)}
                            >
                                <td className="py-4 px-6">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-foreground group-hover:text-primary transition truncate max-w-[280px]">
                                            {item.name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {item.manager} • {item.currency}
                                        </span>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground border border-border/50 whitespace-nowrap">
                                        {item.category}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right">
                                    <div className="font-mono text-foreground">
                                        {formatVcp(item.vcp, item.currency)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {formatDateAR(item.date)}
                                    </div>
                                </td>
                                <td className="py-4 px-4 text-right">
                                    <div
                                        className={cn(
                                            "font-mono text-xs font-medium px-2 py-1 rounded inline-flex items-center gap-1",
                                            isPositive && "bg-success/10 text-success",
                                            isNegative && "bg-destructive/10 text-destructive",
                                            !isPositive && !isNegative && "text-muted-foreground"
                                        )}
                                    >
                                        {isPositive && <TrendingUp className="h-3 w-3" />}
                                        {isNegative && <TrendingDown className="h-3 w-3" />}
                                        {formatVariation(variation)}
                                    </div>
                                </td>
                                <td className="py-4 px-4 text-right text-xs text-muted-foreground font-mono">
                                    {item.term || '—'}
                                </td>
                                <td className="py-4 px-6 text-center">
                                    <button
                                        onClick={(e) => onToggleFavorite(item.id, e)}
                                        className="hover:scale-110 transition"
                                    >
                                        <Star
                                            className={cn(
                                                "h-5 w-5 transition",
                                                isFav
                                                    ? "fill-warning text-warning"
                                                    : "text-muted-foreground/50 hover:text-warning"
                                            )}
                                        />
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
