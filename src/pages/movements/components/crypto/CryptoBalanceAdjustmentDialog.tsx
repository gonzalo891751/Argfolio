import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Scale } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useMovements } from '@/hooks/use-movements'
import { useAccounts, useInstruments } from '@/hooks/use-instruments'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import {
    buildCryptoBalanceAdjustmentMovement,
    isAdjustmentReasonCompatible,
    type CryptoAdjustmentReason,
} from '@/domain/operations/crypto-balance-adjustment'
import { db } from '@/db/schema'
import { syncMovementsBatch } from '@/sync/remote-sync'
import { formatMoneyUSD, formatQty } from '@/lib/format'

export interface CryptoBalanceAdjustmentPrefill {
    accountId?: string
    instrumentId?: string
    symbol?: string
    realBalance?: number
}

export function CryptoBalanceAdjustmentDialog({
    open,
    onOpenChange,
    prefill,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    prefill?: CryptoBalanceAdjustmentPrefill
}) {
    const { data: movements = [] } = useMovements()
    const { data: accounts = [] } = useAccounts()
    const { data: instruments = [] } = useInstruments()
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const [accountId, setAccountId] = useState('')
    const [instrumentId, setInstrumentId] = useState('')
    const [realBalance, setRealBalance] = useState('')
    const [reason, setReason] = useState<CryptoAdjustmentReason>('manual_correction')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setAccountId(prefill?.accountId ?? '')
        setInstrumentId(prefill?.instrumentId ?? '')
        setRealBalance(prefill?.realBalance == null ? '' : String(prefill.realBalance))
        setReason('manual_correction')
        setNote('')
        setError(null)
    }, [open, prefill])

    const cryptoInstruments = useMemo(
        () => instruments.filter(i => i.category === 'CRYPTO' || i.category === 'STABLE'),
        [instruments],
    )
    const instrument = cryptoInstruments.find(i => i.id === instrumentId)
    const position = useMemo(() => {
        if (!accountId || !instrumentId) return { quantity: 0, avgCostUsd: 0, costBasisUsd: 0 }
        return computeAverageCost(movements.filter(m => m.accountId === accountId && m.instrumentId === instrumentId))
    }, [accountId, instrumentId, movements])
    const parsedReal = Number.parseFloat(realBalance.replace(',', '.'))
    const diff = Number.isFinite(parsedReal) ? parsedReal - position.quantity : 0
    const compatible = isAdjustmentReasonCompatible(diff, reason)
    const canSubmit = !!accountId && !!instrument && Number.isFinite(parsedReal)
        && parsedReal >= 0 && Math.abs(diff) > 1e-12 && compatible && !saving

    const handleSubmit = async () => {
        if (!instrument || !canSubmit) return
        setSaving(true)
        setError(null)
        try {
            const movement = buildCryptoBalanceAdjustmentMovement({
                accountId,
                instrumentId,
                symbol: instrument.symbol,
                assetName: instrument.name,
                diffQty: diff,
                reason,
                costPolicy: reason === 'reward' ? 'zero_cost' : 'preserve_average',
                unitCostUsd: reason === 'reward' ? undefined : position.avgCostUsd,
                note: note || undefined,
            })
            await db.movements.add(movement)
            void syncMovementsBatch([movement])
            await queryClient.invalidateQueries({ queryKey: ['movements'] })
            await queryClient.invalidateQueries({ queryKey: ['portfolio'] })
            toast({
                title: 'Saldo cripto ajustado',
                description: `${diff > 0 ? '+' : ''}${formatQty(diff, 'CRYPTO')} ${instrument.symbol}. No generó caja ni una venta ficticia.`,
                variant: 'success',
            })
            onOpenChange(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo registrar el ajuste.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Ajustar saldo cripto</DialogTitle>
                    <DialogDescription>Conciliá la cantidad calculada con la que muestra el exchange, sin crear efectivo ni PnL de venta.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-3 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-1.5">
                                <Label>Cuenta</Label>
                                <select value={accountId} onChange={e => setAccountId(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3">
                                    <option value="">Seleccioná una cuenta…</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label>Activo</Label>
                                <select value={instrumentId} onChange={e => setInstrumentId(e.target.value)} className="h-11 rounded-lg border border-input bg-background px-3">
                                    <option value="">Seleccioná un activo…</option>
                                    {cryptoInstruments.map(i => <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="crypto-real-balance">Saldo real en el exchange</Label>
                            <Input id="crypto-real-balance" autoFocus type="number" min="0" step="any" value={realBalance} onChange={e => setRealBalance(e.target.value)} className="h-12 font-mono text-lg" placeholder="0.00000000" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Motivo</Label>
                            <select value={reason} onChange={e => setReason(e.target.value as CryptoAdjustmentReason)} className="h-11 rounded-lg border border-input bg-background px-3">
                                <option value="fee">Fee</option>
                                <option value="reward">Reward</option>
                                <option value="rounding">Redondeo</option>
                                <option value="external_transfer">Transferencia externa</option>
                                <option value="manual_correction">Corrección manual</option>
                                <option value="unknown">Otra / pendiente</option>
                            </select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Nota / evidencia</Label>
                            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: fee cobrado por Nexo" />
                        </div>
                        {!compatible && <p className="text-sm text-rose-400">{reason === 'fee' ? 'Un fee sólo puede disminuir el saldo.' : 'Un reward sólo puede aumentarlo.'}</p>}
                        {error && <p className="text-sm text-rose-400">{error}</p>}
                    </div>
                    <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4 h-fit">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Impacto antes de confirmar</p>
                        <div className="space-y-3 font-mono text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Saldo Argfolio</span><span>{formatQty(position.quantity, 'CRYPTO')}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Saldo real</span><span>{Number.isFinite(parsedReal) ? formatQty(parsedReal, 'CRYPTO') : '—'}</span></div>
                            <div className="border-t border-white/10 pt-3 flex justify-between"><span>Diferencia</span><span className={diff < 0 ? 'text-rose-400' : 'text-emerald-400'}>{diff > 0 ? '+' : ''}{formatQty(diff, 'CRYPTO')}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Costo promedio</span><span>{formatMoneyUSD(position.avgCostUsd)}</span></div>
                        </div>
                        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-300">Caja: sin cambios · PnL de venta: no genera</div>
                        {reason === 'unknown' && <div className="flex gap-2 text-xs text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" /> Quedará marcado para revisión manual.</div>}
                    </aside>
                </div>
                <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-3 border-t border-white/10 bg-background/95 px-6 py-4 backdrop-blur">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>{saving ? 'Guardando…' : 'Confirmar ajuste'}</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
