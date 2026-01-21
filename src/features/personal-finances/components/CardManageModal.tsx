import { useState, useEffect } from 'react'
import { X, Plus, Trash2, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { PFCreditCard } from '@/db/schema'

interface CardManageModalProps {
    open: boolean
    onClose: () => void
    cards: PFCreditCard[]
    onCreateCard: (card: Omit<PFCreditCard, 'id' | 'createdAt'>) => Promise<void>
    onUpdateCard: (id: string, updates: Partial<PFCreditCard>) => Promise<void>
    onDeleteCard: (id: string) => Promise<void>
}

interface CardFormData {
    bank: string
    name: string
    last4: string
    network: 'VISA' | 'MASTERCARD' | 'AMEX'
    closingDay: number
    dueDay: number
}

const defaultFormData: CardFormData = {
    bank: '',
    name: '',
    last4: '',
    network: 'VISA',
    closingDay: 25,
    dueDay: 5,
}

export function CardManageModal({
    open,
    onClose,
    cards,
    onCreateCard,
    onUpdateCard,
    onDeleteCard,
}: CardManageModalProps) {
    const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<CardFormData>(defaultFormData)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) {
            setMode('list')
            setEditingId(null)
            setFormData(defaultFormData)
        }
    }, [open])

    if (!open) return null

    const handleEdit = (card: PFCreditCard) => {
        setEditingId(card.id)
        setFormData({
            bank: card.bank,
            name: card.name,
            last4: card.last4,
            network: card.network || 'VISA',
            closingDay: card.closingDay,
            dueDay: card.dueDay,
        })
        setMode('edit')
    }

    const handleSave = async () => {
        setLoading(true)
        try {
            if (mode === 'add') {
                await onCreateCard({
                    ...formData,
                    currency: 'ARS',
                })
            } else if (mode === 'edit' && editingId) {
                await onUpdateCard(editingId, formData)
            }
            setMode('list')
            setFormData(defaultFormData)
            setEditingId(null)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (confirm('¿Eliminar esta tarjeta y todos sus consumos?')) {
            await onDeleteCard(id)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-[#151E32] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-[#0B1121]">
                    <div>
                        <h2 className="text-lg font-display font-bold text-white">
                            {mode === 'list' ? 'Administrar Tarjetas' : mode === 'add' ? 'Nueva Tarjeta' : 'Editar Tarjeta'}
                        </h2>
                        <p className="text-xs text-slate-400">
                            {mode === 'list' ? `${cards.length} tarjeta(s) registrada(s)` : 'Completá los datos'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {mode === 'list' ? (
                        <div className="space-y-3">
                            {cards.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">No hay tarjetas</p>
                            ) : (
                                cards.map((card) => (
                                    <div
                                        key={card.id}
                                        className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                                    >
                                        <div className="flex items-center gap-3">
                                            <CreditCard className="w-8 h-8 text-slate-400" />
                                            <div>
                                                <div className="text-white font-medium">{card.name}</div>
                                                <div className="text-xs text-slate-400">
                                                    {card.bank} •  **** {card.last4}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(card)}>
                                                Editar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-rose-400 hover:text-rose-300"
                                                onClick={() => handleDelete(card.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                            <Button className="w-full mt-4" onClick={() => setMode('add')}>
                                <Plus className="w-4 h-4 mr-1" />
                                Agregar Tarjeta
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Banco / Entidad</Label>
                                    <Input
                                        placeholder="ej: Galicia"
                                        value={formData.bank}
                                        onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Nombre de Tarjeta</Label>
                                    <Input
                                        placeholder="ej: Visa Signature"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Últimos 4 dígitos</Label>
                                    <Input
                                        placeholder="4509"
                                        maxLength={4}
                                        value={formData.last4}
                                        onChange={(e) => setFormData({ ...formData, last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Red</Label>
                                    <Select
                                        value={formData.network}
                                        onChange={(e) => setFormData({ ...formData, network: e.target.value as 'VISA' | 'MASTERCARD' | 'AMEX' })}
                                        options={[
                                            { value: 'VISA', label: 'Visa' },
                                            { value: 'MASTERCARD', label: 'Mastercard' },
                                            { value: 'AMEX', label: 'American Express' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Día de Cierre</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={formData.closingDay}
                                        onChange={(e) => setFormData({ ...formData, closingDay: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Día de Vencimiento</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={formData.dueDay}
                                        onChange={(e) => setFormData({ ...formData, dueDay: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button variant="outline" className="flex-1" onClick={() => setMode('list')}>
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={handleSave}
                                    disabled={loading || !formData.bank || !formData.name || !formData.last4}
                                >
                                    {loading ? 'Guardando...' : 'Guardar'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
