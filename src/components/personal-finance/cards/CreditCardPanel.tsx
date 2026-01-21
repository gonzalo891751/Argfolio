import { useEffect, useState } from 'react'
import { Check, ChevronDown, ExternalLink, FileUp, Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CardStatementData } from '@/features/personal-finances/hooks/usePersonalFinancesV3'
import type { PFCardConsumption } from '@/db/schema'
import {
    addMonthsToYearMonth,
    computeCloseDateForMonth,
    formatDayMonth,
    getTodayISO,
    parseYearMonth,
} from '@/features/personal-finances/utils/dateHelpers'
import { CreditCardPlastic } from './CreditCardPlastic'
import { CreditCardSummary } from './CreditCardSummary'

interface CreditCardPanelProps {
    data: CardStatementData
    onAddConsumption: () => void
    onImportStatement: () => void
    onDeleteConsumption: (consumptionId: string) => void
    onEditConsumption: (consumption: PFCardConsumption) => void
    onMarkUnpaid: () => void
    onRegisterPayment: () => void
    mepSell?: number | null
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
})

function formatMoney(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
    const formatted = arsFormatter.format(amount)
    return currency === 'USD' ? `USD ${formatted}` : formatted
}

function getNextCloseDateISO(closeDay: number): string {
    const todayISO = getTodayISO()
    const todayYearMonth = todayISO.slice(0, 7)
    const { year, month } = parseYearMonth(todayYearMonth)
    const closeDateThisMonth = computeCloseDateForMonth(closeDay, year, month)

    if (todayISO <= closeDateThisMonth) {
        return closeDateThisMonth
    }

    const nextYearMonth = addMonthsToYearMonth(todayYearMonth, 1)
    const { year: nextYear, month: nextMonth } = parseYearMonth(nextYearMonth)
    return computeCloseDateForMonth(closeDay, nextYear, nextMonth)
}

function getDaysUntil(dateISO: string): number {
    const todayISO = getTodayISO()
    const today = new Date(`${todayISO}T00:00:00`)
    const target = new Date(`${dateISO}T00:00:00`)
    const diffMs = target.getTime() - today.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

export function CreditCardPanel({
    data,
    onAddConsumption,
    onImportStatement,
    onDeleteConsumption,
    onEditConsumption,
    onMarkUnpaid,
    onRegisterPayment,
    mepSell,
}: CreditCardPanelProps) {
    const {
        card,
        closingStatement,
        closingConsumptions,
        closingTotal,
        closingTotalArs,
        closingTotalUsd,
        dueStatement,
        dueStatementRecord,
        dueTotal,
        isPaid,
    } = data

    const previewLimit = 5
    const [isExpanded, setIsExpanded] = useState(false)
    const [consumptionToDelete, setConsumptionToDelete] = useState<PFCardConsumption | null>(null)
    const visibleConsumptions = isExpanded
        ? closingConsumptions
        : closingConsumptions.slice(0, previewLimit)
    const hasMore = closingConsumptions.length > previewLimit

    useEffect(() => {
        if (!consumptionToDelete) return
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setConsumptionToDelete(null)
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [consumptionToDelete])

    const nextCloseDateISO = getNextCloseDateISO(card.closingDay)
    const closingInDays = getDaysUntil(nextCloseDateISO)

    const limitTotal =
        (card as { limitTotal?: number }).limitTotal ??
        (card as { creditLimit?: number }).creditLimit
    const limitUsedPercent = limitTotal ? (closingTotal / limitTotal) * 100 : undefined

    return (
        <div className="glass-panel rounded-2xl p-1 overflow-hidden transition-all duration-500 border border-white/10">
            <div className="relative bg-slate-900/50 rounded-xl p-6 md:p-8">
                <div className="flex flex-col xl:flex-row gap-6 items-start">
                    <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center flex-1">
                        <CreditCardPlastic
                            title={card.name}
                            holderName={card.bank}
                            last4={card.last4}
                            network={card.network}
                        />

                        <CreditCardSummary
                            arsAmount={closingTotalArs}
                            usdAmount={closingTotalUsd}
                            mepSell={mepSell}
                            closingInDays={closingInDays}
                            limitTotal={limitTotal}
                            limitUsedPercent={limitUsedPercent}
                        />
                    </div>

                    <div className="w-full xl:w-auto">
                        <button
                            onClick={onImportStatement}
                            className="group relative w-full xl:w-auto px-5 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                        >
                            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <FileUp className="w-5 h-5" />
                            <span>Importar Resumen (PDF)</span>
                        </button>
                        <div className="text-right mt-2 text-xs text-slate-500">
                            Soporta Visa/Master • PDF nativo
                        </div>
                    </div>
                </div>

                <div className="h-px bg-white/5 w-full my-8" />

                <div className="grid lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-display text-lg text-white">Consumos del período</h4>
                                <span className="text-xs text-slate-500">
                                    Cierra {formatDayMonth(closingStatement.closeDate)} • Vence {formatDayMonth(closingStatement.dueDate)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onAddConsumption}
                                    className="p-2 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition"
                                    title="Agregar consumo"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {closingConsumptions.length > 0 ? (
                            <div
                                className={`space-y-3 overflow-hidden transition-all duration-500 ${isExpanded ? 'max-h-[900px] opacity-100' : 'max-h-[420px] opacity-95'
                                    }`}
                            >
                                {visibleConsumptions.map((c) => (
                                    <div
                                        key={c.id}
                                        className="relative flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition border border-transparent hover:border-white/5 group"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-medium text-white truncate max-w-[240px]">
                                                    {c.description}
                                                </div>
                                                {c.isRecurring && (
                                                    <span title="Consumo recurrente" className="text-indigo-400">
                                                        <RefreshCw size={12} />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {formatDayMonth(c.purchaseDateISO)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <div className="font-mono text-sm text-white font-medium">
                                                    {formatMoney(c.amount, c.currency)}
                                                </div>
                                                {c.installmentTotal && c.installmentIndex && (
                                                    <div className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded inline-block">
                                                        Cuota {c.installmentIndex}/{c.installmentTotal}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">

                                                {!c.id.includes('::') && (
                                                    <>
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                onEditConsumption(c)
                                                            }}
                                                            className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-white/5 rounded transition"
                                                            aria-label="Editar consumo"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                setConsumptionToDelete(c)
                                                            }}
                                                            className="p-1.5 text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 rounded transition"
                                                            aria-label="Eliminar consumo"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-500 text-center py-6 border border-white/5 rounded-lg bg-slate-900/40">
                                Sin consumos este período
                            </div>
                        )}

                        {hasMore && (
                            <button
                                onClick={() => setIsExpanded(prev => !prev)}
                                className="w-full py-2 flex items-center justify-center gap-2 text-sm text-indigo-400 font-medium hover:bg-indigo-500/10 rounded-lg transition"
                            >
                                <span>
                                    {isExpanded ? 'Ver menos' : `Ver todos (${closingConsumptions.length})`}
                                </span>
                                <ChevronDown
                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                />
                            </button>
                        )}

                        <Button variant="ghost" size="sm" className="w-full" onClick={onAddConsumption}>
                            <Plus className="w-3 h-3 mr-1" />
                            Agregar consumo
                        </Button>
                    </div>


                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-display text-lg text-white">A pagar este mes</h4>
                                <span className="text-xs text-slate-500">
                                    Cierre anterior • Vence {formatDayMonth(dueStatement.dueDate)}
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-between text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg border border-white/5">
                            <span>
                                Cierre:{' '}
                                <span className="text-slate-200 font-mono">
                                    {formatDayMonth(dueStatement.closeDate)}
                                </span>
                            </span>
                            <span>
                                Vence:{' '}
                                <span className="text-amber-400 font-mono">
                                    {formatDayMonth(dueStatement.dueDate)}
                                </span>
                            </span>
                        </div>

                        {dueTotal > 0 ? (
                            <>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Total a pagar</span>
                                    <span
                                        className={`text-xl font-mono font-bold ${isPaid ? 'text-emerald-400 line-through' : 'text-white'}`}
                                    >
                                        {formatMoney(dueTotal)}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#0B1121]">
                                        <div className="flex items-center gap-2">
                                            {isPaid && <Check className="w-4 h-4 text-emerald-400" />}
                                            <div>
                                                <span className="text-sm font-medium text-white">
                                                    {isPaid ? 'Pagada' : 'Resumen pendiente'}
                                                </span>
                                                {isPaid && dueStatementRecord?.paidAt && (
                                                    <p className="text-xs text-slate-400">
                                                        Pagado el {formatDayMonth(dueStatementRecord.paidAt)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {isPaid ? (
                                            <button
                                                onClick={onMarkUnpaid}
                                                className="text-xs text-rose-300 hover:text-rose-200"
                                            >
                                                Revertir
                                            </button>
                                        ) : (
                                            <button
                                                onClick={onRegisterPayment}
                                                className="text-xs text-indigo-300 hover:text-indigo-200"
                                            >
                                                Registrar pago
                                            </button>
                                        )}
                                    </div>

                                    {isPaid && dueStatementRecord?.paymentMovementId && (
                                        <a
                                            href="/movements"
                                            className="text-xs text-sky-400 inline-flex items-center gap-1 hover:text-sky-300"
                                        >
                                            Ver movimiento
                                            <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-slate-500 text-center py-6 border border-white/5 rounded-lg bg-slate-900/40">
                                Sin resumen a pagar este mes
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {consumptionToDelete && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setConsumptionToDelete(null)}
                    />
                    <div className="relative bg-[#151E32] border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full">
                        <h3 className="text-lg font-medium text-white mb-2">¿Borrar consumo?</h3>
                        <p className="text-sm text-slate-400 mb-6">
                            Esta acción no se puede deshacer. Se descontará del total del período.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setConsumptionToDelete(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    onDeleteConsumption(consumptionToDelete.id)
                                    setConsumptionToDelete(null)
                                }}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium transition"
                            >
                                Borrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
