import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import { useMovements, useDeleteMovement } from '@/hooks/use-movements'
import { useInstruments, useAccounts } from '@/hooks/use-instruments'
import { useFxRates } from '@/hooks/use-fx-rates'
import {
    MovementsKpis,
    MovementsFilters,
    MovementsTable,
    MovementDetailsDrawer,
    MovementWizard,
} from './components'
import type { Movement } from '@/domain/types'

type FilterType = 'all' | 'buy' | 'sell' | 'pf'

export function MovementsPageV2() {
    const navigate = useNavigate()
    const location = useLocation()
    const { data: movements = [], isLoading } = useMovements()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const { data: fxRates } = useFxRates()

    // UI State
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<FilterType>('all')
    const [isWizardOpen, setIsWizardOpen] = useState(false)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null)
    const [editingMovement, setEditingMovement] = useState<Movement | null>(null)
    const deleteMovement = useDeleteMovement()

    // Handle incoming prefill from navigation state (e.g. from crypto detail sell button)
    useEffect(() => {
        const state = location.state as { prefillMovement?: Movement } | null
        if (state?.prefillMovement) {
            setEditingMovement(state.prefillMovement as Movement)
            setIsWizardOpen(true)
            // Clear the state to avoid re-opening on back navigation
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.state, location.pathname, navigate])

    // Maps for lookup
    const instruments = useMemo(
        () => new Map(instrumentsList.map(i => [i.id, i])),
        [instrumentsList]
    )
    const accounts = useMemo(
        () => new Map(accountsList.map(a => [a.id, a])),
        [accountsList]
    )

    // Filter movements
    const filteredMovements = useMemo(() => {
        return movements
            .filter(m => {
                // Type filter
                if (filter === 'buy' && m.type !== 'BUY') return false
                if (filter === 'sell' && m.type !== 'SELL') return false

                // Search filter
                if (search) {
                    const instrument = m.instrumentId ? instruments.get(m.instrumentId) : null
                    const account = accounts.get(m.accountId)
                    const searchLower = search.toLowerCase()
                    const matchSymbol = instrument?.symbol.toLowerCase().includes(searchLower)
                    const matchName = instrument?.name.toLowerCase().includes(searchLower)
                    const matchAccount = account?.name.toLowerCase().includes(searchLower)
                    if (!matchSymbol && !matchName && !matchAccount) return false
                }

                return true
            })
            .sort((a, b) => new Date(b.datetimeISO).getTime() - new Date(a.datetimeISO).getTime())
    }, [movements, filter, search, instruments, accounts])

    // Handlers
    const handleRowClick = (movement: Movement) => {
        setSelectedMovement(movement)
        setIsDrawerOpen(true)
    }

    const handleDuplicate = (movement: Movement) => {
        setIsDrawerOpen(false)
        setEditingMovement({ ...movement, id: '' })
        setIsWizardOpen(true)
    }

    const handleEdit = (movement: Movement) => {
        setIsDrawerOpen(false)
        setEditingMovement(movement)
        setIsWizardOpen(true)
    }

    const handleDelete = (id: string) => {
        if (confirm('¿Estás seguro de que querés eliminar este movimiento?')) {
            deleteMovement.mutate(id)
            setIsDrawerOpen(false)
        }
    }

    const fxMep = fxRates?.mep?.sell ?? 1180

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl md:text-4xl font-bold text-white mb-2">
                        Movimientos
                    </h1>
                    <p className="text-slate-400 text-sm">
                        Gestioná tus operaciones históricas.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/import')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg text-sm font-medium transition flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Importar</span>
                    </button>
                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg rounded-lg text-sm font-medium transition flex items-center gap-2 group"
                    >
                        <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        Nuevo movimiento
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <MovementsKpis movements={movements} fxMep={fxMep} />

            {/* Filters */}
            <MovementsFilters
                search={search}
                onSearchChange={setSearch}
                filter={filter}
                onFilterChange={setFilter}
            />

            {/* Table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-white/10 shadow-xl">
                <MovementsTable
                    movements={filteredMovements}
                    instruments={instruments}
                    accounts={accounts}
                    isLoading={isLoading}
                    onRowClick={handleRowClick}
                    onNewClick={() => setIsWizardOpen(true)}
                />
            </div>

            {/* Drawer */}
            <MovementDetailsDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                movement={selectedMovement}
                instrument={selectedMovement?.instrumentId ? instruments.get(selectedMovement.instrumentId) : null}
                account={selectedMovement ? accounts.get(selectedMovement.accountId) : undefined}
                onDuplicate={handleDuplicate}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />

            {/* Wizard */}
            <MovementWizard
                open={isWizardOpen}
                onOpenChange={(open: boolean) => {
                    setIsWizardOpen(open)
                    if (!open) setEditingMovement(null)
                }}
                prefillMovement={editingMovement}
            />
        </div>
    )
}
