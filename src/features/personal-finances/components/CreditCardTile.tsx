import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PFCreditCard, PFCardConsumption } from '@/db/schema'
import { getStatementDates, formatDayMonth } from '../utils/dateHelpers'

interface CreditCardTileProps {
    card: PFCreditCard
    consumptions: PFCardConsumption[]
    yearMonth: string
    onAddConsumption: () => void
    onViewAll: () => void
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
    card,
    consumptions,
    yearMonth,
    onAddConsumption,
    onViewAll,
}: CreditCardTileProps) {
    const total = consumptions.reduce((sum, c) => sum + c.amount, 0)
    const { closingDate, dueDate } = getStatementDates(yearMonth, card.closingDay, card.dueDay)

    // Show max 3 consumptions
    const previewConsumptions = consumptions.slice(0, 3)
    const hasMore = consumptions.length > 3

    return (
        <div className="bg-[#151E32] rounded-xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 to-[#151E32] border-b border-white/5 flex justify-between items-start">
                <div>
                    <div className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                        {card.bank}
                    </div>
                    <div className="text-white font-medium text-lg">{card.name}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">
                        **** **** **** {card.last4}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-400">Total a Pagar</div>
                    <div className="text-xl font-mono text-white font-bold">
                        {formatMoney(total)}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
                {/* Dates */}
                <div className="flex justify-between text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
                    <span>
                        Cierre: <span className="text-white">{formatDayMonth(closingDate)}</span>
                    </span>
                    <span>
                        Vence: <span className="text-white">{formatDayMonth(dueDate)}</span>
                    </span>
                </div>

                {/* Consumptions Preview */}
                {consumptions.length > 0 ? (
                    <div className="space-y-2 pt-2">
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
                    </div>
                ) : (
                    <div className="text-sm text-slate-500 text-center py-2">
                        Sin consumos este mes
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 bg-slate-900/30 flex justify-between items-center">
                {hasMore || consumptions.length > 0 ? (
                    <button
                        onClick={onViewAll}
                        className="text-xs text-indigo-400 font-medium hover:text-white transition"
                    >
                        Ver todos los consumos
                    </button>
                ) : (
                    <span />
                )}
                <Button variant="ghost" size="sm" onClick={onAddConsumption}>
                    <Plus className="w-3 h-3 mr-1" />
                    Agregar consumo
                </Button>
            </div>
        </div>
    )
}
