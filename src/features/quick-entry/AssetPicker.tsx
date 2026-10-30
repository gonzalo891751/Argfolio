import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputClass } from './fields'

export interface AssetChoice {
    symbol: string
    name: string
    category: 'CRYPTO' | 'STABLE' | 'CEDEAR'
    coingeckoId?: string
    /** Shown on the right, e.g. "Tenés 0,035" */
    hint?: string
}

const POPULAR_CRYPTO: AssetChoice[] = [
    { symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', coingeckoId: 'bitcoin' },
    { symbol: 'ETH', name: 'Ethereum', category: 'CRYPTO', coingeckoId: 'ethereum' },
    { symbol: 'USDT', name: 'Tether', category: 'STABLE', coingeckoId: 'tether' },
    { symbol: 'USDC', name: 'USD Coin', category: 'STABLE', coingeckoId: 'usd-coin' },
    { symbol: 'SOL', name: 'Solana', category: 'CRYPTO', coingeckoId: 'solana' },
    { symbol: 'BNB', name: 'BNB', category: 'CRYPTO', coingeckoId: 'binancecoin' },
]

const STABLES = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])

function normalize(s: string) {
    return s.trim().toLowerCase()
}

/** Remote crypto search (CoinGecko), debounced; falls back to the local list. */
function useCryptoSearch(query: string, enabled: boolean): AssetChoice[] {
    const [results, setResults] = useState<AssetChoice[]>([])
    const cache = useRef(new Map<string, AssetChoice[]>())

    useEffect(() => {
        const q = normalize(query)
        if (!enabled || q.length < 2) {
            setResults([])
            return
        }
        const cached = cache.current.get(q)
        if (cached) {
            setResults(cached)
            return
        }
        const controller = new AbortController()
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { signal: controller.signal })
                if (!res.ok) throw new Error(String(res.status))
                const data = await res.json() as { coins?: Array<{ id: string; symbol: string; name: string }> }
                const coins = (data.coins ?? []).slice(0, 12).map(c => ({
                    symbol: c.symbol.toUpperCase(),
                    name: c.name,
                    category: STABLES.has(c.symbol.toUpperCase()) ? 'STABLE' as const : 'CRYPTO' as const,
                    coingeckoId: c.id,
                }))
                cache.current.set(q, coins)
                setResults(coins)
            } catch {
                setResults([])
            }
        }, 300)
        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [query, enabled])

    return results
}

export function AssetPicker({
    assetClass,
    value,
    onChange,
    owned,
    catalog,
}: {
    assetClass: 'crypto' | 'cedear'
    value: AssetChoice | null
    onChange: (asset: AssetChoice | null) => void
    /** The user's holdings first */
    owned: AssetChoice[]
    /** Static catalog (CEDEAR master list) */
    catalog?: AssetChoice[]
}) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const remote = useCryptoSearch(query, assetClass === 'crypto' && open)

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [])

    const options = useMemo(() => {
        const q = normalize(query)
        const matches = (a: AssetChoice) => !q || normalize(a.symbol).includes(q) || normalize(a.name).includes(q)
        const base = assetClass === 'crypto' ? POPULAR_CRYPTO : (catalog ?? [])
        const merged: AssetChoice[] = []
        const seen = new Set<string>()
        for (const a of [...owned.filter(matches), ...base.filter(matches), ...remote]) {
            if (seen.has(a.symbol)) continue
            seen.add(a.symbol)
            merged.push(a)
        }
        // Exact ticker first
        merged.sort((a, b) => Number(normalize(b.symbol) === q) - Number(normalize(a.symbol) === q))
        return merged.slice(0, 10)
    }, [query, owned, catalog, remote, assetClass])

    if (value) {
        return (
            <div className="flex h-11 items-center justify-between rounded-lg border border-input bg-background px-3">
                <div className="min-w-0">
                    <span className="font-semibold">{value.symbol}</span>
                    <span className="ml-2 truncate text-sm text-muted-foreground">{value.name}</span>
                </div>
                <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => { onChange(null); setQuery(''); setOpen(true) }} aria-label="Cambiar activo">
                    <X className="h-4 w-4" />
                </button>
            </div>
        )
    }

    return (
        <div ref={containerRef} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                className={cn(inputClass, 'pl-9')}
                placeholder={assetClass === 'crypto' ? 'BTC, ETH, USDT…' : 'AAPL, MELI, SPY…'}
                value={query}
                onFocus={() => setOpen(true)}
                onChange={e => { setQuery(e.target.value); setOpen(true) }}
                aria-label="Buscar activo"
            />
            {open && options.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
                    {options.map(opt => (
                        <li key={opt.symbol}>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted"
                                onClick={() => { onChange(opt); setOpen(false); setQuery('') }}
                            >
                                <span className="min-w-0">
                                    <span className="font-medium">{opt.symbol}</span>
                                    <span className="ml-2 truncate text-sm text-muted-foreground">{opt.name}</span>
                                </span>
                                {opt.hint && <span className="shrink-0 text-xs text-muted-foreground">{opt.hint}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
