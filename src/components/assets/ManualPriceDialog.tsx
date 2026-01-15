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
}

export function ManualPriceDialog({
    instrumentId,
    symbol,
    currentPrice,
    isOpen,
    onOpenChange,
}: ManualPriceDialogProps) {
    const { setPrice } = useManualPrices()
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

    const { deletePrice } = useManualPrices()

    const handleDelete = () => {
        deletePrice(instrumentId)
        setIsConfirmOpen(false)
        onOpenChange(false)
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Actualizar precio de {symbol}</DialogTitle>
                        <DialogDescription>
                            Ingresá el precio actual en Pesos (ARS) para este activo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="price" className="text-right">
                                Precio ARS
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        {currentPrice && (
                            <div className="text-sm text-muted-foreground text-center">
                                Precio actual: {formatCurrency(currentPrice, 'ARS')}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex !justify-between gap-2 sm:gap-0">
                        {currentPrice !== undefined && (
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
                            Este activo volverá a usar el precio automático (PPI) si está disponible.
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
