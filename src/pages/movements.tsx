import { useState, useMemo, useEffect } from 'react'
import { Plus, Upload } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MovementTable, MovementFilters, MovementModal } from '@/components/movements'
import { useMovements, useDeleteMovement } from '@/hooks/use-movements'
import { useInstruments, useAccounts } from '@/hooks/use-instruments'
import type { Movement } from '@/domain/types'

export function MovementsPage() {
    const navigate = useNavigate()
    const { data: movements = [], isLoading } = useMovements()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const deleteMovement = useDeleteMovement()

    const [searchParams, setSearchParams] = useSearchParams()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingMovement, setEditingMovement] = useState<Movement | undefined>()

    // Check for 'new=1' query param to auto-open modal
    useEffect(() => {
        if (searchParams.get('new') === '1') {
            setIsModalOpen(true)
            // Remove the param so it doesn't reopen on refresh
            const newParams = new URLSearchParams(searchParams)
            newParams.delete('new')
            setSearchParams(newParams, { replace: true })
        }
    }, [searchParams, setSearchParams])

    // Filters
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [accountFilter, setAccountFilter] = useState('')

    // Create maps for lookup
    const instruments = useMemo(
        () => new Map(instrumentsList.map((i) => [i.id, i])),
        [instrumentsList]
    )
    const accounts = useMemo(
        () => new Map(accountsList.map((a) => [a.id, a])),
        [accountsList]
    )

    // Filter movements
    const filteredMovements = useMemo(() => {
        return movements.filter((mov) => {
            // Type filter
            if (typeFilter) {
                if (typeFilter === 'pf') {
                    // Check logic for PF
                    if (mov.assetClass !== 'pf' && (!mov.instrumentId || instruments.get(mov.instrumentId)?.category !== 'PF')) {
                        return false
                    }
                } else if (mov.type !== typeFilter) {
                    return false
                }
            }

            // Account filter
            if (accountFilter && mov.accountId !== accountFilter) return false

            // Category filter
            if (categoryFilter && mov.instrumentId) {
                const instrument = instruments.get(mov.instrumentId)
                if (instrument && instrument.category !== categoryFilter) return false
            }

            // Search filter
            if (search) {
                const instrument = mov.instrumentId ? instruments.get(mov.instrumentId) : null
                const searchLower = search.toLowerCase()
                const matchSymbol = instrument?.symbol.toLowerCase().includes(searchLower)
                const matchName = instrument?.name.toLowerCase().includes(searchLower)
                if (!matchSymbol && !matchName) return false
            }

            return true
        })
    }, [movements, typeFilter, accountFilter, categoryFilter, search, instruments])

    const accountOptions = accountsList.map((a) => ({
        value: a.id,
        label: a.name,
    }))

    const handleEdit = (movement: Movement) => {
        setEditingMovement(movement)
        setIsModalOpen(true)
    }

    const handleDelete = async (id: string) => {
        await deleteMovement.mutateAsync(id)
    }

    const handleModalClose = (open: boolean) => {
        setIsModalOpen(open)
        if (!open) {
            setEditingMovement(undefined)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Movimientos</h1>
                    <p className="text-muted-foreground">
                        {movements.length} movimientos registrados
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate('/import')}>
                        <Upload className="h-4 w-4 mr-2" />
                        Importar
                    </Button>
                    <Button variant="gradient" onClick={() => setIsModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo Movimiento
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <MovementFilters
                search={search}
                onSearchChange={setSearch}
                type={typeFilter}
                onTypeChange={setTypeFilter}
                category={categoryFilter}
                onCategoryChange={setCategoryFilter}
                accountId={accountFilter}
                onAccountChange={setAccountFilter}
                accounts={accountOptions}
            />

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <MovementTable
                        movements={filteredMovements}
                        instruments={instruments}
                        accounts={accounts}
                        isLoading={isLoading}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                    />
                </CardContent>
            </Card>

            {/* Modal */}
            <MovementModal
                open={isModalOpen}
                onOpenChange={handleModalClose}
                movement={editingMovement}
            />
        </div>
    )
}
