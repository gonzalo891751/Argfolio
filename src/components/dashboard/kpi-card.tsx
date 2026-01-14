import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatCurrency, formatPercent } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface KpiCardProps {
    title: string
    valueArs: number
    valueUsd?: number
    change?: number
    changePercent?: number
    icon?: React.ComponentType<{ className?: string }>
    isLoading?: boolean
    variant?: 'default' | 'highlight'
}

export function KpiCard({
    title,
    valueArs,
    valueUsd,
    change,
    changePercent,
    icon: Icon,
    isLoading,
    variant = 'default',
}: KpiCardProps) {
    if (isLoading) {
        return (
            <Card className="card-hover">
                <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-4 w-20" />
                </CardContent>
            </Card>
        )
    }

    const isPositive = (changePercent ?? 0) >= 0

    return (
        <Card className={cn(
            'card-hover',
            variant === 'highlight' && 'border-primary/30 bg-primary/5'
        )}>
            <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{title}</span>
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                </div>

                <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-numeric">
                            {formatCurrency(valueArs, 'ARS')}
                        </span>
                    </div>

                    {valueUsd !== undefined && (
                        <div className="text-sm text-muted-foreground font-numeric">
                            {formatCurrency(valueUsd, 'USD')}
                        </div>
                    )}

                    {changePercent !== undefined && (
                        <div className={cn(
                            'flex items-center gap-1 text-sm font-medium',
                            isPositive ? 'text-success' : 'text-destructive'
                        )}>
                            {isPositive ? (
                                <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                                <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            <span>{formatPercent(changePercent)}</span>
                            {change !== undefined && (
                                <span className="text-muted-foreground ml-1">
                                    ({formatCurrency(change, 'ARS', { showSign: true, compact: true })})
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

export function KpiCardSkeleton() {
    return (
        <Card>
            <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-20" />
            </CardContent>
        </Card>
    )
}
