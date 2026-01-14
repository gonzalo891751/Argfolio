import { TrendingUp, TrendingDown, DollarSign, Coins, PiggyBank, BarChart3 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatCurrency, formatPercent } from '@/lib/utils'

interface AssetKpiCardsProps {
    totalQuantity: number
    avgCost: number
    totalInvested: number
    currentPrice: number
    currentValue: number
    unrealizedPnL: number
    unrealizedPnLPercent: number
    realizedPnL: number
    tradeCurrency: string
    isLoading?: boolean
}

export function AssetKpiCards({
    totalQuantity,
    avgCost,
    totalInvested,
    currentPrice,
    currentValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    realizedPnL,
    tradeCurrency,
    isLoading,
}: AssetKpiCardsProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Card key={i}>
                        <CardContent className="p-4">
                            <Skeleton className="h-4 w-20 mb-2" />
                            <Skeleton className="h-6 w-28" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    const kpis = [
        {
            label: 'Cantidad Total',
            value: totalQuantity < 1 ? totalQuantity.toFixed(8) : totalQuantity.toFixed(4),
            icon: Coins,
            color: 'text-primary',
        },
        {
            label: 'Total Invertido',
            value: formatCurrency(totalInvested, tradeCurrency as 'USD' | 'ARS'),
            icon: PiggyBank,
            color: 'text-muted-foreground',
        },
        {
            label: 'Valor Actual',
            value: formatCurrency(currentValue, tradeCurrency as 'USD' | 'ARS'),
            icon: DollarSign,
            color: 'text-primary',
            highlight: true,
        },
        {
            label: 'Costo Promedio',
            value: formatCurrency(avgCost, tradeCurrency as 'USD' | 'ARS'),
            icon: BarChart3,
            color: 'text-muted-foreground',
        },
        {
            label: 'Precio Actual',
            value: formatCurrency(currentPrice, tradeCurrency as 'USD' | 'ARS'),
            icon: DollarSign,
            color: 'text-primary',
        },
        {
            label: 'PnL No Realizado',
            value: formatCurrency(unrealizedPnL, tradeCurrency as 'USD' | 'ARS'),
            subValue: formatPercent(unrealizedPnLPercent),
            icon: unrealizedPnL >= 0 ? TrendingUp : TrendingDown,
            color: unrealizedPnL >= 0 ? 'text-success' : 'text-destructive',
        },
        {
            label: 'PnL Realizado',
            value: formatCurrency(realizedPnL, tradeCurrency as 'USD' | 'ARS'),
            icon: realizedPnL >= 0 ? TrendingUp : TrendingDown,
            color: realizedPnL >= 0 ? 'text-success' : 'text-destructive',
        },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((kpi) => {
                const Icon = kpi.icon
                return (
                    <Card
                        key={kpi.label}
                        className={cn(
                            'transition-shadow hover:shadow-md',
                            kpi.highlight && 'border-primary/30 bg-primary/5'
                        )}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                                <Icon className={cn('h-4 w-4', kpi.color)} />
                            </div>
                            <p className={cn('text-lg font-semibold font-numeric', kpi.color)}>
                                {kpi.value}
                            </p>
                            {kpi.subValue && (
                                <p className={cn('text-sm font-numeric', kpi.color)}>
                                    {kpi.subValue}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
