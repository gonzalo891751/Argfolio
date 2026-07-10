import { Fragment } from 'react'
import { ChevronRight, ClipboardList, ArrowLeftRight, Repeat2, Link2 } from 'lucide-react'
import type { Movement, Instrument, Account } from '@/domain/types'
import type { OperationGroup } from '@/domain/operations/operation'
import { formatMoneyARS, formatMoneyUSD, formatQty } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getMovementAssetDisplay } from './utils'
import type { DisplayRow } from './movements-view'

interface MovementsTableProps {
    rows: DisplayRow[]
    instruments: Map<string, Instrument>
    accounts: Map<string, Account>
    isLoading?: boolean
    onRowClick: (movement: Movement) => void
    onNewClick: () => void
    /** Total movements before filters (for "no results with filters" empty state) */
    totalUnfiltered?: number
}

function getTypeBadgeClass(m: Movement) {
    if (m.assetClass === 'pf') {
        if (m.type === 'BUY') return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
        if (m.type === 'SELL') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    }

    const type = m.type
    if (type === 'BUY') return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    if (type === 'SELL') return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    if (type === 'DEPOSIT' || type === 'INTEREST' || type === 'DIVIDEND')
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    if (type === 'WITHDRAW' || type === 'FEE')
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
    if (type === 'TRANSFER_IN' || type === 'TRANSFER_OUT')
        return 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
    return 'bg-white/5 text-slate-300 border border-white/10'
}

function getTypeLabel(m: Movement) {
    if (m.assetClass === 'pf') {
        if (m.type === 'BUY') return 'PF'
        if (m.type === 'SELL') return 'Rescate'
    }

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
    return labels[m.type] || m.type
}

function formatDateParts(iso: string) {
    const d = new Date(iso)
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    return { date, time }
}

function describeGroup(
    group: OperationGroup,
    accounts: Map<string, Account>
): { title: string; subtitle: string; icon: 'transfer' | 'swap' | 'link' } {
    const legs = group.legs

    if (group.kind === 'transfer') {
        const out = legs.find(l => l.type === 'TRANSFER_OUT')
        const inn = legs.find(l => l.type === 'TRANSFER_IN')
        const symbol = out?.ticker || inn?.ticker || ''
        const fromName = out ? (accounts.get(out.accountId)?.name ?? out.accountId) : '—'
        const toName = inn ? (accounts.get(inn.accountId)?.name ?? inn.accountId) : '—'
        const qty = out?.quantity
        return {
            title: `Transferencia ${symbol}`.trim(),
            subtitle: `${fromName} → ${toName}${qty != null ? ` · ${formatQty(qty, 'CRYPTO')} ${symbol}` : ''}`,
            icon: 'transfer',
        }
    }

    if (group.kind === 'swap') {
        const sources = legs.filter(l => l.meta?.legRole === 'source' || l.type === 'SELL')
        const dest = legs.find(l => l.meta?.legRole === 'destination') ?? legs.find(l => l.type === 'BUY')
        const srcSymbols = [...new Set(sources.map(s => s.ticker).filter(Boolean))].join(' + ')
        const destSymbol = dest?.ticker ?? ''
        const accountName = accounts.get(legs[0].accountId)?.name ?? legs[0].accountId
        return {
            title: `Swap ${srcSymbols || '?'} → ${destSymbol || '?'}`,
            subtitle: `${accountName}${dest?.quantity != null ? ` · +${formatQty(dest.quantity, 'CRYPTO')} ${destSymbol}` : ''}`,
            icon: 'swap',
        }
    }

    const accountName = accounts.get(legs[0].accountId)?.name ?? legs[0].accountId
    return {
        title: `Operación vinculada (${legs.length} patas)`,
        subtitle: accountName,
        icon: 'link',
    }
}

function MovementRow({
    movement: m,
    instruments,
    accounts,
    onRowClick,
    inGroup = false,
}: {
    movement: Movement
    instruments: Map<string, Instrument>
    accounts: Map<string, Account>
    onRowClick: (m: Movement) => void
    inGroup?: boolean
}) {
    const instrument = m.instrumentId ? instruments.get(m.instrumentId) : null
    const account = m.accountId ? accounts.get(m.accountId) : undefined
    const display = getMovementAssetDisplay(m, instrument, account)
    const { date, time } = formatDateParts(m.datetimeISO)
    const status = m.meta?.operationStatus ?? 'posted'
    const statusLabel = status === 'superseded' ? 'Reemplazado' : status === 'voided' ? 'Anulado' : null

    return (
        <tr
            onClick={() => onRowClick(m)}
            className={cn(
                'hover:bg-white/[0.02] transition cursor-pointer group',
                inGroup && 'bg-white/[0.015]'
            )}
        >
            <td className={cn(
                'px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs',
                inGroup && 'pl-10 border-l-2 border-l-sky-500/30'
            )}>
                {date} <span className="text-slate-600 ml-1">{time}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex flex-wrap gap-1.5">
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', getTypeBadgeClass(m))}>
                        {getTypeLabel(m)}
                    </span>
                    {statusLabel && (
                        <span className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                            status === 'superseded'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        )}>
                            {statusLabel}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-slate-300">
                        {display.symbol.substring(0, 2)}
                    </div>
                    <div>
                        <div className="text-white font-bold text-sm font-mono">
                            {display.title}
                        </div>
                        <div className="text-slate-500 text-xs truncate max-w-[100px]">
                            {display.subtitle}
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
}

export function MovementsTable({
    rows,
    instruments,
    accounts,
    isLoading,
    onRowClick,
    onNewClick,
    totalUnfiltered = 0,
}: MovementsTableProps) {
    if (isLoading) {
        return (
            <div className="p-8 text-center text-slate-500">
                <div className="animate-pulse">Cargando movimientos...</div>
            </div>
        )
    }

    // Empty State
    if (rows.length === 0) {
        const hasDataButFiltered = totalUnfiltered > 0
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <ClipboardList className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-white font-medium text-lg">
                    {hasDataButFiltered ? 'Sin resultados con estos filtros' : 'Todavía no cargaste movimientos'}
                </h3>
                <p className="text-slate-400 text-sm max-w-sm mx-auto mt-2 mb-6">
                    {hasDataButFiltered
                        ? 'Probá ampliar el rango de fechas o limpiar los filtros.'
                        : 'Empezá a registrar tus compras y ventas para ver tu rendimiento real.'}
                </p>
                {!hasDataButFiltered && (
                    <button
                        onClick={onNewClick}
                        className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm font-medium border border-white/10 transition"
                    >
                        Cargar primer movimiento
                    </button>
                )}
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
                    {rows.map(row => {
                        if (row.kind === 'single') {
                            return (
                                <MovementRow
                                    key={row.movement.id}
                                    movement={row.movement}
                                    instruments={instruments}
                                    accounts={accounts}
                                    onRowClick={onRowClick}
                                />
                            )
                        }

                        // Group: header row + leg rows
                        const { group } = row
                        const desc = describeGroup(group, accounts)
                        const { date, time } = formatDateParts(row.datetimeISO)
                        const GroupIcon = desc.icon === 'transfer' ? ArrowLeftRight : desc.icon === 'swap' ? Repeat2 : Link2

                        return (
                            <Fragment key={`group-${group.operationId}`}>
                                <tr className="bg-sky-500/[0.04] border-t border-sky-500/10">
                                    <td className="px-6 py-2.5 whitespace-nowrap text-slate-400 font-mono text-xs">
                                        {date} <span className="text-slate-600 ml-1">{time}</span>
                                    </td>
                                    <td colSpan={6} className="px-6 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <GroupIcon className="w-3.5 h-3.5 text-sky-400" />
                                            <span className="text-sky-400 text-xs font-bold uppercase tracking-wide">
                                                {desc.title}
                                            </span>
                                            <span className="text-slate-500 text-xs">
                                                {desc.subtitle}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-mono ml-auto">
                                                {group.legs.length} patas
                                            </span>
                                            {group.status !== 'posted' && (
                                                <span className={cn(
                                                    'text-[10px] font-bold rounded-full border px-2 py-0.5',
                                                    group.status === 'superseded'
                                                        ? 'text-amber-300 border-amber-500/20 bg-amber-500/10'
                                                        : group.status === 'voided'
                                                            ? 'text-rose-300 border-rose-500/20 bg-rose-500/10'
                                                            : 'text-sky-300 border-sky-500/20 bg-sky-500/10'
                                                )}>
                                                    {group.status === 'superseded'
                                                        ? 'Reemplazado'
                                                        : group.status === 'voided'
                                                            ? 'Anulado'
                                                            : 'Estado mixto'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td></td>
                                </tr>
                                {group.legs.map(leg => (
                                    <MovementRow
                                        key={leg.id}
                                        movement={leg}
                                        instruments={instruments}
                                        accounts={accounts}
                                        onRowClick={onRowClick}
                                        inGroup
                                    />
                                ))}
                            </Fragment>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
