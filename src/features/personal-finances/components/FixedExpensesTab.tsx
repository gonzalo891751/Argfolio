// =============================================================================
// FIXED EXPENSES TAB COMPONENT
// =============================================================================

import { MoreHorizontal, CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../models/calculations'
import type { PFFixedExpense } from '@/db/schema'
import { getFixedExpenseExecutionForMonth } from '../models/financeHelpers'

interface FixedExpensesTabProps {
    expenses: PFFixedExpense[]
    yearMonth: string
    viewMode: 'plan' | 'actual'
    onEdit: (expense: PFFixedExpense) => void
    onDelete: (id: string) => void
    onExecute: (expense: PFFixedExpense) => void
}

export function FixedExpensesTab({
    expenses,
    yearMonth,
    viewMode,
    onEdit,
    onDelete,
    onExecute,
}: FixedExpensesTabProps) {
    const plannedExpenses = expenses
    const executedExpenses = expenses.filter((e) => !!getFixedExpenseExecutionForMonth(e, yearMonth))
    const displayExpenses = viewMode === 'actual' ? executedExpenses : plannedExpenses
    const totalMonthly = plannedExpenses.reduce((acc, e) => acc + e.amount, 0)
    const paidCount = executedExpenses.length

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center pb-4">
                <h3 className="text-lg text-foreground font-medium">Gastos Fijos Mensuales</h3>
                <div className="flex gap-2 text-xs">
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        {paidCount}/{expenses.length} pagados
                    </span>
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        Total: <span className="text-foreground font-mono">{formatARS(totalMonthly)}</span>
                    </span>
                </div>
            </div>

            {displayExpenses.length === 0 ? (
                <EmptyState message="No tenés gastos fijos registrados" />
            ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-background text-xs uppercase font-mono text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-medium">Concepto</th>
                                <th className="px-6 py-4 font-medium">Categoria</th>
                                <th className="px-6 py-4 font-medium text-center">Debito Auto</th>
                                <th className="px-6 py-4 font-medium text-right">Monto</th>
                                <th className="px-6 py-4 font-medium text-center">Pagado</th>
                                <th className="px-6 py-4 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {displayExpenses.map((expense) => (
                                <ExpenseRow
                                    key={expense.id}
                                    expense={expense}
                                    execution={getFixedExpenseExecutionForMonth(expense, yearMonth)}
                                    onEdit={() => onEdit(expense)}
                                    onDelete={() => onDelete(expense.id)}
                                    onExecute={() => onExecute(expense)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// -----------------------------------------------------------------------------
// Expense Row
// -----------------------------------------------------------------------------

function ExpenseRow({
    expense,
    execution,
    onEdit,
    onDelete,
    onExecute,
}: {
    expense: PFFixedExpense
    execution: { movementId?: string } | undefined
    onEdit: () => void
    onDelete: () => void
    onExecute: () => void
}) {
    const isPaid = !!execution

    return (
        <tr className={cn('hover:bg-accent/30 transition', isPaid && 'opacity-60')}>
            <td className="px-6 py-4">
                <div className="font-medium text-foreground">{expense.title}</div>
                <div className="text-xs text-muted-foreground">Vence dia {expense.dueDay}</div>
            </td>
            <td className="px-6 py-4">
                <CategoryBadge category={expense.category} />
            </td>
            <td className="px-6 py-4 text-center">
                {expense.autoDebit ? (
                    <span className="text-emerald-400 text-xs">Si</span>
                ) : (
                    <span className="text-muted-foreground text-xs">No</span>
                )}
            </td>
            <td className="px-6 py-4 text-right">
                <div className="font-mono text-foreground">{formatARS(expense.amount)}</div>
                {execution?.movementId && (
                    <a
                        href="/movements"
                        className="text-xs text-sky-400 inline-flex items-center gap-1 hover:text-sky-300"
                    >
                        Ver movimiento
                        <ExternalLink size={12} />
                    </a>
                )}
            </td>
            <td className="px-6 py-4 text-center">
                <button
                    onClick={onExecute}
                    className={cn(
                        'p-2 rounded-full border transition-all',
                        isPaid
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-transparent border-border text-muted-foreground hover:text-emerald-400 hover:border-emerald-400'
                    )}
                >
                    <CheckCircle2 size={16} />
                </button>
            </td>
            <td className="px-6 py-4 text-right">
                <RowActions onEdit={onEdit} onDelete={onDelete} />
            </td>
        </tr>
    )
}

// -----------------------------------------------------------------------------
// Category Badge
// -----------------------------------------------------------------------------

const categoryLabels: Record<string, string> = {
    service: 'Servicio',
    subscription: 'Suscripcion',
    education: 'Educacion',
    housing: 'Vivienda',
    insurance: 'Seguro',
}

function CategoryBadge({ category }: { category: string }) {
    return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {categoryLabels[category] || category}
        </span>
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
