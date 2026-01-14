import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { MovementType, AssetCategory } from '@/domain/types'

const typeOptions: { value: MovementType | ''; label: string }[] = [
    { value: '', label: 'Todos los tipos' },
    { value: 'BUY', label: 'Compra' },
    { value: 'SELL', label: 'Venta' },
    { value: 'DEPOSIT', label: 'Depósito' },
    { value: 'WITHDRAW', label: 'Retiro' },
    { value: 'DIVIDEND', label: 'Dividendo' },
    { value: 'INTEREST', label: 'Interés' },
    { value: 'FEE', label: 'Comisión' },
]

const categoryOptions: { value: AssetCategory | ''; label: string }[] = [
    { value: '', label: 'Todas las categorías' },
    { value: 'CRYPTO', label: 'Cripto' },
    { value: 'CEDEAR', label: 'Cedears' },
    { value: 'STABLE', label: 'Stablecoins' },
    { value: 'FCI', label: 'FCI' },
]

interface MovementFiltersProps {
    search: string
    onSearchChange: (value: string) => void
    type: string
    onTypeChange: (value: string) => void
    category: string
    onCategoryChange: (value: string) => void
    accountId: string
    onAccountChange: (value: string) => void
    accounts: { value: string; label: string }[]
}

export function MovementFilters({
    search,
    onSearchChange,
    type,
    onTypeChange,
    category,
    onCategoryChange,
    accountId,
    onAccountChange,
    accounts,
}: MovementFiltersProps) {
    const accountOptions = [{ value: '', label: 'Todas las cuentas' }, ...accounts]

    return (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por símbolo..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Type filter */}
            <Select
                options={typeOptions}
                value={type}
                onChange={(e) => onTypeChange(e.target.value)}
                className="w-40"
            />

            {/* Category filter */}
            <Select
                options={categoryOptions}
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-44"
            />

            {/* Account filter */}
            <Select
                options={accountOptions}
                value={accountId}
                onChange={(e) => onAccountChange(e.target.value)}
                className="w-44"
            />
        </div>
    )
}
