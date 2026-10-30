/**
 * Top bar: today's dollars at a glance and a refresh button.
 * Quotes refresh by themselves every few minutes; the button forces it.
 */

import { useState } from 'react'
import { Menu, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useRefreshAll } from '@/hooks/use-portfolio'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { useSidebar } from '@/components/layout/sidebar'
import { ArgfolioLogo } from '@/components/brand/ArgfolioLogo'
import type { FxPair } from '@/domain/types'

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function Quote({ label, pair, className }: { label: string; pair: FxPair | undefined; className?: string }) {
    const sell = pair?.sell
    if (!sell) return null
    const title = pair?.buy ? `${label}: compra $ ${nf.format(pair.buy)} · venta $ ${nf.format(sell)}` : `${label}: $ ${nf.format(sell)}`
    return (
        <span className={cn('flex shrink-0 items-baseline gap-1.5 whitespace-nowrap', className)} title={title}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold tabular-nums">$ {nf.format(sell)}</span>
        </span>
    )
}

export function AppHeader() {
    const { data: fx } = useFxRates()
    const refreshAll = useRefreshAll()
    const { lastRefreshTime } = useAutoRefresh()
    const { setIsMobileOpen } = useSidebar()
    const [refreshing, setRefreshing] = useState(false)

    const onRefresh = async () => {
        setRefreshing(true)
        try {
            await refreshAll()
        } finally {
            setRefreshing(false)
        }
    }

    return (
        <header
            className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
                <div className="flex items-center gap-2 lg:hidden">
                    <button
                        type="button"
                        onClick={() => setIsMobileOpen(true)}
                        className="-ml-2 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Abrir menú"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <ArgfolioLogo variant="mark" className="h-7 w-7" />
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <Quote label="MEP" pair={fx?.mep} />
                    <Quote label="Oficial" pair={fx?.oficial} />
                    <Quote label="Cripto" pair={fx?.cripto} />
                    <Quote label="Blue" pair={fx?.blue} className="hidden sm:flex" />
                    <Quote label="CCL" pair={fx?.ccl} className="hidden md:flex" />
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {lastRefreshTime && (
                        <span className="hidden text-xs text-muted-foreground md:inline">
                            {lastRefreshTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                        aria-label="Actualizar cotizaciones"
                        title="Actualizar cotizaciones"
                    >
                        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                    </button>
                </div>
            </div>
        </header>
    )
}
