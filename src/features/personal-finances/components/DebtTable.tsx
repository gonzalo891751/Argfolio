// =============================================================================
// DEBT TABLE (NON-CARD)
// =============================================================================

import { Landmark, Scale, Users, ShoppingBag, Sparkles } from 'lucide-react'
import { formatARS } from '../models/calculations'
import type { PFDebt } from '@/db/schema'
import { DebtRow } from './DebtRow'

interface DebtTableProps {
    debts: PFDebt[]
    yearMonth: string
    onEdit: (debt: PFDebt) => void
    onDelete: (id: string) => void
}

type DebtCategoryKey =
    | 'banco'
    | 'profesional'
    | 'familiar'
    | 'comercio'
    | 'otro'
    | 'loan'
    | 'personal'
    | 'credit_card'

const CATEGORY_META: Record<DebtCategoryKey, { label: string; icon: typeof Landmark; iconClass: string; bgClass: string }> = {
    banco: { label: 'Prestamo bancario', icon: Landmark, iconClass: 'text-blue-400', bgClass: 'bg-blue-500/10' },
    profesional: { label: 'Servicio profesional', icon: Scale, iconClass: 'text-purple-400', bgClass: 'bg-purple-500/10' },
    familiar: { label: 'Prestamo familiar', icon: Users, iconClass: 'text-amber-400', bgClass: 'bg-amber-500/10' },
    comercio: { label: 'Compra en cuotas', icon: ShoppingBag, iconClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
    otro: { label: 'Otra deuda', icon: Sparkles, iconClass: 'text-slate-400', bgClass: 'bg-slate-500/10' },
    loan: { label: 'Prestamo bancario', icon: Landmark, iconClass: 'text-blue-400', bgClass: 'bg-blue-500/10' },
    personal: { label: 'Prestamo familiar', icon: Users, iconClass: 'text-amber-400', bgClass: 'bg-amber-500/10' },
    credit_card: { label: 'Tarjeta de credito', icon: ShoppingBag, iconClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10' },
}

function toYearMonthIndex(yearMonth: string): number {
    const [year, month] = yearMonth.split('-').map(Number)
    return year * 12 + (month - 1)
}

function getStartYearMonth(debt: PFDebt, fallback: string): string {
    return debt.startYearMonth || debt.startDate?.slice(0, 7) || fallback
}

function getInstallmentAmount(debt: PFDebt): number {
    if (debt.installmentAmount && debt.installmentAmount > 0) return debt.installmentAmount
    if (debt.monthlyValue && debt.monthlyValue > 0) return debt.monthlyValue
    if (debt.totalAmount && debt.installmentsCount) {
        return Math.ceil(debt.totalAmount / debt.installmentsCount)
    }
    return 0
}

function getPaidInstallments(debt: PFDebt): number {
    return debt.paidInstallments ?? debt.currentInstallment ?? 0
}

function getPaidTotal(debt: PFDebt): number {
    if (debt.payments?.length) {
        return debt.payments.reduce((sum, p) => sum + p.amount, 0)
    }
    return getPaidInstallments(debt) * getInstallmentAmount(debt)
}

function getInstallmentIndexForMonth(debt: PFDebt, yearMonth: string): number | null {
    const startYM = getStartYearMonth(debt, yearMonth)
    const startIndex = toYearMonthIndex(startYM)
    const targetIndex = toYearMonthIndex(yearMonth)
    const endIndex = startIndex + debt.installmentsCount - 1

    if (targetIndex < startIndex || targetIndex > endIndex) return null
    return targetIndex - startIndex + 1
}

function isMonthBeforeStart(debt: PFDebt, yearMonth: string): boolean {
    const startYM = getStartYearMonth(debt, yearMonth)
    return toYearMonthIndex(yearMonth) < toYearMonthIndex(startYM)
}

function isMonthAfterEnd(debt: PFDebt, yearMonth: string): boolean {
    const startYM = getStartYearMonth(debt, yearMonth)
    const endIndex = toYearMonthIndex(startYM) + debt.installmentsCount - 1
    return toYearMonthIndex(yearMonth) > endIndex
}

function getDebtCategoryMeta(debt: PFDebt) {
    const key = (debt.category || 'otro') as DebtCategoryKey
    return CATEGORY_META[key] || CATEGORY_META.otro
}

function getRemainingAmount(debt: PFDebt): number {
    const paid = getPaidTotal(debt)
    return Math.max(0, debt.totalAmount - paid)
}

function getActiveDebts(debts: PFDebt[]): PFDebt[] {
    return debts.filter((debt) => debt.status !== 'paid' && debt.status !== 'completed')
}

export function DebtTable({ debts, yearMonth, onEdit, onDelete }: DebtTableProps) {
    const totalInstallmentsForMonth = debts.reduce((sum, debt) => {
        if (isMonthBeforeStart(debt, yearMonth)) return sum
        if (isMonthAfterEnd(debt, yearMonth)) return sum
        return sum + getInstallmentAmount(debt)
    }, 0)
    const debtsWithInstallment = debts.filter(
        (debt) => !isMonthBeforeStart(debt, yearMonth) && !isMonthAfterEnd(debt, yearMonth)
    )

    const totalPaid = debts.reduce((sum, debt) => sum + getPaidTotal(debt), 0)
    const totalOriginal = debts.reduce((sum, debt) => sum + debt.totalAmount, 0)

    const activeDebts = getActiveDebts(debts)
    const averageProgress = activeDebts.length
        ? activeDebts.reduce((sum, debt) => {
            if (debt.totalAmount <= 0) return sum
            return sum + (getPaidTotal(debt) / debt.totalAmount) * 100
        }, 0) / activeDebts.length
        : 0

    return (
        <div className="space-y-6">
            <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-card">
                <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-background text-xs font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                    <div className="col-span-3">Concepto / Acreedor</div>
                    <div className="col-span-1 text-center">Estado</div>
                    <div className="col-span-2 text-right">Monto Total</div>
                    <div className="col-span-2 text-right">Cancelado</div>
                    <div className="col-span-2 text-right">Cuota del Mes</div>
                    <div className="col-span-2 text-center">Progreso</div>
                </div>
                <div className="divide-y divide-border">
                    {debts.map((debt) => (
                        <DebtRow
                            key={debt.id}
                            debt={debt}
                            yearMonth={yearMonth}
                            categoryMeta={getDebtCategoryMeta(debt)}
                            installmentIndex={getInstallmentIndexForMonth(debt, yearMonth)}
                            isBeforeStart={isMonthBeforeStart(debt, yearMonth)}
                            isAfterEnd={isMonthAfterEnd(debt, yearMonth)}
                            paidTotal={getPaidTotal(debt)}
                            remainingAmount={getRemainingAmount(debt)}
                            onEdit={() => onEdit(debt)}
                            onDelete={() => onDelete(debt.id)}
                        />
                    ))}
                </div>
            </div>

            <div className="grid gap-3 md:hidden">
                {debts.map((debt) => (
                    <DebtRow
                        key={debt.id}
                        debt={debt}
                        yearMonth={yearMonth}
                        categoryMeta={getDebtCategoryMeta(debt)}
                        installmentIndex={getInstallmentIndexForMonth(debt, yearMonth)}
                        isBeforeStart={isMonthBeforeStart(debt, yearMonth)}
                        isAfterEnd={isMonthAfterEnd(debt, yearMonth)}
                        paidTotal={getPaidTotal(debt)}
                        remainingAmount={getRemainingAmount(debt)}
                        onEdit={() => onEdit(debt)}
                        onDelete={() => onDelete(debt.id)}
                        layout="card"
                    />
                ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        <span className="text-xs font-mono uppercase text-muted-foreground">
                            Total Cuotas del Mes
                        </span>
                    </div>
                    <p className="font-mono text-2xl font-bold text-foreground">
                        {formatARS(totalInstallmentsForMonth)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        {debtsWithInstallment.length} cuotas en el mes seleccionado
                    </p>
                </div>

                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-xs font-mono uppercase text-muted-foreground">
                            Ya Cancelado (Total)
                        </span>
                    </div>
                    <p className="font-mono text-2xl font-bold text-emerald-400">
                        {formatARS(totalPaid)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        De {formatARS(totalOriginal)} total original
                    </p>
                </div>

                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-primary"></div>
                        <span className="text-xs font-mono uppercase text-muted-foreground">
                            Progreso Global
                        </span>
                    </div>
                    <div className="flex items-end gap-3">
                        <p className="font-mono text-2xl font-bold text-foreground">
                            {Math.round(averageProgress)}%
                        </p>
                        <div className="flex-1 mb-2">
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-primary to-sky-500 rounded-full"
                                    style={{ width: `${Math.min(100, averageProgress)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Deudas activas (excluyendo pagadas)
                    </p>
                </div>
            </div>
        </div>
    )
}
