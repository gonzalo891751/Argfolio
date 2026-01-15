import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumberAR, formatPercent } from '@/lib/format'
import { useMarketTape } from '@/hooks/use-market-tape'
import { useCryptoPrices } from '@/hooks/use-crypto-prices'
import { Skeleton } from '@/components/ui/skeleton'

export function TickerTape() {
    const { data: tickers, isLoading } = useMarketTape()
    // Fetch common crypto for tape even if not held, or just show BTC/ETH/SOL ?
    // For now, let's just show BTC/ETH/SOL hardcoded to verify live data
    const { data: cryptoPrices } = useCryptoPrices(['BTC', 'ETH', 'SOL', 'ADA'])

    if (isLoading) {
        return (
            <div className="h-10 border-t bg-muted/30 flex items-center px-4">
                <Skeleton className="h-6 w-full" />
            </div>
        )
    }

    if (!tickers?.length) return null

    // Mix real crypto into the tape
    // This is visual only
    const realCryptoTickers = cryptoPrices ? Object.entries(cryptoPrices).map(([sym, price]) => ({
        symbol: sym,
        price,
        currency: 'USD',
        changePercent: 0, // We don't have 24h change from simple/price yet, just show price
        change: 0
    })) : []

    // Merge: Replace mock crypto in 'tickers' with real ones if available, or append
    // Filter out mock crypto from 'tickers' first if we have real
    const stockTickers = tickers.filter(t => t.category !== 'crypto')
    const finalTickers = [...stockTickers, ...realCryptoTickers]

    const items = [...finalTickers, ...finalTickers]

    return (
        <div className="h-10 border-t bg-muted/30 overflow-hidden">
            <div className="flex items-center h-full animate-ticker-scroll">
                {items.map((ticker, index) => (
                    <div
                        key={`${ticker.symbol}-${index}`}
                        className="flex items-center gap-2 px-4 shrink-0 h-full border-r border-border/50"
                    >
                        <span className="font-semibold text-sm">{ticker.symbol}</span>
                        <span className="font-mono text-sm text-muted-foreground">
                            {ticker.currency === 'USD' ? 'US$' : '$'}
                            {formatNumberAR(ticker.price, ticker.price < 10 ? 2 : 0, 2)}
                        </span>
                        <span
                            className={cn(
                                'flex items-center gap-0.5 text-xs font-medium',
                                ticker.changePercent > 0 ? 'text-success' : ticker.changePercent < 0 ? 'text-destructive' : 'text-muted-foreground'
                            )}
                        >
                            {ticker.changePercent > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                            ) : ticker.changePercent < 0 ? (
                                <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {formatPercent(ticker.changePercent / 100)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}
