/**
 * CryptoTransferDialog (Fase 4)
 *
 * Transferencia de cripto entre cuentas propias (ej: Binance → Nexo).
 * NO es una venta: conserva el costo (carry-over PPP) y no genera PnL.
 * Persiste TRANSFER_OUT + TRANSFER_IN (+ FEE opcional) atómicamente con
 * un operationId compartido.
 */

import { useMemo, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useMovements } from '@/hooks/use-movements'
import { useAccounts, useInstruments } from '@/hooks/use-instruments'
import { useFxRates } from '@/hooks/use-fx-rates'
import { db } from '@/db/schema'
import { syncMovementsBatch } from '@/sync/remote-sync'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { buildCryptoTransferMovements, CryptoTransferError } from '@/domain/operations/crypto-transfer'
import { formatMoneyUSD, formatQty } from '@/lib/format'
import type { Movement } from '@/domain/types'
import { WizardStepper } from '../ui/WizardStepper'

export interface CryptoTransferPrefill {
    accountId?: string
    instrumentId?: string
    symbol?: string
}

interface CryptoTransferDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prefill?: CryptoTransferPrefill
}

function toLocalInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CryptoTransferDialog({ open, onOpenChange, prefill }: CryptoTransferDialogProps) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { data: movements = [] } = useMovements()
    const { data: accounts = [] } = useAccounts()
    const { data: instruments = [] } = useInstruments()
    const { data: fxRates } = useFxRates()

    const [instrumentId, setInstrumentId] = useState('')
    const [fromAccountId, setFromAccountId] = useState('')
    const [toAccountId, setToAccountId] = useState('')
    const [sentQtyStr, setSentQtyStr] = useState('')
    const [receivedQtyStr, setReceivedQtyStr] = useState('')
    const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
    const [note, setNote] = useState('')
    const [txHash, setTxHash] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset on open with prefill
    useEffect(() => {
        if (open) {
            setInstrumentId(prefill?.instrumentId ?? '')
            setFromAccountId(prefill?.accountId ?? '')
            setToAccountId('')
            setSentQtyStr('')
            setReceivedQtyStr('')
            setDateStr(toLocalInputValue(new Date()))
            setNote('')
            setTxHash('')
            setError(null)
        }
    }, [open, prefill])

    const cryptoInstruments = useMemo(
        () => instruments.filter(i => i.category === 'CRYPTO' || i.category === 'STABLE'),
        [instruments]
    )

    const selectedInstrument = cryptoInstruments.find(i => i.id === instrumentId)

    // Source position (qty available + avg cost) from the accounting engine
    const sourcePosition = useMemo(() => {
        if (!instrumentId || !fromAccountId) return null
        const filtered = movements.filter(m => m.accountId === fromAccountId && m.instrumentId === instrumentId)
        if (filtered.length === 0) return { quantity: 0, avgCostUsd: 0 }
        const pos = computeAverageCost(filtered)
        return { quantity: pos.quantity, avgCostUsd: pos.avgCostUsd }
    }, [movements, instrumentId, fromAccountId])

    const sentQty = parseFloat(sentQtyStr) || 0
    const receivedQty = receivedQtyStr === '' ? sentQty : (parseFloat(receivedQtyStr) || 0)
    const feeQty = Math.max(0, sentQty - receivedQty)

    const canSubmit = instrumentId && fromAccountId && toAccountId
        && fromAccountId !== toAccountId && sentQty > 0 && receivedQty > 0 && !isSaving

    const handleSubmit = async () => {
        if (!selectedInstrument) return
        setError(null)
        setIsSaving(true)
        try {
            const result = buildCryptoTransferMovements({
                instrumentId,
                symbol: selectedInstrument.symbol,
                assetName: selectedInstrument.name,
                fromAccountId,
                toAccountId,
                sentQty,
                receivedQty,
                avgCostUsd: sourcePosition?.avgCostUsd ?? 0,
                availableQty: sourcePosition?.quantity,
                datetimeISO: new Date(dateStr).toISOString(),
                notes: note || undefined,
                txHash: txHash || undefined,
                fxRate: fxRates?.cripto?.sell ?? undefined,
            })

            const toPersist: Movement[] = [result.out, result.in, ...(result.fee ? [result.fee] : [])]

            await db.transaction('rw', db.movements, async () => {
                await db.movements.bulkAdd(toPersist)
            })

            syncMovementsBatch(toPersist).then(({ ok }) => {
                if (!ok) {
                    toast({
                        title: 'Sync pendiente',
                        description: 'La transferencia se guardó localmente pero no se sincronizó al servidor.',
                        variant: 'error',
                    })
                }
            })

            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })

            const fromName = accounts.find(a => a.id === fromAccountId)?.name ?? fromAccountId
            const toName = accounts.find(a => a.id === toAccountId)?.name ?? toAccountId
            toast({
                title: 'Transferencia registrada',
                description: `${formatQty(sentQty, 'CRYPTO')} ${selectedInstrument.symbol} de ${fromName} a ${toName}. Sin PnL: el costo viaja con el activo.`,
                variant: 'success',
                duration: 5000,
            })
            onOpenChange(false)
        } catch (err) {
            if (err instanceof CryptoTransferError) {
                setError(err.message)
            } else {
                setError(err instanceof Error ? err.message : 'Error desconocido al guardar la transferencia.')
            }
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Transferir cripto entre cuentas</DialogTitle>
                    <DialogDescription>
                        Cambio de custodia: conserva el costo y no genera resultado (no es una venta).
                    </DialogDescription>
                    <WizardStepper currentStep={sentQty > 0 ? 3 : (fromAccountId && toAccountId ? 2 : 1)} totalSteps={4} className="pt-2" />
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    {/* Asset */}
                    <div className="grid gap-1.5">
                        <Label htmlFor="ct-asset">Activo</Label>
                        <select
                            id="ct-asset"
                            value={instrumentId}
                            onChange={e => setInstrumentId(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Seleccioná un activo…</option>
                            {cryptoInstruments.map(i => (
                                <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Accounts */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-3">
                        <div className="grid gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-4">
                            <Label htmlFor="ct-from">Cuenta origen</Label>
                            <select
                                id="ct-from"
                                value={fromAccountId}
                                onChange={e => setFromAccountId(e.target.value)}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Origen…</option>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                        <ArrowRight className="h-5 w-5 mb-7 text-sky-400 mx-auto rotate-90 md:rotate-0" />
                        <div className="grid gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                            <Label htmlFor="ct-to">Cuenta destino</Label>
                            <select
                                id="ct-to"
                                value={toAccountId}
                                onChange={e => setToAccountId(e.target.value)}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">Destino…</option>
                                {accounts.filter(a => a.id !== fromAccountId).map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Available balance + avg cost */}
                    {sourcePosition && selectedInstrument && (
                        <div className="text-xs text-muted-foreground font-mono flex justify-between px-1">
                            <span>
                                Disponible: {formatQty(sourcePosition.quantity, 'CRYPTO')} {selectedInstrument.symbol}
                            </span>
                            <span>
                                Costo prom.: {formatMoneyUSD(sourcePosition.avgCostUsd)}
                            </span>
                        </div>
                    )}

                    {/* Quantities */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="ct-sent">Cantidad enviada</Label>
                            <Input
                                id="ct-sent"
                                type="number"
                                step="any"
                                min="0"
                                value={sentQtyStr}
                                onChange={e => setSentQtyStr(e.target.value)}
                                placeholder="0.00000000"
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ct-received">Cantidad recibida</Label>
                            <Input
                                id="ct-received"
                                type="number"
                                step="any"
                                min="0"
                                value={receivedQtyStr}
                                onChange={e => setReceivedQtyStr(e.target.value)}
                                placeholder={sentQtyStr || 'Igual a enviada'}
                            />
                        </div>
                    </div>

                    {/* Fee preview */}
                    {feeQty > 1e-12 && selectedInstrument && (
                        <div className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-500 px-3 py-2">
                            Diferencia por fee de red: {formatQty(feeQty, 'CRYPTO')} {selectedInstrument.symbol}.
                            Se registra como fee auditado y su costo se capitaliza en el destino
                            (la base consolidada no cambia).
                        </div>
                    )}

                    {selectedInstrument && sentQty > 0 && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 grid gap-3 sm:grid-cols-2 text-sm">
                            <div><p className="text-xs text-muted-foreground">Ruta</p><p className="font-medium">{accounts.find(a => a.id === fromAccountId)?.name ?? 'Origen'} → {accounts.find(a => a.id === toAccountId)?.name ?? 'Destino'}</p></div>
                            <div><p className="text-xs text-muted-foreground">Activo</p><p className="font-mono font-medium">{selectedInstrument.symbol}</p></div>
                            <div><p className="text-xs text-muted-foreground">Enviás / recibís</p><p className="font-mono">{formatQty(sentQty, 'CRYPTO')} / {formatQty(receivedQty, 'CRYPTO')}</p></div>
                            <div><p className="text-xs text-muted-foreground">Impacto contable</p><p className="text-emerald-400">Costo transferido · PnL: no genera</p></div>
                        </div>
                    )}

                    {/* Date + tx hash */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="ct-date">Fecha y hora</Label>
                            <Input
                                id="ct-date"
                                type="datetime-local"
                                value={dateStr}
                                onChange={e => setDateStr(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="ct-tx">Tx hash (opcional)</Label>
                            <Input
                                id="ct-tx"
                                type="text"
                                value={txHash}
                                onChange={e => setTxHash(e.target.value)}
                                placeholder="0x…"
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <div className="grid gap-1.5">
                        <Label htmlFor="ct-note">Nota (opcional)</Label>
                        <Input
                            id="ct-note"
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Ej: migración a Nexo"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                </div>

                <DialogFooter className="sticky bottom-0 bg-background/95 pt-4 backdrop-blur">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {isSaving ? 'Guardando…' : 'Transferir'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
