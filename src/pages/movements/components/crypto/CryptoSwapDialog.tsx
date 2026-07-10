/**
 * CryptoSwapDialog (Fase 5)
 *
 * Conversión/swap cripto dentro de una cuenta: una o varias patas de origen
 * (ej: BTC + USDT) → un activo destino (ej: NEXO). Realiza PnL sobre los
 * orígenes con costo variable y el destino nace con costo verificable,
 * incluso sin cotización de mercado.
 */

import { useMemo, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
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
import { useAccounts, useInstruments, useCreateInstrument } from '@/hooks/use-instruments'
import { useCryptoPrices } from '@/hooks/use-crypto-prices'
import { useFxRates } from '@/hooks/use-fx-rates'
import { db } from '@/db/schema'
import { syncMovementsBatch } from '@/sync/remote-sync'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { buildCryptoSwapMovements, CryptoSwapError } from '@/domain/operations/crypto-swap'
import { getCoingeckoId } from '@/data/providers/crypto-coingecko'
import { formatMoneyUSD, formatDeltaMoneyUSD, formatQty } from '@/lib/format'
import type { Instrument, Movement } from '@/domain/types'
import { WizardStepper } from '../ui/WizardStepper'

export interface CryptoSwapPrefill {
    accountId?: string
    sourceInstrumentId?: string
}

interface CryptoSwapDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prefill?: CryptoSwapPrefill
}

interface SourceLegState {
    instrumentId: string
    qtyStr: string
    priceStr: string
}

function toLocalInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])

export function CryptoSwapDialog({ open, onOpenChange, prefill }: CryptoSwapDialogProps) {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { data: movements = [] } = useMovements()
    const { data: accounts = [] } = useAccounts()
    const { data: instruments = [] } = useInstruments()
    const { data: fxRates } = useFxRates()
    const createInstrument = useCreateInstrument()

    const [accountId, setAccountId] = useState('')
    const [sources, setSources] = useState<SourceLegState[]>([{ instrumentId: '', qtyStr: '', priceStr: '' }])
    const [destMode, setDestMode] = useState<'existing' | 'new'>('existing')
    const [destInstrumentId, setDestInstrumentId] = useState('')
    const [destNewSymbol, setDestNewSymbol] = useState('')
    const [destQtyStr, setDestQtyStr] = useState('')
    const [dateStr, setDateStr] = useState(() => toLocalInputValue(new Date()))
    const [note, setNote] = useState('')
    const [txHash, setTxHash] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setAccountId(prefill?.accountId ?? '')
            setSources([{ instrumentId: prefill?.sourceInstrumentId ?? '', qtyStr: '', priceStr: '' }])
            setDestMode('existing')
            setDestInstrumentId('')
            setDestNewSymbol('')
            setDestQtyStr('')
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

    // Live prices for prefilling source leg prices
    const sourceSymbols = useMemo(
        () => sources
            .map(s => cryptoInstruments.find(i => i.id === s.instrumentId)?.symbol)
            .filter((s): s is string => !!s),
        [sources, cryptoInstruments]
    )
    const { data: livePrices = {} } = useCryptoPrices(sourceSymbols)

    // Position per (account, instrument) for balance validation + PnL preview
    const getPosition = (instrumentId: string) => {
        if (!accountId || !instrumentId) return null
        const filtered = movements.filter(m => m.accountId === accountId && m.instrumentId === instrumentId)
        if (filtered.length === 0) return { quantity: 0, avgCostUsd: 0 }
        const pos = computeAverageCost(filtered)
        return { quantity: pos.quantity, avgCostUsd: pos.avgCostUsd }
    }

    const parsedSources = sources.map(s => {
        const instrument = cryptoInstruments.find(i => i.id === s.instrumentId)
        const qty = parseFloat(s.qtyStr) || 0
        const isStable = instrument ? STABLE_SYMBOLS.has(instrument.symbol.toUpperCase()) : false
        const defaultPrice = isStable
            ? 1
            : (instrument ? livePrices[instrument.symbol.toUpperCase()] ?? 0 : 0)
        const price = s.priceStr !== '' ? (parseFloat(s.priceStr) || 0) : defaultPrice
        const position = instrument ? getPosition(instrument.id) : null
        return { instrument, qty, price, position, valueUsd: qty * price }
    })

    const totalValueUsd = parsedSources.reduce((sum, s) => sum + s.valueUsd, 0)
    const destQty = parseFloat(destQtyStr) || 0
    const destUnitCost = destQty > 0 ? totalValueUsd / destQty : 0

    // Realized PnL preview per source (vs avg cost)
    const pnlPreview = parsedSources
        .filter(s => s.instrument && s.qty > 0 && s.price > 0 && s.position)
        .map(s => ({
            symbol: s.instrument!.symbol,
            pnlUsd: s.qty * (s.price - (s.position!.avgCostUsd || 0)),
            isStable: STABLE_SYMBOLS.has(s.instrument!.symbol.toUpperCase()),
        }))

    const destSymbolPreview = destMode === 'new'
        ? destNewSymbol.trim().toUpperCase()
        : cryptoInstruments.find(i => i.id === destInstrumentId)?.symbol ?? ''

    const canSubmit = accountId
        && parsedSources.every(s => s.instrument && s.qty > 0 && s.price > 0)
        && parsedSources.length > 0
        && destQty > 0
        && (destMode === 'existing' ? !!destInstrumentId : destNewSymbol.trim().length > 0)
        && !isSaving

    const addSourceLeg = () => setSources(prev => [...prev, { instrumentId: '', qtyStr: '', priceStr: '' }])
    const removeSourceLeg = (index: number) => setSources(prev => prev.filter((_, i) => i !== index))
    const updateSourceLeg = (index: number, partial: Partial<SourceLegState>) =>
        setSources(prev => prev.map((s, i) => i === index ? { ...s, ...partial } : s))

    const handleSubmit = async () => {
        setError(null)
        setIsSaving(true)
        try {
            // Resolve/create destination instrument
            let destInstrument: Instrument | undefined
            if (destMode === 'existing') {
                destInstrument = cryptoInstruments.find(i => i.id === destInstrumentId)
            } else {
                const symbol = destNewSymbol.trim().toUpperCase()
                destInstrument = instruments.find(i => i.symbol.toUpperCase() === symbol)
                if (!destInstrument) {
                    destInstrument = {
                        id: symbol.toLowerCase(),
                        symbol,
                        name: symbol,
                        category: STABLE_SYMBOLS.has(symbol) ? 'STABLE' : 'CRYPTO',
                        nativeCurrency: 'USD',
                        priceKey: getCoingeckoId(symbol) ?? symbol.toLowerCase(),
                        coingeckoId: getCoingeckoId(symbol) ?? undefined,
                    }
                    await createInstrument.mutateAsync(destInstrument)
                }
            }
            if (!destInstrument) throw new Error('No se pudo resolver el activo destino.')

            const result = buildCryptoSwapMovements({
                accountId,
                sources: parsedSources.map(s => ({
                    instrumentId: s.instrument!.id,
                    symbol: s.instrument!.symbol,
                    assetName: s.instrument!.name,
                    qty: s.qty,
                    priceUsd: s.price,
                    availableQty: s.position?.quantity,
                })),
                destination: {
                    instrumentId: destInstrument.id,
                    symbol: destInstrument.symbol,
                    assetName: destInstrument.name,
                    qty: destQty,
                },
                datetimeISO: new Date(dateStr).toISOString(),
                notes: note || undefined,
                txHash: txHash || undefined,
                fxRate: fxRates?.cripto?.sell ?? undefined,
            })

            const toPersist: Movement[] = [...result.sourceMovements, result.destinationMovement]

            await db.transaction('rw', db.movements, async () => {
                await db.movements.bulkAdd(toPersist)
            })

            syncMovementsBatch(toPersist).then(({ ok }) => {
                if (!ok) {
                    toast({
                        title: 'Sync pendiente',
                        description: 'El swap se guardó localmente pero no se sincronizó al servidor.',
                        variant: 'error',
                    })
                }
            })

            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })

            toast({
                title: 'Swap registrado',
                description: `Recibiste ${formatQty(destQty, 'CRYPTO')} ${destInstrument.symbol} con costo ${formatMoneyUSD(result.totalValueUsd)}.`,
                variant: 'success',
                duration: 5000,
            })
            onOpenChange(false)
        } catch (err) {
            if (err instanceof CryptoSwapError) {
                setError(err.message)
            } else {
                setError(err instanceof Error ? err.message : 'Error desconocido al guardar el swap.')
            }
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Convertir / Swap cripto</DialogTitle>
                    <DialogDescription>
                        Entregás uno o más activos y recibís otro. El origen realiza resultado;
                        el destino nace con el costo de lo entregado.
                    </DialogDescription>
                    <WizardStepper currentStep={destQty > 0 ? 3 : (parsedSources.some(s => s.qty > 0) ? 2 : 1)} totalSteps={4} className="pt-2" />
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    {/* Account */}
                    <div className="grid gap-1.5">
                        <Label htmlFor="cs-account">Cuenta / Exchange</Label>
                        <select
                            id="cs-account"
                            value={accountId}
                            onChange={e => setAccountId(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="">Seleccioná una cuenta…</option>
                            {accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Source legs */}
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <Label>Origen (entregás)</Label>
                            <Button type="button" variant="outline" size="sm" onClick={addSourceLeg} className="h-7 px-2 text-xs">
                                <Plus className="h-3 w-3 mr-1" /> Agregar pata
                            </Button>
                        </div>
                        {sources.map((src, idx) => {
                            const parsed = parsedSources[idx]
                            return (
                                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_110px_130px_auto] gap-2 items-start rounded-xl border border-white/10 bg-white/[0.025] p-3">
                                    <select
                                        value={src.instrumentId}
                                        onChange={e => updateSourceLeg(idx, { instrumentId: e.target.value })}
                                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                                    >
                                        <option value="">Activo…</option>
                                        {cryptoInstruments.map(i => (
                                            <option key={i.id} value={i.id}>{i.symbol}</option>
                                        ))}
                                    </select>
                                    <Input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={src.qtyStr}
                                        onChange={e => updateSourceLeg(idx, { qtyStr: e.target.value })}
                                        placeholder="Cant."
                                    />
                                    <Input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={src.priceStr}
                                        onChange={e => updateSourceLeg(idx, { priceStr: e.target.value })}
                                        placeholder={parsed?.price ? `US$ ${parsed.price}` : 'Precio US$'}
                                        title="Precio de ejecución por unidad (USD)"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeSourceLeg(idx)}
                                        disabled={sources.length <= 1}
                                        className="h-10 px-2 text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {parsed?.instrument && parsed.position && (
                                        <div className="sm:col-span-4 -mt-1 text-[11px] text-muted-foreground font-mono px-1">
                                            Disponible: {formatQty(parsed.position.quantity, 'CRYPTO')} {parsed.instrument.symbol}
                                            {' · '}Costo prom.: {formatMoneyUSD(parsed.position.avgCostUsd)}
                                            {parsed.valueUsd > 0 && <> {' · '}Valor pata: {formatMoneyUSD(parsed.valueUsd)}</>}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Destination */}
                    <div className="grid gap-2">
                        <Label>Destino (recibís)</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
                            <div className="grid gap-1.5">
                                {destMode === 'existing' ? (
                                    <select
                                        value={destInstrumentId}
                                        onChange={e => setDestInstrumentId(e.target.value)}
                                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                                    >
                                        <option value="">Activo destino…</option>
                                        {cryptoInstruments.map(i => (
                                            <option key={i.id} value={i.id}>{i.symbol} — {i.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <Input
                                        type="text"
                                        value={destNewSymbol}
                                        onChange={e => setDestNewSymbol(e.target.value)}
                                        placeholder="Símbolo nuevo (ej: NEXO)"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => setDestMode(m => m === 'existing' ? 'new' : 'existing')}
                                    className="text-[11px] text-primary hover:underline text-left"
                                >
                                    {destMode === 'existing' ? '¿No está en la lista? Crear nuevo activo' : 'Elegir un activo existente'}
                                </button>
                            </div>
                            <Input
                                type="number"
                                step="any"
                                min="0"
                                value={destQtyStr}
                                onChange={e => setDestQtyStr(e.target.value)}
                                placeholder="Cantidad"
                            />
                        </div>
                    </div>

                    {/* Preview */}
                    {totalValueUsd > 0 && destQty > 0 && (
                        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 space-y-1 text-xs font-mono">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Valor entregado</span>
                                <span>{formatMoneyUSD(totalValueUsd)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Costo unitario {destSymbolPreview || 'destino'}</span>
                                <span>{formatMoneyUSD(destUnitCost)}</span>
                            </div>
                            {pnlPreview.filter(p => !p.isStable).map(p => (
                                <div key={p.symbol} className="flex justify-between">
                                    <span className="text-muted-foreground">PnL realizado {p.symbol}</span>
                                    <span className={p.pnlUsd >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                        {formatDeltaMoneyUSD(p.pnlUsd)}
                                    </span>
                                </div>
                            ))}
                            <p className="text-[10px] text-muted-foreground pt-1">
                                El destino no necesita cotización: si no hay precio, se mostrará
                                "Sin precio" pero la cantidad y el costo quedan registrados.
                            </p>
                        </div>
                    )}

                    {/* Date / tx / note */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor="cs-date">Fecha y hora</Label>
                            <Input
                                id="cs-date"
                                type="datetime-local"
                                value={dateStr}
                                onChange={e => setDateStr(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="cs-tx">Tx hash (opcional)</Label>
                            <Input
                                id="cs-tx"
                                type="text"
                                value={txHash}
                                onChange={e => setTxHash(e.target.value)}
                                placeholder="0x…"
                            />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="cs-note">Nota (opcional)</Label>
                        <Input
                            id="cs-note"
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Ej: compra de NEXO con BTC + USDT"
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
                        {isSaving ? 'Guardando…' : 'Convertir'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
