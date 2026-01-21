// =============================================================================
// OVERVIEW TAB COMPONENT
// =============================================================================

import { formatARS } from '../models/calculations'
import type { MonthlySnapshot, UpcomingItem } from '../models/types'
import { UpcomingMaturities } from './UpcomingMaturities'

interface OverviewTabProps {
    totals: MonthlySnapshot
    upcomingMaturities: UpcomingItem[]
    referenceDate: Date
    onMarkPaid: (id: string, type: 'debt' | 'expense' | 'card') => void
}

export function OverviewTab({
    totals,
    upcomingMaturities,
    referenceDate,
    onMarkPaid,
}: OverviewTabProps) {
    const savingsRate = totals.totalIncome > 0
        ? ((totals.available / totals.totalIncome) * 100).toFixed(1)
        : '0.0'

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Upcoming Maturities */}
            <UpcomingMaturities
                items={upcomingMaturities}
                referenceDate={referenceDate}
                onMarkPaid={onMarkPaid}
            />

            {/* Summary Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Income vs Expenses Bar */}
                <div className="bg-card rounded-xl p-5 border border-border">
                    <h4 className="text-xs font-mono uppercase text-muted-foreground mb-4">
                        Ingresos vs. Gastos
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-foreground">Ingresos</span>
                                <span className="text-emerald-400 font-mono">
                                    {formatARS(totals.totalIncome)}
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
                                <span className="text-foreground">Compromisos</span>
                                <span className="text-rose-400 font-mono">
                                    {formatARS(totals.commitments)}
                                </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-rose-500 rounded-full"
                                    style={{
                                        width: `${totals.totalIncome > 0 ? (totals.commitments / totals.totalIncome) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Savings Capacity */}
                <div className="bg-card rounded-xl p-5 border border-border flex flex-col justify-center items-center text-center">
                    <div className="text-sm text-muted-foreground mb-2">Capacidad de Ahorro</div>
                    <div className="text-3xl font-mono font-bold text-primary mb-1">
                        {savingsRate}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {formatARS(totals.available)} libres
                    </div>
                </div>
            </div>
        </div>
    )
}
