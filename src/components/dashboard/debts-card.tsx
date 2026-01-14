import { Calendar, ChevronRight, CreditCard } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebts, useNextDueDebt } from '@/hooks/use-debts'
import { formatCurrency } from '@/lib/utils'

export function DebtsSummaryCard() {
    const { data: debts = [], isLoading } = useDebts()
    const { data: nextDue } = useNextDueDebt()

    // Auto-hide if no debts
    if (!isLoading && debts.length === 0) {
        return null
    }

    if (isLoading) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <Skeleton className="h-5 w-24" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-16 w-full" />
                </CardContent>
            </Card>
        )
    }

    const totalDebt = debts.reduce((sum, d) => {
        // Convert to ARS for simplicity (Phase 2 uses a 1200 estimate)
        return sum + (d.currency === 'ARS' ? d.currentBalance : d.currentBalance * 1200)
    }, 0)

    const daysUntilNext = nextDue
        ? Math.ceil(
            (new Date(nextDue.dueDateLocal).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
        : null

    return (
        <Card className="border-warning/30 bg-warning/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-warning/20 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-warning" />
                    </div>
                    <CardTitle className="text-base font-semibold">Deudas</CardTitle>
                </div>
                <Link
                    to="/debts"
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                    Ver todo
                    <ChevronRight className="h-4 w-4" />
                </Link>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Total owed */}
                <div>
                    <p className="text-xl font-bold font-numeric text-warning">
                        {formatCurrency(totalDebt, 'ARS')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {debts.length} deuda{debts.length !== 1 ? 's' : ''} activa{debts.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Next due */}
                {nextDue && (
                    <div className="p-3 rounded-lg bg-background border">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">Próximo vencimiento</span>
                            <Badge
                                variant={daysUntilNext !== null && daysUntilNext <= 7 ? 'destructive' : 'secondary'}
                            >
                                <Calendar className="h-3 w-3 mr-1" />
                                {daysUntilNext !== null && daysUntilNext <= 0
                                    ? 'Vencido'
                                    : daysUntilNext === 1
                                        ? 'Mañana'
                                        : `${daysUntilNext} días`}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{nextDue.name}</p>
                        <p className="text-sm font-semibold font-numeric mt-1">
                            {formatCurrency(nextDue.currentBalance, nextDue.currency)}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
