// =============================================================================
// INCOME TAB COMPONENT
// =============================================================================

import { MoreHorizontal, CheckCircle2, ExternalLink, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../models/calculations'
import type { PFIncome } from '@/db/schema'
import { getIncomeEffectiveDate, isDateInYearMonth } from '../models/financeHelpers'

interface IncomeTabProps {
    incomes: PFIncome[]
    yearMonth: string
    viewMode: 'plan' | 'actual'
    onEdit: (income: PFIncome) => void
    onDelete: (id: string) => void
    onExecute: (income: PFIncome) => void
}

export function IncomeTab({ incomes, yearMonth, viewMode, onEdit, onDelete, onExecute }: IncomeTabProps) {
    const plannedIncomes = incomes.filter((i) => i.yearMonth === yearMonth)
    const executedIncomes = incomes.filter((i) =>
        isDateInYearMonth(getIncomeEffectiveDate(i), yearMonth)
    )
    const displayIncomes = viewMode === 'actual' ? executedIncomes : plannedIncomes
    const totalExpected = plannedIncomes.reduce((acc, i) => acc + i.amount, 0)
    const totalReceived = executedIncomes.reduce((acc, i) => acc + i.amount, 0)

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center pb-4">
                <h3 className="text-lg text-foreground font-medium">Ingresos del Mes</h3>
                <div className="flex gap-2 text-xs">
                    <span className="px-3 py-1 bg-emerald-500/10 rounded-full text-emerald-400 border border-emerald-500/20">
                        Cobrado: <span className="font-mono">{formatARS(totalReceived)}</span>
                    </span>
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        Estimado: <span className="font-mono">{formatARS(totalExpected)}</span>
                    </span>
                </div>
            </div>

            {displayIncomes.length === 0 ? (
                <EmptyState message="No tenés ingresos registrados" />
            ) : (
                <div className="grid gap-4">
                    {displayIncomes.map((income) => (
                        <IncomeCard
                            key={income.id}
                            income={income}
                            onEdit={() => onEdit(income)}
                            onDelete={() => onDelete(income.id)}
                            onExecute={() => onExecute(income)}
                            isExecuted={isDateInYearMonth(getIncomeEffectiveDate(income), yearMonth)}
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
    onExecute,
    isExecuted,
}: {
    income: PFIncome
    onEdit: () => void
    onDelete: () => void
    onExecute: () => void
    isExecuted: boolean
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-between p-4 rounded-xl bg-card border border-border transition hover:border-border/80',
                isExecuted && 'opacity-60'
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
                        <span>Dia {income.dateExpected}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-right">
                    <div className="font-mono text-lg text-emerald-400">{formatARS(income.amount)}</div>
                    {income.movementId && (
                        <a
                            href="/movements"
                            className="text-xs text-sky-400 inline-flex items-center gap-1 hover:text-sky-300"
                        >
                            Ver movimiento
                            <ExternalLink size={12} />
                        </a>
                    )}
                </div>
                <button
                    onClick={onExecute}
                    className={cn(
                        'p-2 rounded-full border transition-all',
                        isExecuted
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
