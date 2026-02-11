import { useBudget } from './use-budget'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useEffect } from 'react'

function fmt(n: number): string {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function FinanzasExpressNative() {
    const budget = useBudget()
    const { data: fxRates } = useFxRates()

    // Keep FX in sync with Argfolio rates
    useEffect(() => {
        if (fxRates?.oficial?.buy && fxRates?.oficial?.sell) {
            budget.updateFx(fxRates.oficial.buy, fxRates.oficial.sell)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fxRates?.oficial?.buy, fxRates?.oficial?.sell])

    const { state } = budget

    return (
        <div className="space-y-4 p-4 max-w-2xl mx-auto">
            {/* Preview banner */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                Vista nativa (preview) — funcionalidad completa disponible en modo iframe
            </div>

            {/* FX */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Oficial: C ${state.fxCompra} / V ${state.fxVenta}</span>
            </div>

            {/* Summary card */}
            <div className="rounded-2xl border bg-card p-5 space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resumen General</h2>

                <Row label="Tarjetas" value={budget.cardsBal} color="text-violet-500" />
                <Row label="Servicios" value={budget.servicesTotal} color="text-cyan-500" />
                <Row label="Planificados" value={budget.plannedTotal} color="text-fuchsia-500" />
                <Row label="Ahorro" value={state.savings} color="text-amber-500" />

                <div className="border-t pt-3">
                    <Row label="Total gastos" value={budget.expenseTotal} color="text-destructive" bold />
                </div>

                <Row label="Ingresos" value={budget.incomeTotal} color="text-emerald-500" bold />

                {budget.executedTotal > 0 && (
                    <Row label="Pagos ejecutados" value={-budget.executedTotal} color="text-muted-foreground" />
                )}

                <div className="border-t pt-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Disponible</span>
                        <span className={`text-xl font-bold ${budget.available >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                            {fmt(budget.available)}
                        </span>
                    </div>
                    <p className={`text-xs mt-1 ${budget.available >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {budget.available >= 0
                            ? 'Disponible para gastar'
                            : `Te faltan ${fmt(Math.abs(budget.available))}`}
                    </p>
                </div>
            </div>

            {/* Cards list */}
            {state.cards.length > 0 && (
                <Section title="Tarjetas" color="border-l-violet-500">
                    {state.cards.map((c) => (
                        <div key={c.id} className="flex items-center justify-between py-1.5">
                            <span className="text-sm">{c.name}</span>
                            <span className="text-sm font-medium">{fmt(c.totalArs)}</span>
                        </div>
                    ))}
                </Section>
            )}

            {/* Services list */}
            {state.services.length > 0 && (
                <Section title="Servicios" color="border-l-cyan-500">
                    {state.services.map((s) => (
                        <div key={s.id} className={`flex items-center justify-between py-1.5 ${s.paid ? 'opacity-40 line-through' : ''}`}>
                            <span className="text-sm">{s.name}</span>
                            <span className="text-sm font-medium">{fmt(s.amount - (s.discount || 0))}</span>
                        </div>
                    ))}
                </Section>
            )}

            {/* Incomes list */}
            {state.incomes.length > 0 && (
                <Section title="Ingresos" color="border-l-emerald-500">
                    {state.incomes.map((inc) => (
                        <div key={inc.id} className="flex items-center justify-between py-1.5">
                            <span className="text-sm">{inc.name}</span>
                            <span className="text-sm font-medium text-emerald-500">{fmt(inc.amount)}</span>
                        </div>
                    ))}
                </Section>
            )}
        </div>
    )
}

function Row({ label, value, color, bold }: { label: string; value: number; color: string; bold?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className={`text-sm ${bold ? 'font-semibold' : ''}`}>{label}</span>
            <span className={`text-sm ${bold ? 'font-semibold' : 'font-medium'} ${color}`}>{fmt(value)}</span>
        </div>
    )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
    return (
        <div className={`rounded-2xl border bg-card p-4 border-l-4 ${color}`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h3>
            {children}
        </div>
    )
}
