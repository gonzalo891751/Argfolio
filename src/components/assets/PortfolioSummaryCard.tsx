/**
 * Portfolio Summary Card
 * Displays total valuations and PnL breakdown (Unrealized vs Realized)
 */

import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatDeltaMoneyARS, formatDeltaMoneyUSD } from '@/lib/format'

interface PortfolioSummaryCardProps {
    totalArs: number
    totalUsdEq: number
    unrealizedPnlArs: number
    unrealizedPnlUsd: number
    realizedPnlArs: number
    realizedPnlUsd: number
    className?: string
}

export function PortfolioSummaryCard({
    totalArs,
    totalUsdEq,
    unrealizedPnlArs,
    unrealizedPnlUsd,
    realizedPnlArs,
    realizedPnlUsd,
    className,
}: PortfolioSummaryCardProps) {
    const unrealizedColor = unrealizedPnlArs >= 0 ? 'text-emerald-500' : 'text-red-500'
    const realizedColor = realizedPnlArs >= 0 ? 'text-emerald-500' : 'text-red-500'

    return (
        <div className={cn("glass rounded-xl p-6 border", className)}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Patrimonio total</h2>
                    <p className="text-3xl font-bold font-numeric tracking-tight">{formatMoneyARS(totalArs)}</p>
                    <p className="text-lg text-muted-foreground mt-1 font-mono">
                        ≈ {formatMoneyUSD(totalUsdEq)}
                    </p>
                </div>
            </div>

            <div className="pt-4 border-t grid grid-cols-2 gap-4">
                {/* Unrealized PnL */}
                <div>
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">PnL no realizado</h3>
                    <div className="flex flex-col">
                        <span className={cn("text-lg font-bold font-numeric", unrealizedColor)}>
                            {formatDeltaMoneyARS(unrealizedPnlArs)}
                        </span>
                        <span className={cn("text-xs font-mono opacity-80", unrealizedColor)}>
                            ≈ {formatDeltaMoneyUSD(unrealizedPnlUsd)}
                        </span>
                    </div>
                </div>

                {/* Realized PnL */}
                <div className="border-l pl-4">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">PnL realizado</h3>
                    <div className="flex flex-col">
                        <span className={cn("text-lg font-bold font-numeric", realizedColor)}>
                            {formatDeltaMoneyARS(realizedPnlArs)}
                        </span>
                        <span className={cn("text-xs font-mono opacity-80", realizedColor)}>
                            ≈ {formatDeltaMoneyUSD(realizedPnlUsd)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
