import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, Edit, Trash2 } from 'lucide-react'
import type { Movement, Instrument, Account } from '@/domain/types'
import { formatMoneyARS, formatMoneyUSD, formatQty } from '@/lib/format'
import { getMovementAssetDisplay } from './utils'

interface MovementDetailsDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    movement: Movement | null
    instrument?: Instrument | null
    account?: Account | null
    onDuplicate?: (movement: Movement) => void
    onEdit?: (movement: Movement) => void
    onDelete?: (movementId: string) => void
}

export function MovementDetailsDrawer({
    open,
    onOpenChange,
    movement,
    instrument,
    account,
    onDuplicate,
    onEdit,
    onDelete,
}: MovementDetailsDrawerProps) {
    // ESC to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false)
        }
        if (open) {
            document.addEventListener('keydown', handleEsc)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = ''
        }
    }, [open, onOpenChange])

    if (!open || !movement) return null

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleString('es-AR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        })
    }

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            BUY: 'Compra',
            SELL: 'Venta',
            DEPOSIT: 'Depósito',
            WITHDRAW: 'Retiro',
            DIVIDEND: 'Dividendo',
            INTEREST: 'Interés',
            FEE: 'Comisión',
        }

        if (movement.assetClass === 'pf') {
            if (type === 'BUY') return 'PF'
            if (type === 'SELL') return 'Rescate'
        }

        return labels[type] || type
    }

    // Calculate historical totals
    const totalNative = movement.totalAmount
    const fx = movement.fx?.rate || movement.fxAtTrade || 1
    const totalARS = movement.tradeCurrency === 'ARS' ? totalNative : totalNative * fx
    const totalUSD = movement.tradeCurrency === 'USD' ? totalNative : totalNative / fx

    // ... (in component)
    const assetDisplay = getMovementAssetDisplay(movement, instrument, account)

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity animate-in fade-in duration-200"
                onClick={() => onOpenChange(false)}
            />

            {/* Drawer */}
            <aside
                className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0F172A] border-l border-white/10 z-[101] transition-transform duration-300 ease-out shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0F172A]">
                    <h2 className="font-display text-lg font-bold text-white">Detalle de Operación</h2>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Asset Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <span className="font-display font-bold text-2xl text-white">
                                {(assetDisplay.symbol).substring(0, 2) || '$$'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-display text-2xl font-bold text-white">
                                {assetDisplay.title}
                            </h3>
                            <p className="text-slate-400 text-sm">{assetDisplay.subtitle}</p>
                            <span className="inline-block mt-2 px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-white/10">
                                {assetDisplay.category}
                            </span>
                        </div>
                    </div>

                    {/* SPECIAL PF BREAKDOWN */}
                    {(movement.meta?.fixedDeposit || movement.pf) && (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                            <h4 className="text-amber-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                Detalle Plazo Fijo
                            </h4>

                            {/* Key Figures */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-400">Capital Orig.</div>
                                    <div className="text-white font-mono font-medium">
                                        {formatMoneyARS(movement.meta?.fixedDeposit?.principalARS ?? movement.pf?.capitalARS ?? 0)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-400">Interés Ganado</div>
                                    <div className="text-emerald-400 font-mono font-medium">
                                        +{formatMoneyARS(movement.meta?.fixedDeposit?.interestARS ?? movement.pf?.interestARS ?? 0)}
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-amber-500/10" />

                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-slate-500">TNA</span>
                                    <div className="text-white font-mono">
                                        {movement.meta?.fixedDeposit?.tna ?? movement.pf?.tna ?? 0}%
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500">Plazo</span>
                                    <div className="text-white font-mono">
                                        {movement.meta?.fixedDeposit?.termDays ?? movement.pf?.termDays ?? 0} días
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500">Constitución</span>
                                    <div className="text-white font-mono">
                                        {movement.meta?.fixedDeposit?.startDate ? formatDate(movement.meta.fixedDeposit.startDate).split(',')[0] : '—'}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-slate-500">Vencimiento</span>
                                    <div className="text-white font-mono">
                                        {movement.meta?.fixedDeposit?.maturityDate ? formatDate(movement.meta.fixedDeposit.maturityDate).split(',')[0] : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Standard Details Card */}
                    <div className="p-4 rounded-xl bg-slate-900 border border-white/5 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Operación</span>
                            <span className="text-white font-medium">{getTypeLabel(movement.type)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Fecha</span>
                            <span className="text-white font-mono">{formatDate(movement.datetimeISO)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Cuenta</span>
                            <span className="text-white">{account?.name || '—'}</span>
                        </div>
                        <div className="h-px bg-white/5 my-2" />
                        <div className="flex justify-between items-end">
                            <span className="text-slate-500 text-sm">Total Operado</span>
                            <div className="text-right">
                                <div className="text-xl font-mono font-bold text-indigo-400">
                                    {movement.tradeCurrency === 'USD'
                                        ? formatMoneyUSD(totalNative)
                                        : formatMoneyARS(totalNative)}
                                </div>
                                <div className="text-xs text-slate-500 font-mono">
                                    Qty: {movement.quantity != null ? formatQty(movement.quantity, instrument?.category) : '—'} @{' '}
                                    {movement.unitPrice != null ? movement.unitPrice : '—'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Historical Totals */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-slate-500 uppercase mb-1">Total ARS Hist.</div>
                            <div className="font-mono text-white text-sm">{formatMoneyARS(totalARS)}</div>
                        </div>
                        <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-slate-500 uppercase mb-1">Total USD Hist.</div>
                            <div className="font-mono text-white text-sm">{formatMoneyUSD(totalUSD)}</div>
                        </div>
                    </div>

                    {/* FX Applied */}
                    <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02] flex justify-between items-center">
                        <span className="text-xs text-slate-500 uppercase">FX Aplicado</span>
                        <span className="font-mono text-emerald-400 text-sm">
                            {movement.fx?.kind || 'MEP'} ${Math.round(fx)}
                        </span>
                    </div>

                    {/* Notes */}
                    {movement.notes && (
                        <div className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                            <div className="text-xs text-slate-500 uppercase mb-1">Notas</div>
                            <div className="text-white text-sm">{movement.notes}</div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-[#0F172A] flex gap-3">
                    <button
                        onClick={() => onDelete?.(movement.id)}
                        className="px-3 py-2.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition"
                        title="Eliminar movimiento"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onEdit?.(movement)}
                        className="flex-1 py-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 text-sm font-medium transition flex items-center justify-center gap-2"
                    >
                        <Edit className="w-4 h-4" />
                        Editar
                    </button>
                    <button
                        onClick={() => onDuplicate?.(movement)}
                        className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 shadow-lg text-sm font-medium transition flex items-center justify-center gap-2"
                    >
                        <Copy className="w-4 h-4" />
                        Duplicar
                    </button>
                </div>
            </aside>
        </>,
        document.body
    )
}
