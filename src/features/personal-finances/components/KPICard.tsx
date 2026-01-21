// =============================================================================
// KPI CARD COMPONENT
// =============================================================================

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
    title: string
    value: string
    subValue?: string
    trend?: number
    icon: LucideIcon
    type?: 'neutral' | 'success' | 'danger' | 'primary'
}

export function KPICard({
    title,
    value,
    subValue,
    trend,
    icon: Icon,
    type = 'neutral',
}: KPICardProps) {
    const trendColor =
        trend && trend > 0
            ? 'text-emerald-400'
            : trend && trend < 0
                ? 'text-rose-400'
                : 'text-muted-foreground'

    const iconColor = {
        neutral: 'text-primary',
        success: 'text-emerald-400',
        danger: 'text-rose-400',
        primary: 'text-primary',
    }[type]

    const glowClass =
        type === 'primary'
            ? 'ring-1 ring-primary/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
            : ''

    const formatPercent = (val: number) => {
        const sign = val > 0 ? '+' : ''
        return `${sign}${val.toFixed(1)}%`
    }

    return (
        <div
            className={cn(
                'relative p-5 rounded-xl bg-card border border-border flex flex-col justify-between h-full group transition-all hover:bg-accent/50',
                glowClass
            )}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    {title}
                </span>
                <div
                    className={cn(
                        'p-2 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors',
                        iconColor
                    )}
                >
                    <Icon size={16} />
                </div>
            </div>
            <div>
                <div className="text-2xl font-mono font-medium text-foreground tracking-tight">
                    {value}
                </div>
                {subValue && (
                    <div className="flex items-center gap-2 mt-1">
                        {trend !== undefined && trend !== 0 && (
                            <span className={cn('text-xs font-mono font-medium', trendColor)}>
                                {trend > 0 ? '▲' : '▼'} {formatPercent(Math.abs(trend))}
                            </span>
                        )}
                        <span className="text-xs text-muted-foreground">{subValue}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

// =============================================================================
// COVERAGE RATIO CARD (Special KPI)
// =============================================================================

interface CoverageRatioCardProps {
    ratio: number
}

export function CoverageRatioCard({ ratio }: CoverageRatioCardProps) {
    const colorClass =
        ratio > 80
            ? 'bg-rose-500'
            : ratio > 50
                ? 'bg-amber-500'
                : 'bg-emerald-500'

    const iconColor = ratio > 80 ? 'text-rose-400' : 'text-emerald-400'

    return (
        <div className="relative p-5 rounded-xl bg-card border border-border flex flex-col justify-between h-full">
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Ratio de Cobertura
                </span>
                <div className={cn('p-2 rounded-lg bg-muted/50', iconColor)}>
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                </div>
            </div>
            <div>
                <div className="text-2xl font-mono font-medium text-foreground tracking-tight">
                    {ratio.toFixed(1)}%
                </div>
                <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono mb-1">
                        <span>SALUDABLE</span>
                        <span>AL LÍMITE</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn('h-full transition-all duration-500 ease-out', colorClass)}
                            style={{ width: `${Math.min(100, ratio)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
