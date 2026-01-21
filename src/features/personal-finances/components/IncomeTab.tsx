// =============================================================================
// INCOME TAB COMPONENT
// =============================================================================

import { MoreHorizontal, CheckCircle2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../models/calculations'
import type { Income } from '../models/types'

interface IncomeTabProps {
    incomes: Income[]
    onEdit: (income: Income) => void
    onDelete: (id: string) => void
    onMarkReceived: (id: string) => void
}

export function IncomeTab({ incomes, onEdit, onDelete, onMarkReceived }: IncomeTabProps) {
    const totalExpected = incomes.reduce((acc, i) => acc + i.amount, 0)
    const totalReceived = incomes
        .filter((i) => i.status === 'received')
        .reduce((acc, i) => acc + i.amount, 0)

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center pb-4">
                <h3 className="text-lg text-foreground font-medium">Ingresos del Mes</h3>
                <div className="flex gap-2 text-xs">
                    <span className="px-3 py-1 bg-emerald-500/10 rounded-full text-emerald-400 border border-emerald-500/20">
                        Cobrado: <span className="font-mono">{formatARS(totalReceived)}</span>
                    </span>
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        Esperado: <span className="font-mono">{formatARS(totalExpected)}</span>
                    </span>
                </div>
            </div>

            {incomes.length === 0 ? (
                <EmptyState message="No tenés ingresos registrados" />
            ) : (
                <div className="grid gap-4">
                    {incomes.map((income) => (
                        <IncomeCard
                            key={income.id}
                            income={income}
                            onEdit={() => onEdit(income)}
                            onDelete={() => onDelete(income.id)}
                            onMarkReceived={() => onMarkReceived(income.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// -----------------------------------------------------------------------------
// Income Card
// -----------------------------------------------------------------------------

function IncomeCard({
    income,
    onEdit,
    onDelete,
    onMarkReceived,
}: {
    income: Income
    onEdit: () => void
    onDelete: () => void
    onMarkReceived: () => void
}) {
    const isReceived = income.status === 'received'

    return (
        <div
            className={cn(
                'flex items-center justify-between p-4 rounded-xl bg-card border border-border transition hover:border-border/80',
                isReceived && 'opacity-60'
            )}
        >
            <div className="flex items-center gap-4">
                <div
                    className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border',
                        income.isGuaranteed
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    )}
                >
                    <TrendingUp size={18} />
                </div>
                <div>
                    <div className="font-medium text-foreground">{income.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{income.isGuaranteed ? 'Fijo' : 'Variable'}</span>
                        <span className="w-1 h-1 rounded-full bg-muted" />
                        <span>Día {income.dateExpected}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-right">
                    <div className="font-mono text-lg text-emerald-400">{formatARS(income.amount)}</div>
                </div>
                <button
                    onClick={onMarkReceived}
                    className={cn(
                        'p-2 rounded-full border transition-all',
                        isReceived
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-transparent border-border text-muted-foreground hover:text-emerald-400 hover:border-emerald-400'
                    )}
                    title="Marcar como cobrado"
                >
                    <CheckCircle2 size={16} />
                </button>
                <RowActions onEdit={onEdit} onDelete={onDelete} />
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Row Actions
// -----------------------------------------------------------------------------

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return (
        <div className="relative group">
            <button className="text-muted-foreground hover:text-foreground p-1 rounded">
                <MoreHorizontal size={18} />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px]">
                <button
                    onClick={onEdit}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent transition"
                >
                    Editar
                </button>
                <button
                    onClick={onDelete}
                    className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-accent transition"
                >
                    Eliminar
                </button>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Empty State
// -----------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-xl bg-muted/5">
            <p className="text-muted-foreground text-sm">{message}</p>
        </div>
    )
}
