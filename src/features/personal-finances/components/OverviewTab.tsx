// =============================================================================
// OVERVIEW TAB COMPONENT
// =============================================================================

import { formatARS } from '../models/calculations'
import type { UpcomingItem } from '../models/types'
import type { MonthlyKpis } from '../models/kpis'
import { UpcomingMaturities } from './UpcomingMaturities'

interface OverviewTabProps {
    kpis: MonthlyKpis
    upcomingMaturities: UpcomingItem[]
    referenceDate: Date
}

export function OverviewTab({
    kpis,
    upcomingMaturities,
    referenceDate,
}: OverviewTabProps) {
    const savingsRate = kpis.incomesEstimated > 0
        ? ((kpis.savingsEstimated / kpis.incomesEstimated) * 100).toFixed(1)
        : '0.0'

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Upcoming Maturities */}
            <UpcomingMaturities
                items={upcomingMaturities}
                referenceDate={referenceDate}
            />

            {/* Summary Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Income vs Expenses Bar */}
                <div className="bg-card rounded-xl p-5 border border-border">
                    <h4 className="text-xs font-mono uppercase text-muted-foreground mb-4">
                        Plan vs Real
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground">Ingresos (Plan)</span>
                                <span className="text-emerald-400 font-mono">
                                    {formatARS(kpis.incomesEstimated)}
                                </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground">Gastos (Plan)</span>
                                <span className="text-rose-400 font-mono">{formatARS(kpis.expensesEstimated)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-rose-500 rounded-full"
                                    style={{
                                        width: `${kpis.incomesEstimated > 0 ? (kpis.expensesEstimated / kpis.incomesEstimated) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground">Ingresos (Real)</span>
                                <span className="text-emerald-400 font-mono">
                                    {formatARS(kpis.incomesCollected)}
                                </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500/70 rounded-full"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground">Gastos (Real)</span>
                                <span className="text-rose-400 font-mono">{formatARS(kpis.expensesPaid)}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-rose-500/70 rounded-full"
                                    style={{
                                        width: `${kpis.incomesCollected > 0 ? (kpis.expensesPaid / kpis.incomesCollected) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Savings Capacity */}
                <div className="bg-card rounded-xl p-5 border border-border flex flex-col justify-center items-center text-center">
                    <div className="text-sm text-muted-foreground mb-2">Ahorro estimado</div>
                    <div className="text-3xl font-mono font-bold text-primary mb-1">
                        {savingsRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {formatARS(kpis.savingsEstimated)} libres
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground">
                        Ahorro real: <span className="font-mono text-foreground">{formatARS(kpis.savingsActual)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
