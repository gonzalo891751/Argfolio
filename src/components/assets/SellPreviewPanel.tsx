import { AlertTriangle, TrendingDown, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney, formatQty } from '@/lib/format'

interface SellPreviewPanelProps {
    currentHolding: number
    sellQuantity: number
    currentPrice: number
    avgCost: number
    tradeCurrency: string
}

export function SellPreviewPanel({
    currentHolding,
    sellQuantity,
    currentPrice,
    avgCost,
    tradeCurrency,
}: SellPreviewPanelProps) {
    const isOversell = sellQuantity > currentHolding
    const validSellQty = Math.min(sellQuantity, currentHolding)

    const proceeds = validSellQty * currentPrice
    const cost = validSellQty * avgCost
    const estimatedPnL = proceeds - cost
    const remainingQty = currentHolding - validSellQty
    const remainingValue = remainingQty * currentPrice

    return (
        <Card className={cn(
            'border-2',
            isOversell ? 'border-destructive/50 bg-destructive/5' : 'border-primary/20 bg-primary/5'
        )}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" />
                    Vista Previa de Venta
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Current Holdings */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                        <Wallet className="h-3 w-3" />
                        Tenencia Actual
                    </span>
                    <span className="font-numeric font-medium">
                        {formatQty(currentHolding)}
                    </span>
                </div>

                {/* Max Sellable */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Máximo Vendible</span>
                    <span className="font-numeric">
                        {formatQty(currentHolding)}
                    </span>
                </div>

                {/* Oversell Warning */}
                {isOversell && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>
                            No podés vender más de lo que tenés. Ajustá la cantidad a máximo{' '}
                            <span className="font-numeric font-medium">
                                {formatQty(currentHolding)}
                            </span>
                        </span>
                    </div>
                )}

                {/* Divider */}
                <div className="border-t my-2" />

                {/* Estimated Proceeds */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Ingreso Estimado</span>
                    <span className="font-numeric">
                        {formatMoney(proceeds, tradeCurrency)}
                    </span>
                </div>

                {/* Estimated PnL */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">PnL Estimado</span>
                    <span className={cn(
                        'font-numeric font-medium',
                        estimatedPnL >= 0 ? 'text-success' : 'text-destructive'
                    )}>
                        {formatMoney(estimatedPnL, tradeCurrency)}
                    </span>
                </div>

                {/* Remaining Position */}
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Posición Restante</span>
                    <div className="text-right">
                        <span className="font-numeric">
                            {formatQty(remainingQty)}
                        </span>
                        <span className="text-muted-foreground ml-1">
                            ({formatMoney(remainingValue, tradeCurrency)})
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
