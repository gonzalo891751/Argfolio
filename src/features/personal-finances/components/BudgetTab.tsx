// =============================================================================
// BUDGET TAB — Display budget categories with progress bars
// =============================================================================

import { PieChart, Plus, Trash2, MoreVertical } from 'lucide-react'
import { formatARS } from '../models/calculations'
import type { BudgetCategory } from '../models/types'

interface BudgetTabProps {
    items: BudgetCategory[]
    onAdd: () => void
    onDelete: (id: string) => void
    onEdit: (item: BudgetCategory) => void
}

export function BudgetTab({ items, onAdd, onDelete, onEdit }: BudgetTabProps) {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                    <PieChart size={32} />
                </div>
                <h3 className="text-foreground font-medium mb-2">
                    Sin presupuestos definidos
                </h3>
                <p className="text-muted-foreground text-sm max-w-xs mb-6">
                    Creá categorías de gasto variable (supermercado, nafta, salidas) para
                    estimar cuánto necesitás cada mes.
                </p>
                <button
                    onClick={onAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium text-sm transition"
                >
                    <Plus size={16} /> Agregar Presupuesto
                </button>
            </div>
        )
    }

    const totalEstimated = items.reduce((acc, i) => acc + i.estimatedAmount, 0)
    const totalSpent = items.reduce((acc, i) => acc + i.spentAmount, 0)

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                <div>
                    <div className="text-xs text-muted-foreground uppercase font-mono mb-1">
                        Presupuestado
                    </div>
                    <div className="text-lg font-mono text-foreground">
                        {formatARS(totalEstimated)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground uppercase font-mono mb-1">
                        Gastado
                    </div>
                    <div className="text-lg font-mono text-foreground">
                        {formatARS(totalSpent)}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-muted-foreground uppercase font-mono mb-1">
                        Disponible
                    </div>
                    <div className={`text-lg font-mono ${totalEstimated - totalSpent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatARS(totalEstimated - totalSpent)}
                    </div>
                </div>
            </div>

            {/* Categories */}
            <div className="space-y-4">
                {items.map((item) => {
                    const pct = item.estimatedAmount > 0
                        ? (item.spentAmount / item.estimatedAmount) * 100
                        : 0
                    const remaining = item.estimatedAmount - item.spentAmount

                    return (
                        <div
                            key={item.id}
                            className="p-4 bg-card rounded-lg border border-border group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="text-foreground font-medium">{item.name}</h4>
                                    <p className="text-xs text-muted-foreground">
                                        {formatARS(item.spentAmount)} de {formatARS(item.estimatedAmount)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onEdit(item)}
                                        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition"
                                    >
                                        <MoreVertical size={14} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(item.id)}
                                        className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
                                <div
                                    className={`h-full rounded-full transition-all ${pct > 100
                                            ? 'bg-rose-500'
                                            : pct > 80
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                        }`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                            </div>

                            <div className="flex justify-between text-xs">
                                <span className={`font-mono ${pct > 100 ? 'text-rose-400' : 'text-muted-foreground'}`}>
                                    {pct.toFixed(0)}% usado
                                </span>
                                <span className={`font-mono ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {remaining >= 0 ? `Quedan ${formatARS(remaining)}` : `Excedido ${formatARS(Math.abs(remaining))}`}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Add button */}
            <button
                onClick={onAdd}
                className="w-full p-3 border border-dashed border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-muted/30 transition flex items-center justify-center gap-2"
            >
                <Plus size={16} /> Agregar categoría
            </button>
        </div>
    )
}
