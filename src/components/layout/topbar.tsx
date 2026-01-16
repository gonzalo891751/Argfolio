import { useState } from 'react'
import { RefreshCw, TrendingUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useRefreshAll } from '@/hooks/use-portfolio'
import { formatRelativeTime, formatNumber } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { MobileNav } from '@/components/layout/sidebar'
import { TickerTape } from '@/components/layout/ticker-tape'

type ViewMode = 'dashboard' | 'mercado'

export function Topbar() {
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard')
    const { data: fxRates, isLoading: fxLoading } = useFxRates()
    const { lastRefreshTime } = useAutoRefresh()
    const refreshAll = useRefreshAll()
    const [isRefreshing, setIsRefreshing] = useState(false)

    const handleRefresh = async () => {
        setIsRefreshing(true)
        await refreshAll()
        setIsRefreshing(false)
    }

    return (
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b">
            <div className="flex items-center justify-between h-14 px-4">
                {/* Left: Mobile nav + View mode toggle */}
                <div className="flex items-center gap-2">
                    <MobileNav />

                    <div className="hidden sm:flex items-center gap-1 bg-muted rounded-lg p-1">
                        <Button
                            variant={viewMode === 'dashboard' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('dashboard')}
                            className="h-7 px-3"
                        >
                            Dashboard
                        </Button>
                        <Button
                            variant={viewMode === 'mercado' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('mercado')}
                            className="h-7 px-3"
                        >
                            <TrendingUp className="h-4 w-4 mr-1" />
                            Mercado
                        </Button>
                    </div>
                </div>

                {/* Center: FX Strip */}
                <div className="hidden md:flex items-center gap-4 flex-1 mx-4 overflow-x-auto">
                    {fxLoading ? (
                        <div className="flex gap-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-8 w-24" />
                            ))}
                        </div>
                    ) : fxRates ? (
                        <>
                            <FxBadge label="Oficial" value={fxRates.oficial.sell ?? 0} />
                            <FxBadge label="Blue" value={fxRates.blue.sell ?? 0} variant="blue" />
                            <FxBadge label="MEP" value={fxRates.mep.sell ?? 0} variant="mep" />
                            <FxBadge label="CCL" value={fxRates.ccl.sell ?? 0} />
                            <FxBadge label="Cripto" value={fxRates.cripto.sell ?? 0} variant="crypto" />
                        </>
                    ) : null}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {lastRefreshTime && (
                        <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(lastRefreshTime)}
                        </span>
                    )}

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="h-8"
                    >
                        <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                        <span className="hidden sm:inline ml-1.5">Actualizar</span>
                    </Button>

                    <ThemeToggle />
                    <UserMenu />
                </div>
            </div>

            {/* Ticker tape (Mercado mode) */}
            {viewMode === 'mercado' && <TickerTape />}
        </header>
    )
}

function FxBadge({
    label,
    value,
    variant = 'default',
}: {
    label: string
    value: number
    variant?: 'default' | 'blue' | 'mep' | 'crypto'
}) {
    const colorClasses = {
        default: 'bg-secondary text-secondary-foreground',
        blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        mep: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        crypto: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    }

    return (
        <Badge variant="outline" className={cn('font-mono shrink-0', colorClasses[variant])}>
            <span className="text-xs opacity-70 mr-1">{label}</span>
            {Number.isFinite(value) && value > 0
                ? `$${formatNumber(value, 0)}`
                : '—'}
        </Badge>
    )
}
