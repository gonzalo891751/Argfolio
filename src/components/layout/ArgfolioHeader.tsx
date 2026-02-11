import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useMarketCedears } from '@/hooks/useMarketCedears'
import { useMarketCrypto } from '@/hooks/useMarketCrypto'
import { useMarketFci } from '@/hooks/useMarketFci'
import { useRefreshAll } from '@/hooks/use-portfolio'
import { useSidebar } from '@/components/layout/sidebar'

import { HeaderLogo } from './header/HeaderLogo'
import { HeaderTicker } from './header/HeaderTicker'
import { HeaderModeSelector, type TickerMode } from './header/HeaderModeSelector'
import { RefreshOverlay } from './header/RefreshOverlay'

import '@/styles/header.css'

// ============ Fallback Data ============
// TODO: Connect inflation to real API
const INFLATION_DATA = { monthly: 2.4, annual: 117.8 }

// Fallback market data if hooks return empty
const FALLBACK_CEDEARS = [
    { symbol: 'AAPL', price: 21500.50, delta: 0.012 },
    { symbol: 'MSFT', price: 34200.00, delta: 0.008 },
    { symbol: 'AMZN', price: 19800.75, delta: 0.021 },
    { symbol: 'GOOGL', price: 18100.25, delta: -0.012 },
    { symbol: 'TSLA', price: 15400.00, delta: -0.034 },
    { symbol: 'NVDA', price: 65400.00, delta: 0.052 },
    { symbol: 'META', price: 42100.20, delta: 0.031 },
    { symbol: 'KO', price: 12300.50, delta: 0.001 },
    { symbol: 'JPM', price: 28900.00, delta: 0.005 },
    { symbol: 'XOM', price: 17500.80, delta: -0.004 },
]

const FALLBACK_CRYPTOS = [
    { symbol: 'BTC', price: 64230.00, delta: 0.035 },
    { symbol: 'ETH', price: 3450.00, delta: 0.021 },
    { symbol: 'SOL', price: 145.20, delta: 0.084 },
    { symbol: 'BNB', price: 590.00, delta: -0.005 },
    { symbol: 'XRP', price: 0.62, delta: 0.012 },
]

const FALLBACK_FCIS = [
    { symbol: 'MM T+0', price: 154.20, delta: 0.095 },
    { symbol: 'MM T+1', price: 230.45, delta: 0.124 },
    { symbol: 'RF CP', price: 1120.00, delta: 0.002 },
    { symbol: 'RF LP', price: 450.10, delta: 0.056 },
    { symbol: 'CER', price: 890.50, delta: 0.012 },
    { symbol: 'D.LINKED', price: 1250.30, delta: 0.005 },
    { symbol: 'ACC ARG', price: 3450.00, delta: 0.045 },
    { symbol: 'ACC GLOB', price: 5600.20, delta: 0.023 },
    { symbol: 'MIX BAL', price: 1800.50, delta: 0.015 },
    { symbol: 'RET TOT', price: 2100.00, delta: 0.032 },
]

// ============ Types ============
interface ArgfolioHeaderProps {
    /** Condensed mode from scroll - smaller height, more glass */
    condensed?: boolean
}

// ============ Main Component ============
export function ArgfolioHeader({ condensed = false }: ArgfolioHeaderProps) {
    const [mode, setMode] = useState<TickerMode>('dolar')
    const [scrolled, setScrolled] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

    // ========== Data Hooks ==========
    const { data: fxRates } = useFxRates()
    const { rows: cedearRows } = useMarketCedears({ mode: 'top', pageSize: 10 })
    const { rows: cryptoRows } = useMarketCrypto({ mode: 'top100', pageSize: 5 })
    const { items: fciItems } = useMarketFci()
    const refreshAll = useRefreshAll()

    // ========== Transform data for ticker ==========
    const cedears = cedearRows.length > 0
        ? cedearRows.map(c => ({
            symbol: c.ticker,
            price: c.lastPriceArs ?? 0,
            delta: (c.changePct1d ?? 0) / 100,
        }))
        : FALLBACK_CEDEARS

    const cryptos = cryptoRows.length > 0
        ? cryptoRows.map(c => ({
            symbol: c.ticker,
            price: c.priceUsd,
            delta: (c.changePct24h ?? 0) / 100,
        }))
        : FALLBACK_CRYPTOS

    const fcis = fciItems.length > 0
        ? fciItems.slice(0, 10).map(f => ({
            symbol: f.name?.slice(0, 12) || f.id || 'FCI',
            price: f.vcp ?? 0,
            delta: f.variation1d ?? 0,
        }))
        : FALLBACK_FCIS

    // ========== Scroll State (iOS glass effect) ==========
    useEffect(() => {
        function handleScroll() {
            setScrolled(window.scrollY > 8)
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // ========== Refresh Handler ==========
    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true)
        try {
            await refreshAll()
        } catch (error) {
            console.error('Refresh failed:', error)
        } finally {
            setIsRefreshing(false)
        }
    }, [refreshAll])

    // Get sidebar state for mobile nav
    const { setIsMobileOpen } = useSidebar()

    return (
        <>
            <header
                className={cn(
                    // Sticky inside main area (NOT full-screen fixed)
                    'sticky top-0 z-30',
                    'argf-header',
                    // Condensed: smaller height + more glass
                    condensed ? 'h-12' : 'h-16',
                    condensed && 'is-condensed',
                    scrolled && 'scrolled'
                )}
                style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
            >
                <div className={cn(
                    "h-full flex items-center justify-between gap-4",
                    condensed ? 'px-3 lg:px-4' : 'px-4 lg:px-6'
                )}>
                    {/* Mobile: Menu button + Logo | Desktop: Hidden (sidebar has logo) */}
                    <div className="lg:hidden flex items-center gap-2">
                        <button
                            onClick={() => setIsMobileOpen(true)}
                            className="glass-button w-11 h-11 rounded-full flex items-center justify-center text-slate-400 hover:text-white"
                            aria-label="Abrir menú"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <HeaderLogo />
                    </div>

                    {/* 2. Ticker - paused when condensed (static mode) */}
                    <HeaderTicker
                        mode={mode}
                        fxRates={fxRates}
                        cedears={cedears}
                        cryptos={cryptos}
                        fcis={fcis}
                        inflation={INFLATION_DATA}
                        paused={condensed}
                    />

                    {/* 3. Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Mode Selector */}
                        <HeaderModeSelector mode={mode} onModeChange={setMode} />

                        {/* Divider */}
                        <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

                        {/* Refresh Button */}
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="glass-button w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white group relative overflow-hidden"
                            aria-label="Actualizar datos"
                        >
                            <RefreshCw
                                className={cn(
                                    'w-4 h-4 relative z-10 transition-transform duration-500',
                                    isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'
                                )}
                            />
                        </button>

                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center ml-1 cursor-pointer hover:border-primary/50 transition-colors shadow-lg hidden sm:flex">
                            <span className="font-display text-sm font-bold text-white">U</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Refresh Overlay */}
            <RefreshOverlay visible={isRefreshing} />
        </>
    )
}
