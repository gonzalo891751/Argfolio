import { Search, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'buy' | 'sell' | 'pf'

interface MovementsFiltersProps {
    search: string
    onSearchChange: (value: string) => void
    filter: FilterType
    onFilterChange: (value: FilterType) => void
}

export function MovementsFilters({
    search,
    onSearchChange,
    filter,
    onFilterChange,
}: MovementsFiltersProps) {
    const filters: { value: FilterType; label: string }[] = [
        { value: 'all', label: 'Todos' },
        { value: 'buy', label: 'Compra' },
        { value: 'sell', label: 'Venta' },
        { value: 'pf', label: 'PF' },
    ]

    return (
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-[#151E32]/50 p-1 rounded-xl border border-white/5">
            {/* Search */}
            <div className="relative w-full lg:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border-none rounded-lg leading-5 bg-transparent text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-0 sm:text-sm transition-colors"
                    placeholder="Buscar por ticker, nombre o cuenta..."
                />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 px-2 lg:px-0">
                {filters.map(f => (
                    <button
                        key={f.value}
                        onClick={() => onFilterChange(f.value)}
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap',
                            filter === f.value
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border-white/5'
                        )}
                    >
                        {f.label}
                    </button>
                ))}

                <div className="w-px h-4 bg-white/10 mx-1" />

                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs font-medium whitespace-nowrap">
                    <Calendar className="w-3 h-3" />
                    Últimos 30 días
                </button>
            </div>
        </div>
    )
}
