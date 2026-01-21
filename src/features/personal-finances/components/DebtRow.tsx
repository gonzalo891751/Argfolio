// =============================================================================
// DEBT ROW
// =============================================================================

import type { ElementType } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS } from '../models/calculations'
import type { PFDebt } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface CategoryMeta {
    label: string
    icon: ElementType
    iconClass: string
    bgClass: string
}

interface DebtRowProps {
    debt: PFDebt
    yearMonth: string
    categoryMeta: CategoryMeta
    installmentIndex: number | null
    isBeforeStart: boolean
    isAfterEnd: boolean
    paidTotal: number
    remainingAmount: number
    onEdit: () => void
    onDelete: () => void
    layout?: 'table' | 'card'
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

function getDueDay(debt: PFDebt): number {
    return debt.dueDay || debt.dueDateDay || 1
}

function getStatusMeta({
    debt,
    installmentIndex,
    isBeforeStart,
    isAfterEnd,
}: {
    debt: PFDebt
    installmentIndex: number | null
    isBeforeStart: boolean
    isAfterEnd: boolean
}) {
    if (isAfterEnd || debt.status === 'paid' || debt.status === 'completed') {
        return { label: 'Pagado', className: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' }
    }

    if (installmentIndex === debt.installmentsCount) {
        return { label: 'Ultima', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
    }

    if (debt.status === 'overdue') {
        return { label: 'Atrasado', className: 'bg-rose-500/10 text-rose-400 border border-rose-500/20' }
    }

    if (isBeforeStart) {
        return { label: 'Activo', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
    }

    return { label: 'Activo', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
}

function getRowToneClass(isAfterEnd: boolean, debtStatus: string) {
    if (isAfterEnd || debtStatus === 'paid' || debtStatus === 'completed') {
        return 'opacity-60'
    }
    return ''
}

export function DebtRow({
    debt,
    yearMonth,
    categoryMeta,
    installmentIndex,
    isBeforeStart,
    isAfterEnd,
    paidTotal,
    remainingAmount,
    onEdit,
    onDelete,
    layout = 'table',
}: DebtRowProps) {
    const paidInstallments = getPaidInstallments(debt)
    const installmentAmount = getInstallmentAmount(debt)
    const dueDay = getDueDay(debt)
    const progressPct = debt.totalAmount > 0 ? (paidTotal / debt.totalAmount) * 100 : 0
    const isLastInstallment = installmentIndex === debt.installmentsCount
    const statusMeta = getStatusMeta({ debt, installmentIndex, isBeforeStart, isAfterEnd })
    const rowToneClass = getRowToneClass(isAfterEnd, debt.status)

    const TitleIcon = categoryMeta.icon

    const content = (
        <>
            <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', categoryMeta.bgClass)}>
                    <TitleIcon className={cn('w-5 h-5', categoryMeta.iconClass)} />
                </div>
                <div>
                    <p className={cn('font-medium text-foreground', rowToneClass)}>
                        {debt.title || debt.name || debt.counterparty}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {categoryMeta.label} · {debt.installmentsCount} cuotas
                    </p>
                </div>
            </div>
        </>
    )

    const statusBadge = (
        <Badge className={cn('text-xs font-medium', statusMeta.className)}>
            {statusMeta.label}
        </Badge>
    )

    const installmentCell = (() => {
        if (isBeforeStart) {
            return (
                <>
                    <p className="font-mono text-muted-foreground">-</p>
                    <p className="text-xs text-muted-foreground">No iniciada</p>
                </>
            )
        }

        if (isAfterEnd) {
            return (
                <>
                    <p className="font-mono text-muted-foreground">-</p>
                    <p className="text-xs text-muted-foreground">Completada</p>
                </>
            )
        }

        if (isLastInstallment) {
            return (
                <>
                    <p className="font-mono font-semibold text-amber-400">{formatARS(installmentAmount)}</p>
                    <p className="text-xs text-amber-400/80">Ultima cuota!</p>
                </>
            )
        }

        return (
            <>
                <p className="font-mono font-semibold text-foreground">{formatARS(installmentAmount)}</p>
                <p className="text-xs text-muted-foreground">Vence dia {dueDay}</p>
            </>
        )
    })()

    const progressContent = (
        <div className="flex items-center gap-3">
            <div className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                        {paidInstallments}/{debt.installmentsCount}
                    </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isAfterEnd || debt.status === 'paid' || debt.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-gradient-to-r from-primary to-sky-500'
                        )}
                        style={{ width: `${Math.min(100, progressPct)}%` }}
                    />
                </div>
            </div>
            <RowActions onEdit={onEdit} onDelete={onDelete} />
        </div>
    )

    if (layout === 'card') {
        return (
            <div className={cn('glass-panel rounded-xl p-4 space-y-3', rowToneClass)}>
                <div className="flex items-start justify-between">
                    {content}
                    <RowActions onEdit={onEdit} onDelete={onDelete} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {statusBadge}
                    <div className="text-xs text-muted-foreground">
                        Mes seleccionado: {yearMonth}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-xs text-muted-foreground">Monto Total</p>
                        <p className="font-mono">{formatARS(debt.totalAmount)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Cancelado</p>
                        <p className="font-mono text-emerald-400">
                            {formatARS(paidTotal)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {Math.round((paidTotal / Math.max(1, debt.totalAmount)) * 100)}%
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Cuota del Mes</p>
                        {installmentCell}
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Restante</p>
                        <p className="font-mono">{formatARS(remainingAmount)}</p>
                    </div>
                </div>
                <div>{progressContent}</div>
            </div>
        )
    }

    return (
        <div className={cn('grid grid-cols-12 gap-4 px-6 py-5 items-center transition-colors hover:bg-accent/30', rowToneClass)}>
            <div className="col-span-3">{content}</div>
            <div className="col-span-1 flex justify-center">{statusBadge}</div>
            <div className="col-span-2 text-right">
                <p className="font-mono text-foreground">{formatARS(debt.totalAmount)}</p>
            </div>
            <div className="col-span-2 text-right">
                <p className="font-mono text-emerald-400">{formatARS(paidTotal)}</p>
                <p className="text-xs text-muted-foreground">
                    {Math.round((paidTotal / Math.max(1, debt.totalAmount)) * 100)}%
                </p>
            </div>
            <div className="col-span-2 text-right">{installmentCell}</div>
            <div className="col-span-2">{progressContent}</div>
        </div>
    )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical size={18} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} collisionPadding={8} className="min-w-[140px]">
                <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-rose-400 focus:text-rose-400">
                    Eliminar
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
