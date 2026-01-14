import { AlertTriangle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteConfirmDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
    title?: string
    description?: string
}

export function DeleteConfirmDialog({
    open,
    onOpenChange,
    onConfirm,
    title = '¿Eliminar movimiento?',
    description = 'Esta acción no se puede deshacer. El movimiento será eliminado permanentemente.',
}: DeleteConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                        </div>
                        <DialogTitle>{title}</DialogTitle>
                    </div>
                    <DialogDescription className="pt-2">{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button variant="destructive" onClick={onConfirm}>
                        Eliminar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
