import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTickerScroll } from '@/hooks/useTickerScroll'
import type { TickerMode } from './HeaderModeSelector'
import type { FxRates } from '@/domain/types'

// ============ Types ============
interface FxItem {
    label: string
    buy: number
    sell: number
    delta?: number
}

interface MarketItem {
    symbol: string
    price: number
    delta: number
    isUsd?: boolean
}

interface InflationData {
    monthly: number
    annual: number
}

interface HeaderTickerProps {
    mode: TickerMode
    fxRates: FxRates | null | undefined
    cedears: MarketItem[]
    cryptos: MarketItem[]
    fcis: MarketItem[]
    inflation: InflationData
    /** When true, ticker auto-scroll is paused (e.g., header condensed) */
    paused?: boolean
}

// ============ Formatters ============
const AR_LOCALE = 'es-AR'

function formatMoney(amount: number, isUsd = false): string {
    const formatted = amount.toLocaleString(AR_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
    return isUsd ? `US$ ${formatted}` : `$ ${formatted}`
}

function getDeltaDisplay(delta: number): { text: string; className: string } {
    const isPositive = delta > 0
    const isNegative = delta < 0
    const arrow = isPositive ? '▲' : isNegative ? '▼' : '▬'
    const colorClass = isPositive
        ? 'text-semantic-up'
        : isNegative
            ? 'text-semantic-down'
            : 'text-slate-400'

    return {
        text: `${arrow} ${Math.abs(delta * 100).toFixed(2)}%`,
        className: colorClass,
    }
}

// ============ Sub-Components ============
function FxTickerItem({ item }: { item: FxItem }) {
    return (
        <div className="ticker-item px-4 border-r border-white/5 h-8">
            <div className="flex flex-col items-end justify-center h-full">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 leading-none">
                    {item.label}
                </span>
                <div className="flex items-center gap-2 text-xs font-mono leading-none">
                    <span className="text-slate-300">
                        <span className="text-semantic-up font-bold">C:</span> {formatMoney(item.buy)}
                    </span>
                    <span className="text-white font-medium">
                        <span className="text-semantic-down font-bold">V:</span> {formatMoney(item.sell)}
                    </span>
                </div>
            </div>
        </div>
    )
}

function InflationTickerItem({ data }: { data: InflationData }) {
    return (
        <div className="ticker-item px-4 h-full mx-2">
            <div className="flex items-center gap-3 px-5 py-1.5 rounded-full bg-gradient-hot shadow-glow-hot transition-transform hover:scale-105 duration-300">
                {/* Fire icon */}
                <svg
                    className="w-5 h-5 text-red-400 animate-pulse-slow drop-shadow-lg"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fillRule="evenodd"
                        d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
                        clipRule="evenodd"
                    />
                </svg>
                <div className="flex flex-col leading-none">
                    <span className="text-[10px] font-bold text-red-200 uppercase tracking-widest font-display mb-0.5 shadow-sm">
                        INFLACIÓN
                    </span>
                    <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-semantic-down drop-shadow-sm">
                            Men: {data.monthly.toFixed(1)}%
                        </span>
                        <span className="w-px h-3 bg-red-400/30" />
                        <span className="font-mono text-xs text-red-300">
                            Int: {data.annual.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function MarketBlockLabel({ label }: { label: string }) {
    return (
        <div className="ticker-item px-2">
            <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold text-sky-400 uppercase tracking-wider font-mono">
                {label}
            </span>
        </div>
    )
}

function MarketTickerItem({ item }: { item: MarketItem }) {
    const delta = getDeltaDisplay(item.delta)

    return (
        <div className="ticker-item px-4 border-r border-white/5 h-8">
            <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm text-white">{item.symbol}</span>
                <span className="font-mono text-xs text-slate-300">
                    {formatMoney(item.price, item.isUsd)}
                </span>
                <span className={cn("font-mono text-[10px] bg-[#0B1121]/50 px-1.5 py-0.5 rounded", delta.className)}>
                    {delta.text}
                </span>
            </div>
        </div>
    )
}

// ============ Main Component ============
export function HeaderTicker({
    mode,
    fxRates,
    cedears,
    cryptos,
    fcis,
    inflation,
    paused = false,
}: HeaderTickerProps) {
    const {
        viewportRef,
        trackRef,
        scrollLeft,
        scrollRight,
        handleWheel,
        handleMouseEnter,
        handleMouseLeave,
    } = useTickerScroll({ externalPaused: paused })

    // Convert FX rates to FxItems
    const fxItems: FxItem[] = fxRates ? [
        { label: 'OFICIAL', buy: fxRates.oficial.buy ?? 0, sell: fxRates.oficial.sell ?? 0 },
        { label: 'BLUE', buy: fxRates.blue.buy ?? 0, sell: fxRates.blue.sell ?? 0 },
        { label: 'MEP', buy: fxRates.mep.buy ?? 0, sell: fxRates.mep.sell ?? 0 },
        { label: 'CCL', buy: fxRates.ccl.buy ?? 0, sell: fxRates.ccl.sell ?? 0 },
        { label: 'CRIPTO', buy: fxRates.cripto.buy ?? 0, sell: fxRates.cripto.sell ?? 0 },
    ] : []

    // Build ticker content - duplicated 4x for infinite loop
    const renderDolarContent = () => {
        const content = []
        for (let i = 0; i < 4; i++) {
            fxItems.forEach((item, idx) => (
                content.push(<FxTickerItem key={`fx-${i}-${idx}`} item={item} />)
            ))
            content.push(<InflationTickerItem key={`inf-${i}`} data={inflation} />)
            content.push(<div key={`space-${i}`} className="ticker-item w-12 h-full" />)
        }
        return content
    }

    const renderMercadoContent = () => {
        const content = []
        for (let i = 0; i < 4; i++) {
            content.push(<MarketBlockLabel key={`cedear-label-${i}`} label="CEDEARs" />)
            cedears.slice(0, 10).forEach((item, idx) => (
                content.push(<MarketTickerItem key={`ced-${i}-${idx}`} item={item} />)
            ))
            content.push(<MarketBlockLabel key={`crypto-label-${i}`} label="Cripto" />)
            cryptos.slice(0, 5).forEach((item, idx) => (
                content.push(<MarketTickerItem key={`cry-${i}-${idx}`} item={{ ...item, isUsd: true }} />)
            ))
            content.push(<MarketBlockLabel key={`fci-label-${i}`} label="FCI" />)
            fcis.slice(0, 10).forEach((item, idx) => (
                content.push(<MarketTickerItem key={`fci-${i}-${idx}`} item={item} />)
            ))
            content.push(<div key={`space-${i}`} className="ticker-item w-24 h-full" />)
        }
        return content
    }

    return (
        <div className="flex-1 max-w-5xl mx-2 md:mx-4 relative h-full flex items-center gap-2 overflow-hidden">
            {/* Left Arrow */}
            <button
                onClick={scrollLeft}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-full glass-button text-slate-400 hover:text-white shrink-0 z-10"
                aria-label="Anterior"
            >
                <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Viewport */}
            <div
                ref={viewportRef}
                className="flex-1 overflow-x-auto no-scrollbar relative h-full flex items-center cursor-grab active:cursor-grabbing mask-linear"
                onWheel={handleWheel}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Track */}
                <div
                    ref={trackRef}
                    className="flex items-center gap-0 whitespace-nowrap will-change-transform h-full pr-8"
                >
                    {mode === 'dolar' ? renderDolarContent() : renderMercadoContent()}
                </div>
            </div>

            {/* Right Arrow */}
            <button
                onClick={scrollRight}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-full glass-button text-slate-400 hover:text-white shrink-0 z-10"
                aria-label="Siguiente"
            >
                <ChevronRight className="w-4 h-4" />
            </button>
        </div>
    )
}
