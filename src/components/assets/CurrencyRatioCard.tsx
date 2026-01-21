/**
 * Currency Ratio Card
 * Displays portfolio composition by currency (ARS vs USD)
 */

import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'

interface CurrencyRatioCardProps {
    exposureArs: number
    exposureUsd: number
    fxRate: number
    className?: string
}

export function CurrencyRatioCard({
    exposureArs,
    exposureUsd,
    fxRate,
    className,
}: CurrencyRatioCardProps) {
    // Determine total in ARS for Percentage Calculation strictly
    const clampedArs = Math.max(0, exposureArs)
    const clampedUsd = Math.max(0, exposureUsd)
    const usdAsArs = clampedUsd * fxRate
    const totalArs = clampedArs + usdAsArs

    const arsPct = totalArs > 0 ? clampedArs / totalArs : 0
    const usdPct = totalArs > 0 ? usdAsArs / totalArs : 0
    const hasNegative = exposureArs < 0 || exposureUsd < 0

    return (
        <div className={cn("glass rounded-xl p-6 border flex flex-col justify-center", className)}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-muted-foreground uppercase tracking-wider">Relación Pesos / Dólares</h3>
            </div>
            {hasNegative && (
                <div className="text-[11px] text-amber-500 mb-2">
                    Saldo negativo en {exposureArs < 0 ? 'ARS' : 'USD'}
                </div>
            )}


            {/* Bar */}
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex mb-4">
                <div
                    className="h-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${arsPct * 100}%` }}
                />
                <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${usdPct * 100}%` }}
                />
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-4">
                {/* Pesos Column */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-sky-500" />
                        <span className="text-xs font-medium text-muted-foreground">Pesos</span>
                    </div>
                    <span className="text-lg font-bold font-numeric">{formatPercent(arsPct)}</span>

                    {/* Native ARS Display */}
                    <span className="text-sm text-sky-400 font-medium mt-1">{formatMoneyARS(exposureArs)}</span>
                    {/* Converted to USD */}
                    <span className="text-[10px] text-muted-foreground">≈ {formatMoneyUSD(exposureArs / fxRate)}</span>
                </div>

                {/* Dólares Column */}
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 mb-1 justify-end">
                        <span className="text-xs font-medium text-muted-foreground">Dólares</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-lg font-bold font-numeric text-right">{formatPercent(usdPct)}</span>

                    {/* Native USD Display */}
                    <span className="text-sm text-emerald-400 font-medium mt-1 text-right">{formatMoneyUSD(exposureUsd)}</span>
                    {/* Converted to ARS */}
                    <span className="text-[10px] text-muted-foreground text-right">≈ {formatMoneyARS(usdAsArs)}</span>
                </div>
            </div>
        </div>
    )
}
