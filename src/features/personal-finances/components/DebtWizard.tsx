// =============================================================================
// DEBT WIZARD — Choose debt subtype and show appropriate form
// =============================================================================

import { useState, useEffect } from 'react'
import { CreditCard, Landmark, Users, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DebtSubtype, DebtCategory, PFDebt } from '../models/types'

interface DebtWizardProps {
    onSave: (data: any) => void
    onBack: () => void
    initialData?: PFDebt
}

const DEBT_SUBTYPES: {
    id: DebtSubtype
    icon: React.ElementType
    label: string
    desc: string
    category: DebtCategory
}[] = [
        {
            id: 'tarjeta',
            icon: CreditCard,
            label: 'Tarjeta de Crédito',
            desc: 'Resumen o consumo específico',
            category: 'credit_card',
        },
        {
            id: 'prestamo',
            icon: Landmark,
            label: 'Préstamo / Entidad',
            desc: 'Banco, financiera',
            category: 'loan',
        },
        {
            id: 'personal',
            icon: Users,
            label: 'Deuda Personal',
            desc: 'Amigo, familiar, proveedor',
            category: 'personal',
        },
    ]

export function DebtWizard({ onSave, onBack, initialData }: DebtWizardProps) {
    const isEditMode = !!initialData?.id

    const [step, setStep] = useState<'subtype' | 'form'>(isEditMode ? 'form' : 'subtype')
    const [selectedSubtype, setSelectedSubtype] = useState<DebtSubtype | null>(() => {
        if (initialData?.category) {
            const categoryToSubtype: Record<DebtCategory, DebtSubtype> = {
                credit_card: 'tarjeta',
                loan: 'prestamo',
                personal: 'personal',
                banco: 'prestamo',
                profesional: 'prestamo',
                comercio: 'prestamo',
                otro: 'prestamo',
                familiar: 'personal',
            }
            return categoryToSubtype[initialData.category as DebtCategory] || 'tarjeta'
        }
        return null
    })
    const [formData, setFormData] = useState<any>(() => {
        if (initialData) {
            return {
                ...initialData,
            }
        }
        return {
            title: '',
            counterparty: '',
            totalAmount: 0,
            installmentsCount: 1,
            currentInstallment: 1,
            monthlyValue: 0,
            dueDateDay: 10,
            interestMode: 'none',
            status: 'active',
            category: 'credit_card',
        }
    })

    useEffect(() => {
        if (initialData) {
            setFormData({ ...initialData })
            setStep('form')
            const categoryToSubtype: Record<DebtCategory, DebtSubtype> = {
                credit_card: 'tarjeta',
                loan: 'prestamo',
                personal: 'personal',
                banco: 'prestamo',
                profesional: 'prestamo',
                comercio: 'prestamo',
                otro: 'prestamo',
                familiar: 'personal',
            }
            setSelectedSubtype(categoryToSubtype[initialData.category as DebtCategory] || 'tarjeta')
        }
    }, [initialData])

    const handleSubtypeSelect = (subtype: DebtSubtype) => {
        setSelectedSubtype(subtype)
        const category = DEBT_SUBTYPES.find((s) => s.id === subtype)?.category || 'credit_card'
        setFormData({ ...formData, category })
        setStep('form')
    }

    const updateField = (field: string, value: any) => {
        const updated = { ...formData, [field]: value }
        // Auto-calculate monthly value
        if (field === 'totalAmount' || field === 'installmentsCount') {
            const total = field === 'totalAmount' ? value : formData.totalAmount
            const count = field === 'installmentsCount' ? value : formData.installmentsCount
            if (total && count) {
                updated.monthlyValue = Math.ceil(total / count)
            }
        }
        setFormData(updated)
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave({
            ...formData,
            remainingAmount: formData.totalAmount,
        })
    }

    if (step === 'subtype') {
        return (
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                    ¿Qué tipo de deuda estás sumando?
                </p>
                <div className="grid grid-cols-1 gap-2">
                    {DEBT_SUBTYPES.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleSubtypeSelect(item.id)}
                            className="flex items-center gap-3 p-4 text-left border border-border rounded-lg hover:bg-accent hover:border-primary/30 transition"
                        >
                            <div className="p-2 rounded-lg bg-muted">
                                <item.icon size={18} className="text-muted-foreground" />
                            </div>
                            <div>
                                <div className="font-medium text-foreground">{item.label}</div>
                                <div className="text-xs text-muted-foreground">{item.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>
                <Button variant="ghost" onClick={onBack} className="w-full mt-2">
                    <ArrowLeft size={16} className="mr-2" /> Volver
                </Button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {!isEditMode && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep('subtype')}
                    className="mb-2"
                >
                    <ArrowLeft size={14} className="mr-1" /> Cambiar tipo
                </Button>
            )}

            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Título / Concepto
                </Label>
                <Input
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder={
                        selectedSubtype === 'tarjeta'
                            ? 'Ej: Visa Galicia'
                            : selectedSubtype === 'prestamo'
                                ? 'Ej: Préstamo Auto'
                                : 'Ej: Préstamo Juan'
                    }
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">
                        {selectedSubtype === 'personal' ? 'Contraparte' : 'Entidad / Banco'}
                    </Label>
                    <Input
                        value={formData.counterparty || ''}
                        onChange={(e) => updateField('counterparty', e.target.value)}
                        placeholder={selectedSubtype === 'personal' ? 'Nombre' : 'Ej: Galicia'}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">
                        Monto Total
                    </Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                        <Input
                            type="number"
                            value={formData.totalAmount || ''}
                            onChange={(e) => updateField('totalAmount', Number(e.target.value))}
                            placeholder="0"
                            className="pl-8 font-mono"
                            required
                        />
                    </div>
                </div>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
                <h4 className="text-xs font-medium text-foreground">Plan de Cuotas</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cantidad Cuotas</Label>
                        <select
                            value={formData.installmentsCount || 1}
                            onChange={(e) => updateField('installmentsCount', Number(e.target.value))}
                            className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {[1, 3, 6, 9, 12, 18, 24, 36, 48].map((n) => (
                                <option key={n} value={n}>
                                    {n} cuota{n > 1 ? 's' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Día de Vencimiento</Label>
                        <Input
                            type="number"
                            min={1}
                            max={31}
                            value={formData.dueDateDay || 10}
                            onChange={(e) => updateField('dueDateDay', Number(e.target.value))}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cuota Actual</Label>
                        <Input
                            type="number"
                            min={1}
                            max={formData.installmentsCount || 1}
                            value={formData.currentInstallment || 1}
                            onChange={(e) => updateField('currentInstallment', Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Valor Cuota</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                            <Input
                                type="number"
                                value={formData.monthlyValue || ''}
                                onChange={(e) => updateField('monthlyValue', Number(e.target.value))}
                                className="pl-8 font-mono"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-4 flex gap-3">
                <Button type="submit" className="flex-1">
                    {isEditMode ? 'Guardar Cambios' : 'Guardar Deuda'}
                </Button>
            </div>
        </form>
    )
}
