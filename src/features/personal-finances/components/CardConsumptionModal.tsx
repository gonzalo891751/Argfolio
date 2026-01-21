import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { PFCreditCard } from '@/db/schema'
import type { CreateConsumptionInput } from '../services/pfStore'

interface CardConsumptionModalProps {
    open: boolean
    onClose: () => void
    card: PFCreditCard | null
    onSave: (input: CreateConsumptionInput) => Promise<void>
}

export function CardConsumptionModal({
    open,
    onClose,
    card,
    onSave,
}: CardConsumptionModalProps) {
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState('')
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
    const [category, setCategory] = useState('')
    const [hasInstallments, setHasInstallments] = useState(false)
    const [installmentTotal, setInstallmentTotal] = useState('1')
    const [createAllInstallments, setCreateAllInstallments] = useState(true)
    const [loading, setLoading] = useState(false)

    if (!open || !card) return null

    const handleSave = async () => {
        if (!description.trim() || !amount || Number(amount) <= 0) return

        setLoading(true)
        try {
            await onSave({
                cardId: card.id,
                description: description.trim(),
                amount: Number(amount),
                purchaseDateISO: purchaseDate,
                category: category.trim() || undefined,
                installmentTotal: hasInstallments ? Number(installmentTotal) : undefined,
                createAllInstallments: hasInstallments ? createAllInstallments : undefined,
            })
            // Reset form
            setDescription('')
            setAmount('')
            setPurchaseDate(new Date().toISOString().split('T')[0])
            setCategory('')
            setHasInstallments(false)
            setInstallmentTotal('1')
            setCreateAllInstallments(true)
            onClose()
        } finally {
            setLoading(false)
        }
    }

    const installmentAmount = hasInstallments && Number(installmentTotal) > 1
        ? Number(amount) / Number(installmentTotal)
        : Number(amount)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-md bg-[#151E32] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#0B1121]">
                    <div>
                        <h2 className="text-lg font-display font-bold text-white">Agregar Consumo</h2>
                        <p className="text-xs text-slate-400">{card.name} • {card.bank}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                        <Label>Descripción</Label>
                        <Input
                            placeholder="ej: Coto Supermercado"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Monto Total (ARS)</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha de Compra</Label>
                            <Input
                                type="date"
                                value={purchaseDate}
                                onChange={(e) => setPurchaseDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Categoría (opcional)</Label>
                        <Input
                            placeholder="ej: Supermercado, Tecnología"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        />
                    </div>

                    {/* Installments Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-[#0B1121]">
                        <div>
                            <span className="text-sm font-medium text-white">En Cuotas</span>
                            <p className="text-xs text-slate-400">Dividir en pagos mensuales</p>
                        </div>
                        <Switch checked={hasInstallments} onCheckedChange={setHasInstallments} />
                    </div>

                    {hasInstallments && (
                        <div className="space-y-4 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <div className="space-y-2">
                                <Label>Cantidad de Cuotas</Label>
                                <Input
                                    type="number"
                                    min={2}
                                    max={48}
                                    value={installmentTotal}
                                    onChange={(e) => setInstallmentTotal(e.target.value)}
                                />
                            </div>

                            {Number(amount) > 0 && Number(installmentTotal) > 1 && (
                                <p className="text-sm text-indigo-300">
                                    {Number(installmentTotal)} cuotas de{' '}
                                    <span className="font-mono font-bold">
                                        ${installmentAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                                    </span>
                                </p>
                            )}

                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm text-white">Crear todas las cuotas</span>
                                    <p className="text-xs text-slate-400">Aparecerán automáticamente cada mes</p>
                                </div>
                                <Switch checked={createAllInstallments} onCheckedChange={setCreateAllInstallments} />
                            </div>
                        </div>
                    )}

                    <Button
                        className="w-full"
                        onClick={handleSave}
                        disabled={loading || !description.trim() || !amount || Number(amount) <= 0}
                    >
                        {loading ? 'Guardando...' : 'Agregar Consumo'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
