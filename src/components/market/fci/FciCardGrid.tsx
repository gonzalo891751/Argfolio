/**
 * FCI Card Grid Component
 * 
 * Mobile-friendly card grid view for FCI funds.
 */

import { Star, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatVcp, formatVariation } from './fciFormatters'
import type { FciFund } from '@/domain/fci/types'

export interface FciCardGridProps {
    items: FciFund[]
    favorites: Set<string>
    onToggleFavorite: (id: string, e: React.MouseEvent) => void
    onCardClick: (item: FciFund) => void
}

export function FciCardGrid({
    items,
    favorites,
    onToggleFavorite,
    onCardClick,
}: FciCardGridProps) {
    return (
        <div className="md:hidden grid grid-cols-1 gap-4">
            {items.map((item) => {
                const isFav = favorites.has(item.id)
                const variation = item.variation1d
                const isPositive = variation != null && variation > 0
                const isNegative = variation != null && variation < 0

                return (
                    <div
                        key={item.id}
                        className="glass-panel p-4 rounded-xl active:bg-muted/30 transition cursor-pointer"
                        onClick={() => onCardClick(item)}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 min-w-0 mr-2">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                    {item.manager}
                                </span>
                                <h3 className="text-foreground font-medium text-sm leading-tight mt-1 truncate">
                                    {item.name}
                                </h3>
                            </div>
                            <button
                                className="p-2 -mr-2 -mt-2"
                                onClick={(e) => onToggleFavorite(item.id, e)}
                            >
                                <Star
                                    className={cn(
                                        "h-5 w-5 transition",
                                        isFav
                                            ? "fill-warning text-warning"
                                            : "text-muted-foreground/50"
                                    )}
                                />
                            </button>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="flex gap-2 mb-2">
                                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground border border-border/50">
                                        {item.category}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground border border-border/50">
                                        {item.currency}
                                    </span>
                                </div>
                                <div className="font-mono text-lg text-foreground">
                                    {formatVcp(item.vcp, item.currency)}
                                </div>
                            </div>
                            <div className="text-right">
                                <div
                                    className={cn(
                                        "font-mono text-xs font-medium mb-1 flex items-center gap-1 justify-end",
                                        isPositive && "text-success",
                                        isNegative && "text-destructive",
                                        !isPositive && !isNegative && "text-muted-foreground"
                                    )}
                                >
                                    {isPositive && <TrendingUp className="h-3 w-3" />}
                                    {isNegative && <TrendingDown className="h-3 w-3" />}
                                    {formatVariation(variation)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {item.term || '—'}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
