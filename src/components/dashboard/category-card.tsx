import { ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, formatCurrency, formatPercent } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CategorySummary, Holding } from '@/types/portfolio'

interface CategoryCardProps {
    category: CategorySummary
    icon: React.ComponentType<{ className?: string }>
    linkTo?: string
    maxItems?: number
}

export function CategoryCard({
    category,
    icon: Icon,
    linkTo = '/assets',
    maxItems = 4,
}: CategoryCardProps) {
    // Auto-hide if no items
    if (category.items.length === 0 || category.totalArs === 0) {
        return null
    }

    const displayItems = category.items.slice(0, maxItems)
    const remainingCount = category.items.length - maxItems

    return (
        <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-base font-semibold">{category.label}</CardTitle>
                </div>
                <Link
                    to={linkTo}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                    Ver más
                    <ChevronRight className="h-4 w-4" />
                </Link>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Summary */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xl font-bold font-numeric">
                            {formatCurrency(category.totalArs, 'ARS')}
                        </p>
                        <p className="text-sm text-muted-foreground font-numeric">
                            {formatCurrency(category.totalUsd, 'USD')}
                        </p>
                    </div>
                    {category.changeTodayPercent !== 0 && (
                        <Badge variant={category.changeTodayPercent > 0 ? 'positive' : 'negative'}>
                            {category.changeTodayPercent > 0 ? (
                                <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                                <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {formatPercent(category.changeTodayPercent)}
                        </Badge>
                    )}
                </div>

                {/* Items list */}
                <div className="space-y-2">
                    {displayItems.map((item) => (
                        <HoldingRow key={item.id} holding={item} />
                    ))}
                    {remainingCount > 0 && (
                        <p className="text-xs text-muted-foreground text-center pt-1">
                            +{remainingCount} más
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function HoldingRow({ holding }: { holding: Holding }) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{holding.symbol}</span>
                {holding.platform && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                        {holding.platform}
                    </span>
                )}
            </div>
            <div className="text-right shrink-0">
                <p className="text-sm font-numeric">{formatCurrency(holding.valueArs, 'ARS')}</p>
                {holding.changeTodayPercent !== 0 && (
                    <p
                        className={cn(
                            'text-xs font-numeric',
                            holding.changeTodayPercent > 0 ? 'text-success' : 'text-destructive'
                        )}
                    >
                        {formatPercent(holding.changeTodayPercent)}
                    </p>
                )}
            </div>
        </div>
    )
}
