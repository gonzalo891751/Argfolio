import { useState, useEffect } from 'react'
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
import { useManualPrices } from '@/hooks/use-manual-prices'
import { formatCurrency } from '@/lib/utils'

interface ManualPriceDialogProps {
    instrumentId: string
    symbol: string
    currentPrice: number | undefined
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Currency of the manual price. Crypto uses USD; ARS-native assets use ARS. */
    currency?: 'ARS' | 'USD'
    /** ISO timestamp of the existing manual price (shown for transparency) */
    updatedAtISO?: string
    /** True if currentPrice comes from an existing manual override (enables "Volver a AUTO") */
    isManual?: boolean
}

export function ManualPriceDialog({
    instrumentId,
    symbol,
    currentPrice,
    isOpen,
    onOpenChange,
    currency = 'ARS',
    updatedAtISO,
    isManual,
}: ManualPriceDialogProps) {
    const { setPrice, deletePrice } = useManualPrices()
    const [priceInput, setPriceInput] = useState('')

    useEffect(() => {
        if (isOpen) {
            setPriceInput(currentPrice?.toString() ?? '')
        }
    }, [isOpen, currentPrice])

    const [isConfirmOpen, setIsConfirmOpen] = useState(false)

    const handleSave = () => {
        const val = parseFloat(priceInput)
        if (!isNaN(val) && val > 0) {
            setPrice(instrumentId, val)
            onOpenChange(false)
        }
    }

    const handleDelete = () => {
        deletePrice(instrumentId)
        setIsConfirmOpen(false)
        onOpenChange(false)
    }

    const currencyLabel = currency === 'USD' ? 'Dólares (USD)' : 'Pesos (ARS)'

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Actualizar precio de {symbol}</DialogTitle>
                        <DialogDescription>
                            Ingresá el precio actual en {currencyLabel} para este activo.
                            Se usará como precio manual hasta que lo quites.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="price" className="text-right">
                                Precio {currency}
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                step="any"
                                min="0"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        {currentPrice != null && currentPrice > 0 && (
                            <div className="text-sm text-muted-foreground text-center">
                                Precio actual: {formatCurrency(currentPrice, currency)}
                                {isManual && updatedAtISO && (
                                    <span className="block text-xs mt-0.5">
                                        Manual, cargado el {new Date(updatedAtISO).toLocaleString('es-AR')}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex !justify-between gap-2 sm:gap-0">
                        {isManual && (
                            <Button
                                variant="destructive"
                                type="button"
                                className="mr-auto bg-destructive/10 text-destructive hover:bg-destructive/20 border-0"
                                onClick={() => setIsConfirmOpen(true)}
                            >
                                Volver a AUTO
                            </Button>
                        )}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSave}>Guardar</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Quitar precio manual</DialogTitle>
                        <DialogDescription>
                            Este activo volverá a usar el precio automático si está disponible.
                            Si no hay cotización, se mostrará como "Sin precio".
                            ¿Estás seguro?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={handleDelete}>
                            Quitar manual
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
