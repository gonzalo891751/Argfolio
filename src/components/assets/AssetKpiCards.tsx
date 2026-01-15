import { TrendingUp, TrendingDown, DollarSign, Coins, PiggyBank, BarChart3, Calculator } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatQty, formatPercent, formatMoney } from '@/lib/format'
import { AssetCategory } from '@/domain/types'

interface AssetKpiCardsProps {
    category: AssetCategory
    totalQuantity: number

    // Dual Values
    avgCostArs: number
    avgCostUsd: number
    totalInvestedArs: number
    totalInvestedUsd: number
    currentValueArs: number
    currentValueUsd: number
    unrealizedPnL_ARS: number
    unrealizedPnL_USD: number
    unrealizedPnLPercent: number

    // Legacy / Single needed?
    realizedPnL: number // Native for now
    currentPrice: number // Native usually
    tradeCurrency: string // Native currency code

    isLoading?: boolean
}

export function AssetKpiCards({
    category,
    totalQuantity,
    avgCostArs,
    avgCostUsd,
    totalInvestedArs,
    totalInvestedUsd,
    currentValueArs,
    currentValueUsd,
    unrealizedPnL_ARS,
    unrealizedPnL_USD,
    unrealizedPnLPercent,
    realizedPnL,
    currentPrice,
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

    // Determine Primary vs Secondary
    // CEDEAR: ARS (Big) / USD (Small)
    // CRYPTO: USD (Big) / ARS (Small)

    const isCrypto = category === 'CRYPTO' || category === 'STABLE'
    const isCedear = category === 'CEDEAR'

    // Helper to format pair
    const formatPair = (valArs: number | null, valUsd: number | null) => {
        // CEDEAR -> Prioritize ARS
        if (isCedear) {
            return {
                primary: formatMoneyARS(valArs),
                secondary: formatMoneyUSD(valUsd),
            }
        }

        // Crypto -> Prioritize USD
        if (isCrypto) {
            return {
                primary: formatMoneyUSD(valUsd),
                secondary: formatMoneyARS(valArs),
            }
        }

        // Default Logic based on tradeCurrency
        // If tradeCurrency is USD, USD primary.
        const isTradeUsd = tradeCurrency === 'USD' || tradeCurrency === 'USDT' || tradeCurrency === 'USDC'
        if (isTradeUsd) {
            return {
                primary: formatMoneyUSD(valUsd),
                secondary: formatMoneyARS(valArs),
            }
        } else {
            return {
                primary: formatMoneyARS(valArs),
                secondary: formatMoneyUSD(valUsd),
            }
        }
    }

    const invested = formatPair(totalInvestedArs, totalInvestedUsd)
    const currentVal = formatPair(currentValueArs, currentValueUsd)
    const avg = formatPair(avgCostArs, avgCostUsd)

    // For PnL, we need to handle the number check for color
    const pnlPair = formatPair(unrealizedPnL_ARS, unrealizedPnL_USD)

    const getPrimaryPnLValue = () => {
        if (isCedear) return unrealizedPnL_ARS
        if (isCrypto) return unrealizedPnL_USD
        const isTradeUsd = tradeCurrency === 'USD' || tradeCurrency === 'USDT' || tradeCurrency === 'USDC'
        return isTradeUsd ? unrealizedPnL_USD : unrealizedPnL_ARS
    }
    const primaryPnLValue = getPrimaryPnLValue()

    const kpis = [
        {
            label: 'Cantidad Total',
            value: formatQty(totalQuantity, category),
            icon: Coins,
            color: 'text-primary',
        },
        {
            label: 'Total Invertido',
            value: invested.primary,
            subValue: invested.secondary,
            icon: PiggyBank,
            color: 'text-muted-foreground',
        },
        {
            label: 'Valor Actual',
            value: currentVal.primary,
            subValue: currentVal.secondary,
            icon: DollarSign,
            color: 'text-primary',
            highlight: true,
        },
        {
            label: 'Costo Promedio',
            value: avg.primary,
            subValue: avg.secondary,
            icon: BarChart3,
            color: 'text-muted-foreground',
        },
        {
            label: 'Precio Actual',
            // Show price in native currency only usually? Or dual?
            // "manual price is ARS" for CEDEAR. "current price from CoinGecko in USD" for Crypto.
            // Let's show Native/Source price.
            value: formatMoney(currentPrice, tradeCurrency),
            icon: Calculator,
            color: 'text-primary',
        },
        {
            label: 'PnL No Realizado',
            value: pnlPair.primary,
            subValue: `${pnlPair.secondary} (${formatPercent(unrealizedPnLPercent)})`,
            isPositive: (primaryPnLValue ?? 0) >= 0,
            icon: TrendingUp, // icon will be dynamic
            color: 'dynamic',
        },
        {
            label: 'PnL Realizado',
            value: formatMoney(realizedPnL, tradeCurrency), // Keep realized in native/trade currency for now
            isPositive: realizedPnL >= 0,
            icon: TrendingUp,
            color: 'dynamic',
        },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpis.map((kpi) => {
                const isPositive = kpi.isPositive
                // Dynamic color logic moved to colorToUse

                const colorToUse = kpi.color === 'dynamic' ? (isPositive ? 'text-green-600' : 'text-destructive') : kpi.color

                const Icon = kpi.label.includes('PnL') ? (isPositive ? TrendingUp : TrendingDown) : kpi.icon

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
                                <Icon className={cn('h-4 w-4', colorToUse)} />
                            </div>
                            <p className={cn('text-lg font-semibold font-numeric', colorToUse)}>
                                {kpi.value}
                            </p>
                            {kpi.subValue && (
                                <p className={cn('text-sm font-numeric text-muted-foreground')}>
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
