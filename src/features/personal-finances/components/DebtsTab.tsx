// =============================================================================
// DEBTS TAB COMPONENT
// =============================================================================

import { formatARS } from '../models/calculations'
import type { PFDebt } from '@/db/schema'
import { DebtTable } from './DebtTable'

interface DebtsTabProps {
    debts: PFDebt[]
    yearMonth: string
    onEdit: (debt: PFDebt) => void
    onDelete: (id: string) => void
}

function isCardDebt(debt: PFDebt) {
    return debt.category === 'credit_card'
}

function getRemainingAmount(debt: PFDebt): number {
    if (typeof debt.remainingAmount === 'number') return debt.remainingAmount
    const installmentAmount = debt.installmentAmount || debt.monthlyValue || 0
    const paidInstallments = debt.paidInstallments ?? debt.currentInstallment ?? 0
    return Math.max(0, debt.totalAmount - paidInstallments * installmentAmount)
}

export function DebtsTab({ debts, yearMonth, onEdit, onDelete }: DebtsTabProps) {
    const nonCardDebts = debts.filter((debt) => !isCardDebt(debt))
    const totalRemaining = nonCardDebts.reduce((acc, d) => acc + getRemainingAmount(d), 0)

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap justify-between items-center gap-3 pb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg text-foreground font-display font-semibold">
                        Tus Deudas Activas
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono">
                        (préstamos, personales, informales)
                    </span>
                </div>
                <div className="flex gap-2 text-xs">
                    <span className="px-3 py-1 bg-muted rounded-full text-muted-foreground border border-border">
                        Total Restante:{' '}
                        <span className="text-foreground font-mono">{formatARS(totalRemaining)}</span>
                    </span>
                </div>
            </div>

            {nonCardDebts.length === 0 ? (
                <EmptyState message="No tenés deudas registradas" />
            ) : (
                <DebtTable
                    debts={nonCardDebts}
                    yearMonth={yearMonth}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            )}
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
