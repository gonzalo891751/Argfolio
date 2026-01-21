// =============================================================================
// DEBTS TAB COMPONENT
// =============================================================================

import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../models/calculations'
import type { PFDebt } from '@/db/schema'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DebtsTabProps {
    debts: PFDebt[]
    onEdit: (debt: PFDebt) => void
    onDelete: (id: string) => void
}

export function DebtsTab({ debts, onEdit, onDelete }: DebtsTabProps) {
    const totalRemaining = debts.reduce((acc, d) => acc + d.remainingAmount, 0)

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-center pb-4">
                <h3 className="text-lg text-foreground font-medium">Tus Deudas Activas</h3>
                <div className="flex gap-2 text-xs">
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        Total Restante:{' '}
                        <span className="text-foreground font-mono">{formatARS(totalRemaining)}</span>
                    </span>
                </div>
            </div>

            {debts.length === 0 ? (
                <EmptyState message="No tenés deudas registradas" />
            ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-background text-xs uppercase font-mono text-muted-foreground border-b border-border">
                            <tr>
                                <th className="px-6 py-4 font-medium">Concepto</th>
                                <th className="px-6 py-4 font-medium">Estado</th>
                                <th className="px-6 py-4 font-medium text-right">Cuota Actual</th>
                                <th className="px-6 py-4 font-medium text-right">Progreso</th>
                                <th className="px-6 py-4 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {debts.map((debt) => (
                                <DebtRow
                                    key={debt.id}
                                    debt={debt}
                                    onEdit={() => onEdit(debt)}
                                    onDelete={() => onDelete(debt.id)}
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
// Debt Row
// -----------------------------------------------------------------------------

function DebtRow({
    debt,
    onEdit,
    onDelete,
}: {
    debt: PFDebt
    onEdit: () => void
    onDelete: () => void
}) {
    const progressPct = (debt.currentInstallment / debt.installmentsCount) * 100

    return (
        <tr className="hover:bg-accent/30 transition">
            <td className="px-6 py-4">
                <div className="font-medium text-foreground">{debt.title}</div>
                <div className="text-xs text-muted-foreground">{debt.counterparty}</div>
            </td>
            <td className="px-6 py-4">
                <StatusBadge status={debt.status} />
            </td>
            <td className="px-6 py-4 text-right">
                <div className="font-mono text-foreground">{formatARS(debt.monthlyValue)}</div>
                <div className="text-[10px] text-muted-foreground">Vence día {debt.dueDateDay}</div>
            </td>
            <td className="px-6 py-4 text-right min-w-[150px]">
                <div className="flex items-center justify-end gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">
                        {debt.currentInstallment}/{debt.installmentsCount}
                    </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </td>
            <td className="px-6 py-4 text-right">
                <RowActions onEdit={onEdit} onDelete={onDelete} />
            </td>
        </tr>
    )
}

// -----------------------------------------------------------------------------
// Status Badge
// -----------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        overdue: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        active: 'bg-primary/10 text-primary border-primary/20',
    }

    const labels: Record<string, string> = {
        paid: 'PAGADO',
        overdue: 'VENCIDO',
        pending: 'PENDIENTE',
        active: 'ACTIVO',
    }

    return (
        <span
            className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                styles[status] || styles.pending
            )}
        >
            {labels[status] || status.toUpperCase()}
        </span>
    )
}

// -----------------------------------------------------------------------------
// Row Actions
// -----------------------------------------------------------------------------

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground p-1 rounded focus:outline-none">
                    <MoreVertical size={18} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={4}
                collisionPadding={8}
                className="min-w-[120px]"
            >
                <DropdownMenuItem onClick={onEdit}>
                    Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={onDelete}
                    className="text-rose-400 focus:text-rose-400"
                >
                    Eliminar
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
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
