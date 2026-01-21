import { cn } from '@/lib/utils'

interface CreditCardSummaryProps {
    arsAmount: number
    usdAmount?: number
    closingInDays?: number
    limitUsedPercent?: number
    limitTotal?: number
    className?: string
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

const usdFormatter = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

const arsCompactFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    maximumFractionDigits: 1,
})

function formatClosingLabel(days?: number) {
    if (days === undefined) return undefined
    if (days <= 0) return 'Cierra hoy'
    if (days === 1) return 'Cierra en 1 día'
    return `Cierra en ${days} días`
}

export function CreditCardSummary({
    arsAmount,
    usdAmount,
    closingInDays,
    limitUsedPercent,
    limitTotal,
    className,
}: CreditCardSummaryProps) {
    const closingLabel = formatClosingLabel(closingInDays)
    const showLimit = typeof limitTotal === 'number' && limitTotal > 0 && typeof limitUsedPercent === 'number'

    return (
        <div className={cn('space-y-6', className)}>
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400 font-medium">Saldo Actual</span>
                {closingLabel && (
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">
                        {closingLabel}
                    </span>
                )}
            </div>

            <div>
                <div className="flex items-baseline gap-2">
                    <span className="text-sm text-slate-400 font-medium">ARS</span>
                    <span className="text-4xl font-mono font-bold text-white tracking-tighter">
                        {arsFormatter.format(arsAmount)}
                    </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xs text-slate-500 font-medium">USD</span>
                    <span className="text-lg font-mono text-slate-300">
                        {typeof usdAmount === 'number' ? usdFormatter.format(usdAmount) : '—'}
                    </span>
                </div>
            </div>

            {showLimit && (
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-400">
                        <span>Límite utilizado: {Math.round(limitUsedPercent)}%</span>
                        <span>Total: {arsCompactFormatter.format(limitTotal)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-700/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-sky-400 w-full rounded-full shadow-[0_0_20px_-6px_rgba(99,102,241,0.6)]"
                            style={{ width: `${Math.min(limitUsedPercent, 100)}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
