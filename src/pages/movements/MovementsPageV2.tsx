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
import { DEFAULT_MOVEMENTS_FILTERS, type MovementsFilterState } from './components/movements-filter-state'
import {
    filterMovements,
    buildDisplayRows,
    paginateRows,
    MOVEMENTS_PAGE_SIZE,
} from './components/movements-view'
import { findOperationLegs } from '@/domain/operations/operation'
import type { Movement } from '@/domain/types'

export function MovementsPageV2() {
    const navigate = useNavigate()
    const location = useLocation()
    const { data: movements = [], isLoading } = useMovements()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const { data: fxRates } = useFxRates()

    // UI State
    const [filters, setFilters] = useState<MovementsFilterState>(DEFAULT_MOVEMENTS_FILTERS)
    const [visibleCount, setVisibleCount] = useState(MOVEMENTS_PAGE_SIZE)
    const [isWizardOpen, setIsWizardOpen] = useState(false)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null)
    const [editingMovement, setEditingMovement] = useState<Movement | null>(null)
    const deleteMovement = useDeleteMovement()

    // Handle incoming prefill/filters from navigation state
    useEffect(() => {
        const state = location.state as {
            prefillMovement?: Movement
            movementFilters?: Partial<MovementsFilterState>
        } | null
        if (state?.prefillMovement) {
            setEditingMovement(state.prefillMovement as Movement)
            setIsWizardOpen(true)
            navigate(location.pathname, { replace: true, state: {} })
        } else if (state?.movementFilters) {
            setFilters(prev => ({ ...prev, ...state.movementFilters }))
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.state, location.pathname, navigate])

    // Reset pagination when filters change
    useEffect(() => {
        setVisibleCount(MOVEMENTS_PAGE_SIZE)
    }, [filters])

    // Maps for lookup
    const instruments = useMemo(
        () => new Map(instrumentsList.map(i => [i.id, i])),
        [instrumentsList]
    )
    const accounts = useMemo(
        () => new Map(accountsList.map(a => [a.id, a])),
        [accountsList]
    )

    // Filter + group + paginate
    const filteredMovements = useMemo(
        () => filterMovements(movements, filters, instruments, accounts),
        [movements, filters, instruments, accounts]
    )
    const displayRows = useMemo(
        () => buildDisplayRows(filteredMovements),
        [filteredMovements]
    )
    const { visible: visibleRows, hasMore } = useMemo(
        () => paginateRows(displayRows, visibleCount),
        [displayRows, visibleCount]
    )

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
        const legs = findOperationLegs(movement, movements)
        if (legs.length > 1) {
            const ok = confirm(
                `⚠️ Este movimiento es una pata de una operación con ${legs.length} patas vinculadas ` +
                `(transferencia/swap). Editarlo individualmente puede desbalancear la operación.\n\n` +
                `¿Querés editarlo de todos modos?`
            )
            if (!ok) return
        }
        setIsDrawerOpen(false)
        setEditingMovement(movement)
        setIsWizardOpen(true)
    }

    const handleDelete = (id: string) => {
        const movement = movements.find(m => m.id === id)
        const legs = movement ? findOperationLegs(movement, movements) : []

        const message = legs.length > 1
            ? `⚠️ Este movimiento pertenece a una operación con ${legs.length} patas vinculadas ` +
            `(transferencia/swap). Borrar sólo esta pata deja la operación desbalanceada ` +
            `y puede alterar tenencias y costos.\n\n` +
            `¿Estás seguro de que querés eliminar SÓLO esta pata?`
            : '¿Estás seguro de que querés eliminar este movimiento?'

        if (confirm(message)) {
            deleteMovement.mutate(id)
            setIsDrawerOpen(false)
        }
    }

    const fxMep = fxRates?.mep?.sell ?? 1180

    // Operation legs for the drawer (grouped operation detail)
    const selectedLegs = useMemo(() => {
        if (!selectedMovement) return []
        return findOperationLegs(selectedMovement, movements)
    }, [selectedMovement, movements])

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
            <MovementsKpis movements={filteredMovements} fxMep={fxMep} />

            {/* Filters */}
            <MovementsFilters
                state={filters}
                onChange={setFilters}
                accounts={accountsList}
                instruments={instrumentsList}
            />

            {/* Results summary */}
            <div className="flex items-center justify-between -my-4">
                <p className="text-xs text-slate-500 font-mono">
                    {filteredMovements.length} movimiento{filteredMovements.length !== 1 ? 's' : ''}
                    {filteredMovements.length !== movements.length && ` (de ${movements.length})`}
                    {displayRows.length !== filteredMovements.length && ` · ${displayRows.length} operaciones`}
                </p>
            </div>

            {/* Table */}
            <div className="glass-panel rounded-xl overflow-hidden border border-white/10 shadow-xl">
                <MovementsTable
                    rows={visibleRows}
                    instruments={instruments}
                    accounts={accounts}
                    isLoading={isLoading}
                    onRowClick={handleRowClick}
                    onNewClick={() => setIsWizardOpen(true)}
                    totalUnfiltered={movements.length}
                />
                {hasMore && (
                    <div className="p-4 border-t border-white/5 text-center">
                        <button
                            onClick={() => setVisibleCount(c => c + MOVEMENTS_PAGE_SIZE)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-lg text-sm font-medium transition"
                        >
                            Cargar más ({displayRows.length - visibleRows.length} restantes)
                        </button>
                    </div>
                )}
            </div>

            {/* Drawer */}
            <MovementDetailsDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                movement={selectedMovement}
                instrument={selectedMovement?.instrumentId ? instruments.get(selectedMovement.instrumentId) : null}
                account={selectedMovement ? accounts.get(selectedMovement.accountId) : undefined}
                operationLegs={selectedLegs}
                instrumentsMap={instruments}
                accountsMap={accounts}
                onDuplicate={handleDuplicate}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onSelectLeg={(leg) => setSelectedMovement(leg)}
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
