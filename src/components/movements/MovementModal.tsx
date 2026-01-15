import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SellPreviewPanel } from '@/components/assets/SellPreviewPanel'
import { useInstruments, useAccounts } from '@/hooks/use-instruments'
import { useCreateMovement, useUpdateMovement } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { formatMoney, formatNumberAR } from '@/lib/format'
import type { Movement, MovementType, Currency } from '@/domain/types'

const movementTypes: { value: MovementType; label: string }[] = [
    { value: 'BUY', label: 'Compra' },
    { value: 'SELL', label: 'Venta' },
    { value: 'DEPOSIT', label: 'Depósito' },
    { value: 'WITHDRAW', label: 'Retiro' },
    { value: 'DIVIDEND', label: 'Dividendo' },
    { value: 'INTEREST', label: 'Interés' },
    { value: 'FEE', label: 'Comisión' },
    { value: 'TRANSFER_IN', label: 'Transferencia Entrada' },
    { value: 'TRANSFER_OUT', label: 'Transferencia Salida' },
]

const currencies: { value: Currency; label: string }[] = [
    { value: 'USD', label: 'USD' },
    { value: 'ARS', label: 'ARS' },
    { value: 'USDT', label: 'USDT' },
    { value: 'USDC', label: 'USDC' },
]

const formSchema = z.object({
    type: z.string().min(1, 'Seleccioná un tipo'),
    instrumentId: z.string().optional(),
    accountId: z.string().min(1, 'Seleccioná una cuenta'),
    quantity: z.number().optional(),
    unitPrice: z.number().optional(),
    tradeCurrency: z.string().min(1, 'Seleccioná una moneda'),
    totalAmount: z.number().min(0.01, 'El monto debe ser mayor a 0'),
    fxAtTrade: z.number().optional(),
    feeAmount: z.number().optional(),
    feeCurrency: z.string().optional(),
    notes: z.string().optional(),
    datetimeISO: z.string().min(1, 'Seleccioná una fecha'),
})

type FormData = z.infer<typeof formSchema>

interface MovementModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    movement?: Movement // For edit mode
    // Prefill defaults (from asset detail page)
    defaultInstrumentId?: string
    defaultType?: MovementType
    // Sell preview data
    holdingQuantity?: number
    currentPrice?: number
    avgCost?: number
}

export function MovementModal({
    open,
    onOpenChange,
    movement,
    defaultInstrumentId,
    defaultType,
    holdingQuantity = 0,
    currentPrice = 0,
    avgCost = 0,
}: MovementModalProps) {
    const { data: instruments = [] } = useInstruments()
    const { data: accounts = [] } = useAccounts()
    const { data: fxRates } = useFxRates()
    const createMovement = useCreateMovement()
    const updateMovement = useUpdateMovement()

    const isEditing = !!movement

    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            type: movement?.type ?? defaultType ?? 'BUY',
            instrumentId: movement?.instrumentId ?? defaultInstrumentId ?? '',
            accountId: movement?.accountId ?? '',
            quantity: movement?.quantity,
            unitPrice: movement?.unitPrice ?? currentPrice ?? undefined,
            tradeCurrency: movement?.tradeCurrency ?? 'USD',
            totalAmount: movement?.totalAmount ?? 0,
            fxAtTrade: movement?.fxAtTrade ?? (fxRates?.mep || undefined),
            feeAmount: movement?.feeAmount,
            feeCurrency: movement?.feeCurrency,
            notes: movement?.notes ?? '',
            datetimeISO: movement?.datetimeISO ?? new Date().toISOString().slice(0, 16),
        },
    })

    // Reset form when modal opens with new defaults
    useEffect(() => {
        if (open && !isEditing) {
            form.reset({
                type: defaultType ?? 'BUY',
                instrumentId: defaultInstrumentId ?? '',
                accountId: '',
                quantity: undefined,
                unitPrice: currentPrice ?? undefined,
                tradeCurrency: 'USD',
                totalAmount: 0,
                fxAtTrade: Number.isFinite(fxRates?.mep) ? fxRates?.mep : undefined,
                feeAmount: undefined,
                feeCurrency: undefined,
                notes: '',
                datetimeISO: new Date().toISOString().slice(0, 16),
            })
        }
    }, [open, defaultType, defaultInstrumentId, currentPrice, fxRates?.mep, isEditing, form])

    const watchType = form.watch('type') as MovementType
    const watchQty = form.watch('quantity')
    const watchPrice = form.watch('unitPrice')
    const watchCurrency = form.watch('tradeCurrency') as Currency
    const watchInstrumentId = form.watch('instrumentId')

    // Auto-calculate total for BUY/SELL
    useEffect(() => {
        if ((watchType === 'BUY' || watchType === 'SELL') && watchQty && watchPrice) {
            form.setValue('totalAmount', watchQty * watchPrice)
        }
    }, [watchQty, watchPrice, watchType, form])

    // Check if selling from asset detail page (has holdingQuantity context)
    const isSellWithContext = watchType === 'SELL' && holdingQuantity > 0 && !!defaultInstrumentId
    const isOversell = isSellWithContext && (watchQty ?? 0) > holdingQuantity

    // Filter instruments based on type
    const showInstrumentField = ['BUY', 'SELL', 'DIVIDEND', 'INTEREST'].includes(watchType)
    const showQuantityField = ['BUY', 'SELL'].includes(watchType)

    // Get filtered instruments (non-cash for BUY/SELL)
    const filteredInstruments = instruments.filter((i) =>
        i.category !== 'ARS_CASH' && i.category !== 'USD_CASH'
    )

    const instrumentOptions = filteredInstruments.map((i) => ({
        value: i.id,
        label: `${i.symbol} - ${i.name}`,
    }))

    const accountOptions = accounts.map((a) => ({
        value: a.id,
        label: a.name,
    }))

    const onSubmit = async (data: FormData) => {
        // Prevent oversell
        if (isSellWithContext && (data.quantity ?? 0) > holdingQuantity) {
            form.setError('quantity', {
                type: 'manual',
                message: `Máximo vendible: ${holdingQuantity}`,
            })
            return
        }

        const movementData: Movement = {
            id: movement?.id ?? `mov-${Date.now()}`,
            datetimeISO: data.datetimeISO,
            type: data.type as MovementType,
            instrumentId: data.instrumentId || undefined,
            accountId: data.accountId,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
            tradeCurrency: data.tradeCurrency as Currency,
            totalAmount: data.totalAmount,
            fxAtTrade: data.fxAtTrade,
            feeAmount: data.feeAmount,
            feeCurrency: data.feeCurrency as Currency | undefined,
            notes: data.notes,
        }

        try {
            if (isEditing) {
                await updateMovement.mutateAsync({ id: movement.id, updates: movementData })
            } else {
                await createMovement.mutateAsync(movementData)
            }
            onOpenChange(false)
            form.reset()
        } catch (error) {
            console.error('Error saving movement:', error)
        }
    }

    // Preview totals in both currencies
    const totalAmount = form.watch('totalAmount')
    const fxAtTrade = form.watch('fxAtTrade') ?? (Number.isFinite(fxRates?.mep) ? fxRates!.mep : 1200)

    // Get instrument for currency display
    const selectedInstrument = instruments.find((i) => i.id === watchInstrumentId)
    const tradeCurrency = selectedInstrument?.nativeCurrency ?? 'USD'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing
                            ? 'Editar Movimiento'
                            : defaultType === 'SELL'
                                ? 'Nueva Venta'
                                : defaultType === 'BUY'
                                    ? 'Nueva Compra'
                                    : 'Nuevo Movimiento'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-6 pt-0">
                    {/* Sell Preview Panel */}
                    {isSellWithContext && (
                        <SellPreviewPanel
                            currentHolding={holdingQuantity}
                            sellQuantity={watchQty ?? 0}
                            currentPrice={currentPrice}
                            avgCost={avgCost}
                            tradeCurrency={tradeCurrency}
                        />
                    )}

                    {/* Date & Type Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="datetimeISO">Fecha y Hora</Label>
                            <Input
                                id="datetimeISO"
                                type="datetime-local"
                                {...form.register('datetimeISO')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="type">Tipo</Label>
                            <Select
                                id="type"
                                options={movementTypes}
                                disabled={!!defaultType}
                                {...form.register('type')}
                            />
                        </div>
                    </div>

                    {/* Instrument (conditional) */}
                    {showInstrumentField && (
                        <div className="space-y-2">
                            <Label htmlFor="instrumentId">Activo</Label>
                            <Select
                                id="instrumentId"
                                options={instrumentOptions}
                                placeholder="Seleccionar activo..."
                                disabled={!!defaultInstrumentId}
                                {...form.register('instrumentId')}
                            />
                        </div>
                    )}

                    {/* Account */}
                    <div className="space-y-2">
                        <Label htmlFor="accountId">Cuenta / Plataforma</Label>
                        <Select
                            id="accountId"
                            options={accountOptions}
                            placeholder="Seleccionar cuenta..."
                            {...form.register('accountId')}
                        />
                        {form.formState.errors.accountId && (
                            <p className="text-sm text-destructive">{form.formState.errors.accountId.message}</p>
                        )}
                    </div>

                    {/* Quantity & Price (for BUY/SELL) */}
                    {showQuantityField && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Cantidad</Label>
                                <Input
                                    id="quantity"
                                    type="number"
                                    step="any"
                                    {...form.register('quantity', { valueAsNumber: true })}
                                />
                                {form.formState.errors.quantity && (
                                    <p className="text-sm text-destructive">{form.formState.errors.quantity.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="unitPrice">Precio Unitario</Label>
                                <Input
                                    id="unitPrice"
                                    type="number"
                                    step="any"
                                    {...form.register('unitPrice', { valueAsNumber: true })}
                                />
                            </div>
                        </div>
                    )}

                    {/* Currency & Total */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="tradeCurrency">Moneda</Label>
                            <Select
                                id="tradeCurrency"
                                options={currencies}
                                {...form.register('tradeCurrency')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="totalAmount">Monto Total</Label>
                            <Input
                                id="totalAmount"
                                type="number"
                                step="any"
                                {...form.register('totalAmount', { valueAsNumber: true })}
                            />
                        </div>
                    </div>

                    {/* FX at Trade */}
                    <div className="space-y-2">
                        <Label htmlFor="fxAtTrade">Tipo de Cambio (USD/ARS)</Label>
                        <Input
                            id="fxAtTrade"
                            type="number"
                            step="any"
                            {...form.register('fxAtTrade', { valueAsNumber: true })}
                        />
                        <p className="text-xs text-muted-foreground">
                            Actual MEP: {Number.isFinite(fxRates?.mep) ? formatNumberAR(fxRates!.mep) : '—'}
                        </p>
                    </div>

                    {/* Fee (optional) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="feeAmount">Comisión (opcional)</Label>
                            <Input
                                id="feeAmount"
                                type="number"
                                step="any"
                                {...form.register('feeAmount', { valueAsNumber: true })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="feeCurrency">Moneda Comisión</Label>
                            <Select
                                id="feeCurrency"
                                options={currencies}
                                {...form.register('feeCurrency')}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notas (opcional)</Label>
                        <Textarea
                            id="notes"
                            placeholder="Agregar notas..."
                            {...form.register('notes')}
                        />
                    </div>

                    {/* Preview */}
                    {totalAmount > 0 && !isSellWithContext && (
                        <div className="rounded-lg bg-muted/50 p-3 text-sm">
                            <p className="font-medium mb-1">Resumen:</p>
                            <p>
                                {watchCurrency === 'ARS'
                                    ? formatMoney(totalAmount, 'ARS')
                                    : formatMoney(totalAmount, watchCurrency)}
                            </p>
                            {watchCurrency !== 'ARS' && fxAtTrade && (
                                <p className="text-muted-foreground">
                                    ≈ {formatMoney(totalAmount * fxAtTrade, 'ARS')}
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            variant="gradient"
                            disabled={createMovement.isPending || updateMovement.isPending || isOversell}
                        >
                            {createMovement.isPending || updateMovement.isPending
                                ? 'Guardando...'
                                : isEditing
                                    ? 'Guardar Cambios'
                                    : watchType === 'SELL'
                                        ? 'Registrar Venta'
                                        : 'Crear Movimiento'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
