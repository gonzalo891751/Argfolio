import { useState } from 'react'
import { Plus, AlertTriangle, Calendar, CheckCircle, Trash2, CreditCard } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DeleteConfirmDialog } from '@/components/movements/DeleteConfirmDialog'
import { useAllDebts, useCreateDebt, usePayDebt, useDeleteDebt } from '@/hooks/use-debts'
import type { Debt, Currency } from '@/domain/types'

const currencies: { value: Currency; label: string }[] = [
    { value: 'ARS', label: 'ARS' },
    { value: 'USD', label: 'USD' },
    { value: 'USDT', label: 'USDT' },
]

export function DebtsPage() {
    const { data: debts = [], isLoading } = useAllDebts()
    const createDebt = useCreateDebt()
    const payDebt = usePayDebt()
    const deleteDebt = useDeleteDebt()

    const [isModalOpen, setIsModalOpen] = useState(false)
    const [payDialogDebt, setPayDialogDebt] = useState<Debt | null>(null)
    const [payAmount, setPayAmount] = useState('')
    const [deleteId, setDeleteId] = useState<string | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        currency: 'USD' as Currency,
        amount: '',
        dueDate: '',
        notes: '',
    })

    const activeDebts = debts.filter((d) => d.status === 'ACTIVE')
    const paidDebts = debts.filter((d) => d.status === 'PAID')

    const totalDebtARS = activeDebts.reduce((sum, d) => {
        // Simple conversion for now
        return sum + (d.currency === 'ARS' ? d.currentBalance : d.currentBalance * 1200)
    }, 0)

    const handleCreateDebt = async () => {
        if (!formData.name || !formData.amount || !formData.dueDate) return

        const debt: Debt = {
            id: `debt-${Date.now()}`,
            name: formData.name,
            currency: formData.currency,
            originalAmount: parseFloat(formData.amount),
            currentBalance: parseFloat(formData.amount),
            dueDateLocal: formData.dueDate,
            notes: formData.notes || undefined,
            status: 'ACTIVE',
            createdAtISO: new Date().toISOString(),
        }

        await createDebt.mutateAsync(debt)
        setIsModalOpen(false)
        setFormData({ name: '', currency: 'USD', amount: '', dueDate: '', notes: '' })
    }

    const handlePay = async () => {
        if (!payDialogDebt || !payAmount) return

        await payDebt.mutateAsync({
            id: payDialogDebt.id,
            amount: parseFloat(payAmount),
        })

        setPayDialogDebt(null)
        setPayAmount('')
    }

    const handleDelete = async () => {
        if (deleteId) {
            await deleteDebt.mutateAsync(deleteId)
            setDeleteId(null)
        }
    }

    const getDaysUntil = (dateLocal: string) => {
        return Math.ceil((new Date(dateLocal).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Deudas</h1>
                    <p className="text-muted-foreground">Seguimiento de tus compromisos financieros</p>
                </div>
                <Button variant="gradient" onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Deuda
                </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className={activeDebts.length > 0 ? 'border-warning/30 bg-warning/5' : ''}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Total Adeudado
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold font-numeric">
                            {formatCurrency(totalDebtARS, 'ARS')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {activeDebts.length} deuda{activeDebts.length !== 1 ? 's' : ''} activa{activeDebts.length !== 1 ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Próximo Vencimiento
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activeDebts.length > 0 ? (
                            <>
                                <p className="text-lg font-semibold">
                                    {activeDebts.sort((a, b) => a.dueDateLocal.localeCompare(b.dueDateLocal))[0]?.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {new Date(activeDebts[0].dueDateLocal).toLocaleDateString('es-AR')}
                                </p>
                            </>
                        ) : (
                            <p className="text-muted-foreground">Sin vencimientos</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-success/5 border-success/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            Estado
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold text-success">
                            {activeDebts.length === 0 ? '¡Sin deudas!' : 'Bajo control'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {paidDebts.length} deuda{paidDebts.length !== 1 ? 's' : ''} pagada{paidDebts.length !== 1 ? 's' : ''}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Debts list */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Detalle de deudas</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : debts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>No tenés deudas registradas</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {debts.map((debt) => {
                                const daysUntil = getDaysUntil(debt.dueDateLocal)
                                const isUrgent = debt.status === 'ACTIVE' && daysUntil <= 7
                                const isPaid = debt.status === 'PAID'

                                return (
                                    <div
                                        key={debt.id}
                                        className={cn(
                                            'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border',
                                            isPaid && 'opacity-60',
                                            isUrgent && 'border-warning/50 bg-warning/5'
                                        )}
                                    >
                                        <div className="space-y-1 min-w-0">
                                            <p className="font-medium truncate">{debt.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Vence: {new Date(debt.dueDateLocal).toLocaleDateString('es-AR')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right">
                                                <p className="font-semibold font-numeric">
                                                    {formatCurrency(debt.currentBalance, debt.currency)}
                                                </p>
                                                {debt.currentBalance < debt.originalAmount && (
                                                    <p className="text-xs text-muted-foreground">
                                                        de {formatCurrency(debt.originalAmount, debt.currency)}
                                                    </p>
                                                )}
                                            </div>
                                            <Badge
                                                variant={isPaid ? 'positive' : isUrgent ? 'destructive' : 'secondary'}
                                            >
                                                {isPaid
                                                    ? 'Pagado'
                                                    : daysUntil <= 0
                                                        ? 'Vencido'
                                                        : daysUntil === 1
                                                            ? 'Mañana'
                                                            : `${daysUntil} días`}
                                            </Badge>
                                            {!isPaid && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setPayDialogDebt(debt)}
                                                >
                                                    Pagar
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive"
                                                onClick={() => setDeleteId(debt.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Debt Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nueva Deuda</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 p-6 pt-0">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre / Descripción</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej: Tarjeta Visa"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Monto</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    value={formData.amount}
                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="currency">Moneda</Label>
                                <Select
                                    id="currency"
                                    options={currencies}
                                    value={formData.currency}
                                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dueDate">Fecha de Vencimiento</Label>
                            <Input
                                id="dueDate"
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notas (opcional)</Label>
                            <Textarea
                                id="notes"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button variant="gradient" onClick={handleCreateDebt} disabled={createDebt.isPending}>
                            {createDebt.isPending ? 'Creando...' : 'Crear Deuda'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Pay Dialog */}
            <Dialog open={!!payDialogDebt} onOpenChange={(open) => !open && setPayDialogDebt(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Registrar Pago</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 p-6 pt-0">
                        <p className="text-sm text-muted-foreground">
                            Deuda: <strong>{payDialogDebt?.name}</strong>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Saldo actual: {payDialogDebt && formatCurrency(payDialogDebt.currentBalance, payDialogDebt.currency)}
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="payAmount">Monto a pagar</Label>
                            <Input
                                id="payAmount"
                                type="number"
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                max={payDialogDebt?.currentBalance}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPayDialogDebt(null)}>
                            Cancelar
                        </Button>
                        <Button variant="gradient" onClick={handlePay} disabled={payDebt.isPending}>
                            {payDebt.isPending ? 'Registrando...' : 'Registrar Pago'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DeleteConfirmDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
                onConfirm={handleDelete}
                title="¿Eliminar deuda?"
                description="Esta acción no se puede deshacer."
            />
        </div>
    )
}
