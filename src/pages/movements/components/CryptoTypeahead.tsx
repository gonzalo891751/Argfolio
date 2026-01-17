
import { useState, useRef, useEffect } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CryptoOption {
    id?: string
    coingeckoId: string
    ticker: string
    name: string
    category: 'CRYPTO' | 'STABLE'
    thumb?: string
}

interface CryptoTypeaheadProps {
    value: CryptoOption | null
    onChange: (asset: CryptoOption | null) => void
    placeholder?: string
    className?: string
}

// Fallback top list to show when empty or API fails
const FALLBACK_CRYPTO: CryptoOption[] = [
    { coingeckoId: 'bitcoin', ticker: 'BTC', name: 'Bitcoin', category: 'CRYPTO' },
    { coingeckoId: 'ethereum', ticker: 'ETH', name: 'Ethereum', category: 'CRYPTO' },
    { coingeckoId: 'binancecoin', ticker: 'BNB', name: 'BNB', category: 'CRYPTO' },
    { coingeckoId: 'solana', ticker: 'SOL', name: 'Solana', category: 'CRYPTO' },
    { coingeckoId: 'tether', ticker: 'USDT', name: 'Tether', category: 'STABLE' },
    { coingeckoId: 'usd-coin', ticker: 'USDC', name: 'USD Coin', category: 'STABLE' },
]

export function CryptoTypeahead({
    value,
    onChange,
    placeholder = 'Buscar cripto (ej: BTC, BNB)...',
    className,
}: CryptoTypeaheadProps) {
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<CryptoOption[]>([])
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const debounceRef = useRef<NodeJS.Timeout>()

    // Local cache to avoid repeat hits
    const cache = useRef<Map<string, CryptoOption[]>>(new Map())

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Debounced search
    useEffect(() => {
        if (!search || search.length < 2) {
            setResults([])
            setLoading(false)
            return
        }

        if (debounceRef.current) clearTimeout(debounceRef.current)

        debounceRef.current = setTimeout(async () => {
            const query = search.toLowerCase()

            // 1. Check Cache
            if (cache.current.has(query)) {
                setResults(cache.current.get(query)!)
                return
            }

            // 2. Local Fallback Priority for basic queries
            // If they type "bnb", we want to ensure BNB shows up first even if API rate limits
            const localMatches = FALLBACK_CRYPTO.filter(c =>
                c.ticker.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)
            )

            setLoading(true)
            try {
                const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
                if (!res.ok) throw new Error('API Error')

                const data = await res.json()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const apiCoins = (data.coins || []).map((c: any) => ({
                    coingeckoId: c.id,
                    ticker: c.symbol.toUpperCase(),
                    name: c.name,
                    category: c.symbol.toUpperCase() === 'USDT' || c.symbol.toUpperCase() === 'USDC' || c.symbol.toUpperCase() === 'DAI' ? 'STABLE' : 'CRYPTO',
                    thumb: c.thumb
                })) as CryptoOption[]

                // Merge: Local fallback first if exact match, otherwise API
                // Currently just unique by ticker
                const combined = [...localMatches, ...apiCoins].filter((v, i, a) => a.findIndex(t => t.ticker === v.ticker) === i).slice(0, 20)

                cache.current.set(query, combined)
                setResults(combined)
            } catch (err) {
                console.warn('CoinGecko search failed, using fallback', err)
                setResults(localMatches.length > 0 ? localMatches : [])
            } finally {
                setLoading(false)
            }
        }, 350)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [search])

    const handleSelect = (asset: CryptoOption) => {
        onChange(asset)
        setSearch('')
        setIsOpen(false)
    }

    const handleClear = () => {
        onChange(null)
        setSearch('')
    }

    if (value) {
        return (
            <div className={cn('mt-3', className)}>
                <div className="inline-flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    {value.thumb ? (
                        <img src={value.thumb} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
                            {value.ticker.substring(0, 1)}
                        </div>
                    )}
                    <div>
                        <div className="text-white font-mono text-xs font-bold">{value.ticker}</div>
                        <div className="text-[10px] text-slate-400">{value.name}</div>
                    </div>
                    <button
                        onClick={handleClear}
                        className="ml-2 text-slate-500 hover:text-white transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {loading ? <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" /> : <Search className="h-5 w-5 text-slate-500" />}
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value)
                        setIsOpen(true)
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500"
                    autoComplete="off"
                />
            </div>

            {/* Dropdown */}
            {isOpen && search.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-[#1E293B] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-auto">
                    <ul className="py-1 text-sm text-slate-300">
                        {loading && results.length === 0 ? (
                            <li className="px-4 py-2 text-slate-500">Buscando...</li>
                        ) : results.length === 0 ? (
                            <li className="px-4 py-2 text-slate-500 italic">No se encontraron activos</li>
                        ) : (
                            results.map(asset => (
                                <li
                                    key={asset.coingeckoId}
                                    onClick={() => handleSelect(asset)}
                                    className="px-4 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition"
                                >
                                    {asset.thumb ? (
                                        <img src={asset.thumb} alt="" className="w-6 h-6 rounded-full" />
                                    ) : (
                                        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                                            {asset.ticker.substring(0, 2)}
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-mono text-xs font-bold">{asset.ticker}</span>
                                            {asset.category === 'STABLE' && (
                                                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">STABLE</span>
                                            )}
                                        </div>
                                        <div className="text-slate-500 text-[10px]">{asset.name}</div>
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}
