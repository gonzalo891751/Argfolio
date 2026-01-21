import { Plus, Check, CreditCard as CardIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { CardStatementData } from '../hooks/usePersonalFinancesV3'
import { formatDayMonth } from '../utils/dateHelpers'

interface CreditCardTileProps {
    data: CardStatementData
    onAddConsumption: () => void
    onViewAll: () => void
    onMarkPaid: (paymentDateISO: string) => void
    onMarkUnpaid: () => void
}

function formatMoney(amount: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

export function CreditCardTile({
    data,
    onAddConsumption,
    onViewAll,
    onMarkPaid,
    onMarkUnpaid,
}: CreditCardTileProps) {
    const {
        card,
        closingStatement,
        closingConsumptions,
        closingTotal,
        dueStatement,
        dueTotal,
        isPaid,
    } = data

    // Show max 3 consumptions from the closing period
    const previewConsumptions = closingConsumptions.slice(0, 3)
    const hasMore = closingConsumptions.length > 3

    const handlePaidToggle = (checked: boolean) => {
        if (checked) {
            // Mark as paid with today's date
            const today = new Date().toISOString().split('T')[0]
            onMarkPaid(today)
        } else {
            onMarkUnpaid()
        }
    }

    return (
        <div className="bg-[#151E32] rounded-xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-[#151E32] border-b border-white/5 flex justify-between items-start">
                <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                        {card.bank}
                    </div>
                    <div className="text-white font-medium text-lg">{card.name}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono flex items-center gap-2">
                        <span>**** **** **** {card.last4}</span>
                        {card.network && (
                            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded">
                                {card.network}
                            </span>
                        )}
                    </div>
                </div>
                <CardIcon className="w-8 h-8 text-slate-600" />
            </div>

            {/* Body - Two sections */}
            <div className="divide-y divide-white/5">
                {/* Section 1: Consumos del período (cierra este mes) - DEVENGADO */}
                <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
                            Consumos del período
                        </h4>
                        <span className="text-xs text-slate-500">
                            Cierra {formatDayMonth(closingStatement.closeDate)}
                        </span>
                    </div>

                    {/* Dates for closing statement */}
                    <div className="flex justify-between text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
                        <span>
                            Cierre: <span className="text-white font-mono">{formatDayMonth(closingStatement.closeDate)}</span>
                        </span>
                        <span>
                            Vence: <span className="text-white font-mono">{formatDayMonth(closingStatement.dueDate)}</span>
                        </span>
                    </div>

                    {/* Total of closing statement */}
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">Total devengado</span>
                        <span className="text-lg font-mono text-white font-bold">
                            {formatMoney(closingTotal)}
                        </span>
                    </div>

                    {/* Consumptions Preview */}
                    {closingConsumptions.length > 0 ? (
                        <div className="space-y-2 pt-2 border-t border-white/5">
                            {previewConsumptions.map((c) => (
                                <div key={c.id} className="flex justify-between text-sm">
                                    <span className="text-slate-300 truncate pr-4 max-w-[60%]">
                                        {c.description}
                                    </span>
                                    <div className="flex flex-col items-end">
                                        <span className="font-mono text-slate-200">
                                            {formatMoney(c.amount)}
                                        </span>
                                        {c.installmentTotal && c.installmentIndex && (
                                            <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1 rounded">
                                                Cuota {c.installmentIndex}/{c.installmentTotal}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {hasMore && (
                                <button
                                    onClick={onViewAll}
                                    className="text-xs text-indigo-400 font-medium hover:text-white transition"
                                >
                                    Ver todos los consumos ({closingConsumptions.length})
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="text-sm text-slate-500 text-center py-2">
                            Sin consumos este período
                        </div>
                    )}

                    {/* Add consumption button */}
                    <Button variant="ghost" size="sm" className="w-full" onClick={onAddConsumption}>
                        <Plus className="w-3 h-3 mr-1" />
                        Agregar consumo
                    </Button>
                </div>

                {/* Section 2: Resumen a pagar (vence este mes) - CASHFLOW */}
                <div className="p-4 space-y-3 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wider">
                            Resumen a pagar
                        </h4>
                        <span className="text-xs text-slate-500">
                            Vence {formatDayMonth(dueStatement.dueDate)}
                        </span>
                    </div>

                    {/* Dates for due statement */}
                    <div className="flex justify-between text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
                        <span>
                            Cerró: <span className="text-slate-300 font-mono">{formatDayMonth(dueStatement.closeDate)}</span>
                        </span>
                        <span>
                            Vence: <span className="text-amber-400 font-mono">{formatDayMonth(dueStatement.dueDate)}</span>
                        </span>
                    </div>

                    {dueTotal > 0 ? (
                        <>
                            {/* Total to pay */}
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-slate-400">Total a pagar</span>
                                <span className={`text-xl font-mono font-bold ${isPaid ? 'text-emerald-400 line-through' : 'text-white'}`}>
                                    {formatMoney(dueTotal)}
                                </span>
                            </div>

                            {/* Paid toggle */}
                            <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#0B1121]">
                                <div className="flex items-center gap-2">
                                    {isPaid && <Check className="w-4 h-4 text-emerald-400" />}
                                    <div>
                                        <span className="text-sm font-medium text-white">
                                            {isPaid ? 'Pagada' : 'Marcar como pagada'}
                                        </span>
                                        {isPaid && data.dueStatementRecord?.paidAt && (
                                            <p className="text-xs text-slate-400">
                                                Pagado el {formatDayMonth(data.dueStatementRecord.paidAt)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Switch
                                    checked={isPaid}
                                    onCheckedChange={handlePaidToggle}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="text-sm text-slate-500 text-center py-4">
                            Sin resumen a pagar este mes
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Legacy export for backward compatibility
export { CreditCardTile as default }
