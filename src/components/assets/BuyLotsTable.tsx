import { cn, formatCurrency, formatPercent } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { BuyLot } from '@/hooks/use-instrument-detail'

interface BuyLotsTableProps {
    lots: BuyLot[]
    isLoading?: boolean
}

export function BuyLotsTable({ lots, isLoading }: BuyLotsTableProps) {
    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                ))}
            </div>
        )
    }

    if (lots.length === 0) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">Sin compras</p>
                <p className="text-sm">No hay movimientos de compra para este activo</p>
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

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
                <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Fecha</th>
                        <th className="text-left p-3 text-sm font-medium text-muted-foreground">Cuenta</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Cantidad</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Precio</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total Pagado</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">FX</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">Valor Actual</th>
                        <th className="text-right p-3 text-sm font-medium text-muted-foreground">PnL Lote</th>
                    </tr>
                </thead>
                <tbody>
                    {lots.map((lot) => (
                        <tr
                            key={lot.movementId}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                            <td className="p-3 text-sm font-numeric">
                                {formatDate(lot.date)}
                            </td>
                            <td className="p-3 text-sm">
                                {lot.accountName}
                            </td>
                            <td className="p-3 text-right font-numeric">
                                {lot.quantity < 1 ? lot.quantity.toFixed(8) : lot.quantity.toFixed(4)}
                            </td>
                            <td className="p-3 text-right font-numeric text-muted-foreground">
                                {formatCurrency(lot.unitPrice, lot.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                            <td className="p-3 text-right font-numeric">
                                {formatCurrency(lot.totalPaid, lot.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                            <td className="p-3 text-right font-numeric text-muted-foreground">
                                {lot.fxAtTrade ? lot.fxAtTrade.toFixed(2) : '—'}
                            </td>
                            <td className="p-3 text-right font-numeric">
                                {formatCurrency(lot.currentValue, lot.tradeCurrency as 'USD' | 'ARS')}
                            </td>
                            <td className={cn(
                                'p-3 text-right font-numeric font-medium',
                                lot.lotPnL >= 0 ? 'text-success' : 'text-destructive'
                            )}>
                                <div>
                                    {formatCurrency(lot.lotPnL, lot.tradeCurrency as 'USD' | 'ARS')}
                                </div>
                                <div className="text-xs">
                                    {formatPercent(lot.lotPnLPercent)}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
