// =============================================================================
// UPCOMING MATURITIES COMPONENT
// =============================================================================

import { Calendar, CreditCard, Landmark, CheckCircle2, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatARS, getDaysMessage } from '../models/calculations'
import type { UpcomingItem } from '../models/types'

interface UpcomingMaturitiesProps {
    items: UpcomingItem[]
    referenceDate: Date
    onMarkPaid?: (id: string, type: 'debt' | 'expense' | 'card') => void
}

export function UpcomingMaturities({
    items,
    referenceDate,
    onMarkPaid,
}: UpcomingMaturitiesProps) {
    return (
        <div className="bg-card/50 border border-border rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Calendar className="text-primary" size={18} />
                    <h3 className="text-foreground font-medium">Próximos Vencimientos</h3>
                </div>
                <button className="text-xs text-primary hover:text-foreground transition">
                    Ver calendario completo →
                </button>
            </div>

            <div className="space-y-3">
                {items.length > 0 ? (
                    items.map((item) => (
                        <UpcomingMaturityRow
                            key={item.id}
                            item={item}
                            referenceDate={referenceDate}
                            onMarkPaid={onMarkPaid ? () => onMarkPaid(item.id, item.type) : undefined}
                        />
                    ))
                ) : (
                    <EmptyState />
                )}
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Row Component
// -----------------------------------------------------------------------------

interface UpcomingMaturityRowProps {
    item: UpcomingItem
    referenceDate: Date
    onMarkPaid?: () => void
}

function UpcomingMaturityRow({ item, referenceDate, onMarkPaid }: UpcomingMaturityRowProps) {
    const daysMessage = getDaysMessage(item.dueDay, referenceDate)
    const isUrgent = item.dueDay - referenceDate.getDate() <= 2 && item.status !== 'paid'
    const isPaid = item.status === 'paid'

    return (
        <div
            className={cn(
                'flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-border/80 transition group',
                isPaid && 'opacity-60'
            )}
        >
            <div className="flex items-center gap-4">
                <div
                    className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border',
                        item.type === 'debt'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : item.type === 'card'
                                ? 'bg-primary/10 border-primary/20 text-primary'
                                : 'bg-muted border-border text-muted-foreground'
                    )}
                >
                    {item.type === 'debt' || item.type === 'card' ? <CreditCard size={18} /> : <Landmark size={18} />}
                </div>
                <div>
                    <div className="text-sm text-foreground font-medium">{item.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{item.type === 'debt' ? 'Cuota' : item.type === 'card' ? 'Tarjeta' : 'Servicio'}</span>
                        <span className="w-1 h-1 rounded-full bg-muted" />
                        <span className={cn(isUrgent && 'text-amber-400 font-bold')}>
                            {daysMessage}
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <div className="font-mono text-sm text-foreground">{formatARS(item.amount)}</div>
                    {item.installmentInfo && (
                        <div className="text-[10px] text-muted-foreground">
                            {item.installmentInfo}
                        </div>
                    )}
                </div>
                {item.type !== 'card' && onMarkPaid && (
                    <button
                        onClick={onMarkPaid}
                        className={cn(
                            'p-2 rounded-full border transition-all',
                            isPaid
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'bg-transparent border-border text-muted-foreground hover:text-emerald-400 hover:border-emerald-400'
                        )}
                        title="Marcar como pagado"
                    >
                        <CheckCircle2 size={16} />
                    </button>
                )}
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Empty State
// -----------------------------------------------------------------------------

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-border rounded-xl bg-muted/5">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
                <Target size={24} />
            </div>
            <h3 className="text-foreground font-medium mb-1">Todo al día</h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
                No tenés vencimientos próximos para este mes.
            </p>
        </div>
    )
}
