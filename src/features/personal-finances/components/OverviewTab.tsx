// =============================================================================
// OVERVIEW TAB COMPONENT — Redesigned with Plan vs Real table
// =============================================================================

import { AlertTriangle, ArrowRight, Calendar, CreditCard, Wallet, TrendingDown, PiggyBank } from 'lucide-react'
import { formatARS, formatUSD } from '../models/calculations'
import type { MonthlyKpis } from '../models/kpis'
import type { CardStatementData } from '../hooks/usePersonalFinancesV3'
import { formatDayMonth } from '../utils/dateHelpers'

interface UpcomingItem {
    id: string
    label: string
    dueDate: string // YYYY-MM-DD
    amount: number
    amountUsd?: number
    type: 'card' | 'debt' | 'expense' | 'income'
}

interface OverviewTabProps {
    kpis: MonthlyKpis
    cardStatementData: CardStatementData[]
    onGoToDebts: () => void
    referenceDate: Date
    mepSell?: number | null
}

export function OverviewTab({
    kpis,
    cardStatementData,
    onGoToDebts,
    referenceDate,
    mepSell,
}: OverviewTabProps) {
    // Build upcoming maturities list from card data
    const upcomingItems: UpcomingItem[] = cardStatementData
        .filter(c => c.closingTotalArs > 0 || c.closingTotalUsd > 0)
        .map(c => {
            // Total ARS value = ARS + (USD * MEP)
            const totalArsValue = c.closingTotalArs + (c.closingTotalUsd * (mepSell ?? 0))
            return {
                id: c.card.id,
                label: `${c.card.bank} ${c.card.name}`,
                dueDate: c.closingStatement.dueDate, // Due in month AFTER close
                amount: totalArsValue > 0 ? totalArsValue : c.closingTotal, // Fallback if no MEP but USD exists
                amountUsd: c.closingTotalUsd,
                type: 'card' as const,
            }
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 5)

    // Calculate days until due for alert
    const unpaidDue = cardStatementData.filter(c => !c.isPaid && c.dueTotal > 0)
    const totalDue = unpaidDue.reduce((sum, c) => sum + c.dueTotal, 0)
    const daysUntilDue = unpaidDue.length > 0 && unpaidDue[0].dueStatement
        ? Math.max(0, Math.ceil(
            (new Date(unpaidDue[0].dueStatement.dueDate).getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
        ))
        : 0

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Premium Alert: Credit Card Due */}
            {unpaidDue.length > 0 && totalDue > 0 && (
                <div className="glass-alert rounded-xl p-5 shadow-glow-warn">
                    <div className="flex items-start gap-4 pl-3">
                        <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-white font-medium mb-1">
                                Tarjeta próxima a vencer
                            </h4>
                            <p className="text-sm text-slate-400 mb-3">
                                Tenés {formatARS(totalDue)} para pagar en {daysUntilDue} días.
                                {unpaidDue.length === 1
                                    ? ` (${unpaidDue[0].card.bank} ${unpaidDue[0].card.name})`
                                    : ` (${unpaidDue.length} tarjetas)`
                                }
                            </p>
                            <button
                                onClick={onGoToDebts}
                                className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm font-medium transition group"
                            >
                                <span>Ir a pagar</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Plan vs Real Comparison Table */}
            <div className="glass-panel rounded-xl p-5">
                <h4 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    Plan vs Real
                </h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left py-2 px-2 text-xs font-mono text-slate-400 uppercase">Concepto</th>
                                <th className="text-right py-2 px-2 text-xs font-mono text-slate-400 uppercase">Plan</th>
                                <th className="text-right py-2 px-2 text-xs font-mono text-slate-400 uppercase">Real</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            <tr>
                                <td className="py-3 px-2 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-emerald-400" />
                                    <span className="text-slate-300">Ingresos</span>
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-emerald-400">
                                    {formatARS(kpis.incomesEstimated)}
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-emerald-300">
                                    {kpis.incomesCollected > 0 ? formatARS(kpis.incomesCollected) : '—'}
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 px-2 flex items-center gap-2">
                                    <TrendingDown className="w-4 h-4 text-rose-400" />
                                    <span className="text-slate-300">Gastos</span>
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-rose-400">
                                    {formatARS(kpis.totalExpensesPlan)}
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-rose-300">
                                    {kpis.totalExpensesReal > 0 ? formatARS(kpis.totalExpensesReal) : '—'}
                                </td>
                            </tr>
                            <tr>
                                <td className="py-3 px-2 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-sky-400" />
                                    <span className="text-slate-300">Tarjetas & Deudas</span>
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-sky-400">
                                    {formatARS(kpis.totalCommitmentsPlan)}
                                </td>
                                <td className="py-3 px-2 text-right font-mono text-sky-300">
                                    {kpis.totalCommitmentsReal > 0 ? formatARS(kpis.totalCommitmentsReal) : '—'}
                                </td>
                            </tr>
                            <tr className="bg-white/5">
                                <td className="py-3 px-2 flex items-center gap-2">
                                    <PiggyBank className="w-4 h-4 text-indigo-400" />
                                    <span className="text-white font-medium">Ahorro</span>
                                </td>
                                <td className={`py-3 px-2 text-right font-mono font-bold ${kpis.savingsEstimated >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                                    {formatARS(kpis.savingsEstimated)}
                                </td>
                                <td className={`py-3 px-2 text-right font-mono font-bold ${kpis.savingsActual >= 0 ? 'text-indigo-300' : 'text-rose-300'}`}>
                                    {kpis.savingsActual !== 0 ? formatARS(kpis.savingsActual) : '—'}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Próximos Vencimientos */}
            {upcomingItems.length > 0 && (
                <div className="glass-panel rounded-xl p-5">
                    <h4 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-400" />
                        Próximos Vencimientos
                    </h4>
                    <div className="space-y-3">
                        {upcomingItems.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.type === 'card' ? 'bg-sky-500/20' :
                                        item.type === 'debt' ? 'bg-amber-500/20' :
                                            item.type === 'expense' ? 'bg-rose-500/20' : 'bg-emerald-500/20'
                                        }`}>
                                        {item.type === 'card' && <CreditCard className="w-4 h-4 text-sky-400" />}
                                        {item.type === 'debt' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                                        {item.type === 'expense' && <TrendingDown className="w-4 h-4 text-rose-400" />}
                                        {item.type === 'income' && <Wallet className="w-4 h-4 text-emerald-400" />}
                                    </div>
                                    <div>
                                        <p className="text-sm text-white">{item.label}</p>
                                        <p className="text-xs text-slate-500">
                                            Vence {formatDayMonth(item.dueDate)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="font-mono text-sm text-white font-medium block">
                                        {formatARS(item.amount)}
                                    </span>
                                    {item.amountUsd && item.amountUsd > 0 && (
                                        <span className="text-[10px] text-emerald-400 font-mono block">
                                            (inc. {formatUSD(item.amountUsd)})
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Insight Tiles Grid (more compact) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Coverage */}
                <div className="glass-panel rounded-xl p-4 text-center">
                    <p className="text-[10px] font-mono text-slate-400 uppercase mb-1">Cobertura</p>
                    <span className={`text-xl font-mono font-bold ${kpis.coverageRatio < 60 ? 'text-emerald-400' :
                        kpis.coverageRatio <= 85 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                        {kpis.coverageRatio.toFixed(0)}%
                    </span>
                </div>
                {/* Fixed Expense Ratio */}
                <div className="glass-panel rounded-xl p-4 text-center">
                    <p className="text-[10px] font-mono text-slate-400 uppercase mb-1">Gastos Fijos</p>
                    <span className="text-xl font-mono font-bold text-white">
                        {kpis.fixedExpenseRatio.toFixed(0)}%
                    </span>
                </div>
                {/* Debt Load */}
                <div className="glass-panel rounded-xl p-4 text-center">
                    <p className="text-[10px] font-mono text-slate-400 uppercase mb-1">Carga Financiera</p>
                    <span className="text-xl font-mono font-bold text-white">
                        {kpis.debtLoadRatio.toFixed(0)}%
                    </span>
                </div>
                {/* Available to Budget */}
                <div className="glass-panel rounded-xl p-4 text-center">
                    <p className="text-[10px] font-mono text-slate-400 uppercase mb-1">Disponible</p>
                    <span className={`text-lg font-mono font-bold ${kpis.availableToBudget >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                        {formatARS(kpis.availableToBudget)}
                    </span>
                </div>
            </div>
        </div>
    )
}
