import { ChevronRight, ClipboardList } from 'lucide-react'
import type { Movement, Instrument } from '@/domain/types'
import { formatMoneyARS, formatMoneyUSD, formatQty } from '@/lib/format'
import { cn } from '@/lib/utils'

interface MovementsTableProps {
    movements: Movement[]
    instruments: Map<string, Instrument>
    accounts: Map<string, { id: string; name: string }>
    isLoading?: boolean
    onRowClick: (movement: Movement) => void
    onNewClick: () => void
}

export function MovementsTable({
    movements,
    instruments,
    accounts,
    isLoading,
    onRowClick,
    onNewClick,
}: MovementsTableProps) {
    const getTypeBadgeClass = (type: string) => {
        if (type === 'BUY') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        if (type === 'SELL') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        if (type === 'DEPOSIT' || type === 'INTEREST' || type === 'DIVIDEND')
            return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
        if (type === 'WITHDRAW' || type === 'FEE')
            return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        return 'bg-white/5 text-slate-300 border border-white/10'
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
            TRANSFER_IN: 'Transf. In',
            TRANSFER_OUT: 'Transf. Out',
        }
        return labels[type] || type
    }

    const formatDate = (iso: string) => {
        const d = new Date(iso)
        const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        return { date, time }
    }

    if (isLoading) {
        return (
            <div className="p-8 text-center text-slate-500">
                <div className="animate-pulse">Cargando movimientos...</div>
            </div>
        )
    }

    // Empty State
    if (movements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <ClipboardList className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-white font-medium text-lg">Todavía no cargaste movimientos</h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mt-2 mb-6">
                    Empezá a registrar tus compras y ventas para ver tu rendimiento real.
                </p>
                <button
                    onClick={onNewClick}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm font-medium border border-white/10 transition"
                >
                    Cargar primer movimiento
                </button>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="text-xs text-slate-500 font-mono uppercase tracking-wider border-b border-white/5 bg-white/[0.02]">
                        <th className="px-6 py-4 font-medium">Fecha</th>
                        <th className="px-6 py-4 font-medium">Operación</th>
                        <th className="px-6 py-4 font-medium">Activo</th>
                        <th className="px-6 py-4 font-medium hidden md:table-cell">Cuenta</th>
                        <th className="px-6 py-4 font-medium text-right">Cantidad</th>
                        <th className="px-6 py-4 font-medium text-right hidden lg:table-cell">Precio</th>
                        <th className="px-6 py-4 font-medium text-right">Total</th>
                        <th className="px-6 py-4 font-medium w-10"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                    {movements.map(m => {
                        const instrument = m.instrumentId ? instruments.get(m.instrumentId) : null
                        const account = accounts.get(m.accountId)
                        const { date, time } = formatDate(m.datetimeISO)

                        return (
                            <tr
                                key={m.id}
                                onClick={() => onRowClick(m)}
                                className="hover:bg-white/[0.02] transition cursor-pointer group"
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                                    {date} <span className="text-slate-600 ml-1">{time}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', getTypeBadgeClass(m.type))}>
                                        {getTypeLabel(m.type)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-300">
                                            {(instrument?.symbol || m.ticker || '').substring(0, 2) || '$$'}
                                        </div>
                                        <div>
                                            <div className="text-white font-bold text-sm font-mono">
                                                {instrument?.symbol || m.ticker || '—'}
                                            </div>
                                            <div className="text-slate-500 text-xs truncate max-w-[100px]">
                                                {instrument?.name || m.assetName || (m.assetClass === 'wallet' ? 'Efectivo' : '—')}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-slate-400 hidden md:table-cell">
                                    {account?.name || '—'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-white">
                                    {m.quantity != null ? formatQty(m.quantity, instrument?.category) : '—'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-slate-400 text-xs hidden lg:table-cell">
                                    {m.unitPrice != null
                                        ? m.tradeCurrency === 'USD'
                                            ? formatMoneyUSD(m.unitPrice)
                                            : formatMoneyARS(m.unitPrice)
                                        : '—'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-white font-medium">
                                    {m.tradeCurrency === 'USD'
                                        ? formatMoneyUSD(m.totalAmount)
                                        : formatMoneyARS(m.totalAmount)}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <button className="p-1.5 hover:bg-white/10 rounded-md text-slate-500 hover:text-white transition opacity-0 group-hover:opacity-100">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
