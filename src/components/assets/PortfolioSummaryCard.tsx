/**
 * Portfolio Summary Card
 * Displays total valuations with mode indicator
 */

import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
interface PortfolioSummaryCardProps {
    totalArs: number
    totalUsdEq: number
    pnlArs?: number | null
    pnlPct?: number | null
    className?: string
}

export function PortfolioSummaryCard({
    totalArs,
    totalUsdEq,
    pnlArs,
    pnlPct,
    className,
}: PortfolioSummaryCardProps) {
    const pnlColor = (pnlArs ?? 0) >= 0 ? 'text-success' : 'text-destructive'
    const pnlSign = (pnlArs ?? 0) >= 0 ? '+' : ''

    return (
        <div className={cn("glass rounded-xl p-6 border", className)}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-sm text-muted-foreground mb-1">Valuación Total</p>
                    <p className="text-3xl font-bold">{formatMoneyARS(totalArs)}</p>
                    <p className="text-lg text-muted-foreground mt-1">
                        ≈ {formatMoneyUSD(totalUsdEq)}
                    </p>
                </div>
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-500/10 text-amber-500">
                    Liquidación (si vendo hoy)
                </span>
            </div>

            {pnlArs != null && (
                <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">PnL Total</p>
                    <div className="flex items-baseline gap-3">
                        <span className={cn("text-lg font-semibold", pnlColor)}>
                            {pnlSign}{formatMoneyARS(pnlArs)}
                        </span>
                        {pnlPct != null && (
                            <span className={cn("text-sm", pnlColor)}>
                                ({pnlSign}{(pnlPct * 100).toFixed(2)}%)
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
