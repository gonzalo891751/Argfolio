import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AssetOption {
    id?: string
    ticker: string
    name: string
    category: string
}

interface AssetTypeaheadProps {
    value: AssetOption | null
    onChange: (asset: AssetOption | null) => void
    options: AssetOption[]
    placeholder?: string
    className?: string
}

export function AssetTypeahead({
    value,
    onChange,
    options,
    placeholder = 'Ej: AAPL, BTC, o nombre...',
    className,
}: AssetTypeaheadProps) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const filtered = search.length > 0
        ? options.filter(
            o =>
                o.ticker.toLowerCase().includes(search.toLowerCase()) ||
                o.name.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 100) // Increased limit for better UX
        : []

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

    const handleSelect = (asset: AssetOption) => {
        onChange(asset)
        setSearch('')
        setIsOpen(false)
    }

    const handleClear = () => {
        onChange(null)
        setSearch('')
    }

    const getCategoryColor = (cat: string) => {
        if (cat === 'CEDEAR') return 'bg-indigo-500/20 text-indigo-300'
        if (cat === 'CRYPTO' || cat === 'STABLE') return 'bg-emerald-500/20 text-emerald-300'
        if (cat === 'FCI') return 'bg-blue-500/20 text-blue-300'
        return 'bg-slate-500/20 text-slate-300'
    }

    // If value selected, show badge
    if (value) {
        return (
            <div className={cn('mt-3', className)}>
                <div className="inline-flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs">
                        {value.ticker.substring(0, 1)}
                    </div>
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
                    <Search className="h-5 w-5 text-slate-500" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value)
                        setIsOpen(e.target.value.length > 0)
                    }}
                    onFocus={() => search.length > 0 && setIsOpen(true)}
                    placeholder={placeholder}
                    className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500"
                    autoComplete="off"
                />
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-[#1E293B] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-auto">
                    <ul className="py-1 text-sm text-slate-300">
                        {filtered.length === 0 ? (
                            <li className="px-4 py-2 text-slate-500 italic">No se encontraron activos</li>
                        ) : (
                            filtered.map(asset => (
                                <li
                                    key={asset.id || asset.ticker}
                                    onClick={() => handleSelect(asset)}
                                    className="px-4 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition"
                                >
                                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                                        {asset.ticker.substring(0, 2)}
                                    </div>
                                    <div>
                                        <div className="text-white font-mono text-xs font-bold">{asset.ticker}</div>
                                        <div className="text-slate-500 text-[10px]">{asset.name}</div>
                                    </div>
                                    <span
                                        className={cn(
                                            'ml-auto text-[10px] px-2 py-0.5 rounded border border-white/10',
                                            getCategoryColor(asset.category)
                                        )}
                                    >
                                        {asset.category}
                                    </span>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}

// Mock asset list for initial use
export const MOCK_ASSETS: AssetOption[] = [
    { id: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', category: 'CEDEAR' },
    { id: 'MSFT', ticker: 'MSFT', name: 'Microsoft', category: 'CEDEAR' },
    { id: 'GOOGL', ticker: 'GOOGL', name: 'Alphabet (Google)', category: 'CEDEAR' },
    { id: 'AMZN', ticker: 'AMZN', name: 'Amazon.com', category: 'CEDEAR' },
    { id: 'NVDA', ticker: 'NVDA', name: 'NVIDIA', category: 'CEDEAR' },
    { id: 'META', ticker: 'META', name: 'Meta Platforms', category: 'CEDEAR' },
    { id: 'TSLA', ticker: 'TSLA', name: 'Tesla', category: 'CEDEAR' },
    { id: 'KO', ticker: 'KO', name: 'Coca-Cola', category: 'CEDEAR' },
    { id: 'GGAL', ticker: 'GGAL', name: 'Grupo Fin. Galicia', category: 'CEDEAR' },
    { id: 'YPF', ticker: 'YPF', name: 'YPF S.A.', category: 'CEDEAR' },
    { id: 'BTC', ticker: 'BTC', name: 'Bitcoin', category: 'CRYPTO' },
    { id: 'ETH', ticker: 'ETH', name: 'Ethereum', category: 'CRYPTO' },
    { id: 'SOL', ticker: 'SOL', name: 'Solana', category: 'CRYPTO' },
    { id: 'USDT', ticker: 'USDT', name: 'Tether', category: 'STABLE' },
    { id: 'USDC', ticker: 'USDC', name: 'USD Coin', category: 'STABLE' },
    { id: 'DAI', ticker: 'DAI', name: 'Dai', category: 'STABLE' },
    { id: 'FIMA', ticker: 'FIMA', name: 'Fima Premium', category: 'FCI' },
    { id: 'BULL', ticker: 'BULL', name: 'Bull Market FCI', category: 'FCI' },
]
