import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Account, Instrument } from '@/domain/types'
import type { MovementsFilterState, TypeFilter, DatePreset, StatusFilter } from './movements-filter-state'
import { DEFAULT_MOVEMENTS_FILTERS } from './movements-filter-state'

interface MovementsFiltersProps {
    state: MovementsFilterState
    onChange: (state: MovementsFilterState) => void
    accounts: Account[]
    instruments: Instrument[]
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'buy', label: 'Compra' },
    { value: 'sell', label: 'Venta' },
    { value: 'transfer', label: 'Transferencia' },
    { value: 'swap', label: 'Swap' },
    { value: 'deposit', label: 'Depósito' },
    { value: 'withdraw', label: 'Retiro' },
    { value: 'interest', label: 'Interés' },
    { value: 'pf', label: 'PF' },
]

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
    { value: '30d', label: 'Últimos 30 días' },
    { value: '90d', label: '90 días' },
    { value: 'ytd', label: 'Este año' },
    { value: 'all', label: 'Todo' },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'active', label: 'Activos' },
    { value: 'superseded', label: 'Reemplazados' },
    { value: 'voided', label: 'Anulados' },
    { value: 'all', label: 'Todos los estados' },
]

export function MovementsFilters({ state, onChange, accounts, instruments }: MovementsFiltersProps) {
    const set = (partial: Partial<MovementsFilterState>) => onChange({ ...state, ...partial })

    const hasActiveFilters = state.search !== ''
        || state.type !== 'all'
        || state.accountId !== 'all'
        || state.assetKey !== 'all'
        || state.datePreset !== '30d'
        || state.status !== 'active'

    return (
        <div className="space-y-3 bg-[#151E32]/50 p-3 rounded-xl border border-white/5">
            {/* Row 1: Search + selects */}
            <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                    </div>
                    <input
                        type="text"
                        value={state.search}
                        onChange={e => set({ search: e.target.value })}
                        className="block w-full pl-10 pr-3 py-2 rounded-lg leading-5 bg-white/5 border border-white/10 text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 sm:text-sm transition-colors"
                        placeholder="Buscar por ticker, nombre, cuenta o nota..."
                    />
                </div>

                <select
                    value={state.accountId}
                    onChange={e => set({ accountId: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 [&>option]:bg-slate-900"
                >
                    <option value="all">Todas las cuentas</option>
                    {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>

                <select
                    value={state.assetKey}
                    onChange={e => set({ assetKey: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 [&>option]:bg-slate-900"
                >
                    <option value="all">Todos los activos</option>
                    {instruments.map(i => (
                        <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>
                    ))}
                </select>

                <select
                    value={state.status}
                    onChange={e => set({ status: e.target.value as StatusFilter })}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 [&>option]:bg-slate-900"
                    aria-label="Estado contable"
                >
                    {STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            {/* Row 2: Type chips + date presets */}
            <div className="flex flex-wrap items-center gap-2">
                {TYPE_OPTIONS.map(t => (
                    <button
                        key={t.value}
                        onClick={() => set({ type: t.value })}
                        className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap',
                            state.type === t.value
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border-white/5'
                        )}
                    >
                        {t.label}
                    </button>
                ))}

                <div className="w-px h-4 bg-white/10 mx-1" />

                {DATE_PRESETS.map(d => (
                    <button
                        key={d.value}
                        onClick={() => set({ datePreset: d.value })}
                        className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium border transition whitespace-nowrap',
                            state.datePreset === d.value
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border-white/5'
                        )}
                    >
                        {d.label}
                    </button>
                ))}

                {/* Custom date range */}
                <div className="flex items-center gap-1.5">
                    <input
                        type="date"
                        value={state.dateFrom}
                        onChange={e => set({ dateFrom: e.target.value, datePreset: 'custom' })}
                        className={cn(
                            'px-2 py-1 rounded-lg bg-white/5 border text-xs text-slate-400 focus:outline-none [color-scheme:dark]',
                            state.datePreset === 'custom' ? 'border-sky-500/30' : 'border-white/5'
                        )}
                        title="Desde"
                    />
                    <span className="text-slate-600 text-xs">→</span>
                    <input
                        type="date"
                        value={state.dateTo}
                        onChange={e => set({ dateTo: e.target.value, datePreset: 'custom' })}
                        className={cn(
                            'px-2 py-1 rounded-lg bg-white/5 border text-xs text-slate-400 focus:outline-none [color-scheme:dark]',
                            state.datePreset === 'custom' ? 'border-sky-500/30' : 'border-white/5'
                        )}
                        title="Hasta"
                    />
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={() => onChange(DEFAULT_MOVEMENTS_FILTERS)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 transition"
                        title="Limpiar filtros"
                    >
                        <X className="w-3 h-3" />
                        Limpiar
                    </button>
                )}
            </div>
        </div>
    )
}
