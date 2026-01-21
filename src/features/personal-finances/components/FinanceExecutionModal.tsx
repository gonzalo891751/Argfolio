// =============================================================================
// Finance Execution Modal
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/hooks/use-instruments'
import { formatARS } from '../models/calculations'

interface FinanceExecutionModalProps {
    open: boolean
    title: string
    subtitle?: string
    defaultAmount: number
    defaultDateISO: string
    defaultAccountId?: string
    onClose: () => void
    onConfirm: (payload: {
        amount: number
        dateISO: string
        accountId?: string
        createMovement: boolean
    }) => Promise<void>
}

export function FinanceExecutionModal({
    open,
    title,
    subtitle,
    defaultAmount,
    defaultDateISO,
    defaultAccountId,
    onClose,
    onConfirm,
}: FinanceExecutionModalProps) {
    const { data: accounts = [] } = useAccounts()
    const [amount, setAmount] = useState(defaultAmount)
    const [dateISO, setDateISO] = useState(defaultDateISO)
    const [accountId, setAccountId] = useState(defaultAccountId || '')
    const [createMovement, setCreateMovement] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (!open) return
        setAmount(defaultAmount)
        setDateISO(defaultDateISO)
        setAccountId(defaultAccountId || '')
        setCreateMovement(true)
        setIsSubmitting(false)
    }, [open, defaultAmount, defaultDateISO, defaultAccountId])

    const canSubmit = useMemo(() => {
        if (!amount || amount <= 0) return false
        if (!dateISO) return false
        if (createMovement && !accountId) return false
        return true
    }, [amount, dateISO, accountId, createMovement])

    if (!open) return null

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                    <div>
                        <h3 className="text-sm font-medium text-foreground">Registrar movimiento</h3>
                        <p className="text-xs text-muted-foreground">{title}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Resumen</span>
                            <span className="font-mono text-foreground">{formatARS(amount)}</span>
                        </div>
                        {subtitle && (
                            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
                        )}
                    </div>

                    <div className="grid gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-mono text-muted-foreground uppercase">Fecha</Label>
                            <input
                                type="date"
                                value={dateISO}
                                onChange={(e) => setDateISO(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-mono text-muted-foreground uppercase">Monto</Label>
                            <input
                                type="number"
                                min={0}
                                value={Number.isFinite(amount) ? amount : 0}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                className="w-full bg-background border border-border rounded-lg py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                            <span className="text-muted-foreground">Crear movimiento</span>
                            <input
                                type="checkbox"
                                checked={createMovement}
                                onChange={(e) => setCreateMovement(e.target.checked)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-mono text-muted-foreground uppercase">
                                Cuenta (obligatoria)
                            </Label>
                            <select
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                disabled={!createMovement}
                            >
                                <option value="">Seleccionar cuenta...</option>
                                {accounts.map((acc) => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.name} ({acc.kind})
                                    </option>
                                ))}
                            </select>
                            {!createMovement && (
                                <p className="text-xs text-muted-foreground">
                                    No se creara un movimiento en el ledger.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/30">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!canSubmit) return
                            setIsSubmitting(true)
                            try {
                                await onConfirm({ amount, dateISO, accountId, createMovement })
                            } finally {
                                setIsSubmitting(false)
                            }
                        }}
                        disabled={!canSubmit || isSubmitting}
                    >
                        {isSubmitting ? 'Registrando...' : 'Confirmar'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
