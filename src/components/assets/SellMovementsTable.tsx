import { cn, formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { Movement } from '@/domain/types'

interface SellMovementsTableProps {
    movements: Movement[]
    avgCost: number
    isLoading?: boolean
}

export function SellMovementsTable({ movements, avgCost, isLoading }: SellMovementsTableProps) {
    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        )
    }

    if (movements.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">Sin ventas</p>
                <p className="text-sm">No hay movimientos de venta para este activo</p>
            </div>
        )
    }

    const formatDate = (iso: string) => {
        const date = new Date(iso)
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        })
    }

    // Calculate realized PnL for each sell (simplified: uses current avgCost, not historical)
    // Note: For accurate historical PnL, we'd need to track cost basis at time of each sale
    const sellsWithPnL = movements.map((mov) => {
        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0
        const proceeds = qty * price
        const cost = qty * avgCost // Approximation using current avg cost
        const realizedPnL = proceeds - cost

        return {
            ...mov,
            realizedPnL,
        }
    })

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Fecha</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Cuenta</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Cantidad</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Precio</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total Recibido</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">PnL Realizado</th>
                    </tr>
                </thead>
                <tbody>
                    {sellsWithPnL.map((sell) => (
                        <tr
                            key={sell.id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                            <td className="p-3 text-sm font-numeric">
                                {formatDate(sell.datetimeISO)}
                            </td>
                            <td className="p-3 text-sm">
                                {sell.accountId}
                            </td>
                            <td className="p-3 text-right font-numeric">
                                {(sell.quantity ?? 0) < 1
                                    ? (sell.quantity ?? 0).toFixed(8)
                                    : (sell.quantity ?? 0).toFixed(4)}
                            </td>
                            <td className="p-3 text-right font-numeric text-muted-foreground">
                                {formatCurrency(sell.unitPrice ?? 0, sell.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                            <td className="p-3 text-right font-numeric">
                                {formatCurrency(sell.totalAmount, sell.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                            <td className={cn(
                                'p-3 text-right font-numeric font-medium',
                                sell.realizedPnL >= 0 ? 'text-success' : 'text-destructive'
                            )}>
                                {formatCurrency(sell.realizedPnL, sell.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
