import { useState } from 'react'
import { Trash2, Pencil, MoreHorizontal } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import type { Movement, Instrument, Account } from '@/domain/types'

const typeLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'positive' }> = {
    BUY: { label: 'Compra', variant: 'positive' },
    SELL: { label: 'Venta', variant: 'destructive' },
    DEPOSIT: { label: 'Depósito', variant: 'positive' },
    WITHDRAW: { label: 'Retiro', variant: 'destructive' },
    DIVIDEND: { label: 'Dividendo', variant: 'positive' },
    INTEREST: { label: 'Interés', variant: 'positive' },
    FEE: { label: 'Comisión', variant: 'secondary' },
    TRANSFER_IN: { label: 'Transfer In', variant: 'default' },
    TRANSFER_OUT: { label: 'Transfer Out', variant: 'default' },
    DEBT_ADD: { label: 'Nueva Deuda', variant: 'destructive' },
    DEBT_PAY: { label: 'Pago Deuda', variant: 'positive' },
}

interface MovementTableProps {
    movements: Movement[]
    instruments: Map<string, Instrument>
    accounts: Map<string, Account>
    isLoading: boolean
    onEdit: (movement: Movement) => void
    onDelete: (id: string) => void
}

export function MovementTable({
    movements,
    instruments,
    accounts,
    isLoading,
    onEdit,
    onDelete,
}: MovementTableProps) {
    const [deleteId, setDeleteId] = useState<string | null>(null)

    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                ))}
            </div>
        )
    }

    if (movements.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">Sin movimientos</p>
                <p className="text-sm">Cargá tu primer movimiento para empezar a trackear tu portfolio</p>
            </div>
        )
    }

    const formatDate = (iso: string) => {
        const date = new Date(iso)
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Fecha</th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Tipo</th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Activo</th>
                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Cuenta</th>
                            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Cantidad</th>
                            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Precio</th>
                            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                            <th className="text-right p-3 text-sm font-medium text-muted-foreground w-[80px]">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {movements.map((mov) => {
                            const instrument = mov.instrumentId ? instruments.get(mov.instrumentId) : null
                            const account = accounts.get(mov.accountId)
                            const typeInfo = typeLabels[mov.type] ?? { label: mov.type, variant: 'default' }

                            return (
                                <tr
                                    key={mov.id}
                                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                                >
                                    <td className="p-3 text-sm font-numeric">
                                        {formatDate(mov.datetimeISO)}
                                    </td>
                                    <td className="p-3">
                                        <Badge variant={typeInfo.variant as 'default'}>{typeInfo.label}</Badge>
                                    </td>
                                    <td className="p-3">
                                        {instrument ? (
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                                                    {instrument.symbol.slice(0, 2)}
                                                </div>
                                                <span className="font-medium">{instrument.symbol}</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-sm">
                                        {account?.name ?? <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="p-3 text-right font-numeric">
                                        {mov.quantity?.toFixed(mov.quantity < 1 ? 8 : 2) ?? '—'}
                                    </td>
                                    <td className="p-3 text-right font-numeric text-muted-foreground">
                                        {mov.unitPrice ? formatCurrency(mov.unitPrice, mov.tradeCurrency) : '—'}
                                    </td>
                                    <td className={cn(
                                        'p-3 text-right font-numeric font-medium',
                                        mov.type === 'SELL' || mov.type === 'WITHDRAW' ? 'text-destructive' : ''
                                    )}>
                                        {formatCurrency(mov.totalAmount, mov.tradeCurrency)}
                                    </td>
                                    <td className="p-3 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => onEdit(mov)}>
                                                    <Pencil className="h-4 w-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => setDeleteId(mov.id)}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Eliminar
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <DeleteConfirmDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId) {
                        onDelete(deleteId)
                        setDeleteId(null)
                    }
                }}
            />
        </>
    )
}
