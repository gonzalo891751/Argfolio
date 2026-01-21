// =============================================================================
// FINANCES MODAL — Wizard for Add/Edit Debt, Expense, Income, Budget
// =============================================================================

import { useState, useEffect } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TypeSelector } from './TypeSelector'
import { DebtWizard } from './DebtWizard'
import { BudgetForm } from './BudgetForm'
import type {
    PFDebt,
    FixedExpense,
    Income,
    BudgetCategory,
    NewItemType,
    ExpenseCategory
} from '../models/types'


type ModalStep = 'type' | 'form'
type ModalType = 'debt' | 'expense' | 'income' | 'budget' | 'expense-normal'

interface FinancesModalProps {
    isOpen: boolean
    onClose: () => void
    type?: ModalType
    editItem?: PFDebt | FixedExpense | Income | BudgetCategory | null
    onSave: (data: any, type: ModalType) => void
    preselectedType?: NewItemType // For quick actions
}

export function FinancesModal({
    isOpen,
    onClose,
    type: initialType,
    editItem,
    onSave,
    preselectedType,
}: FinancesModalProps) {
    const [step, setStep] = useState<ModalStep>('type')
    const [selectedType, setSelectedType] = useState<NewItemType | null>(null)
    const [formData, setFormData] = useState<any>({})

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            if (editItem && initialType) {
                // Edit mode: skip type selection
                setSelectedType(initialType as NewItemType)
                setFormData({ ...editItem })
                setStep('form')
            } else if (preselectedType) {
                // Quick action: skip type selection
                setSelectedType(preselectedType)
                setFormData(getDefaultFormData(preselectedType))
                setStep('form')
            } else {
                // New item: show type selector
                setStep('type')
                setSelectedType(null)
                setFormData({})
            }
        }
    }, [isOpen, editItem, initialType, preselectedType])

    const handleTypeSelect = (type: NewItemType) => {
        setSelectedType(type)
        setFormData(getDefaultFormData(type))
        setStep('form')
    }

    const handleBackToType = () => {
        setStep('type')
        setSelectedType(null)
    }

    const handleSave = (data: any) => {
        const modalType = mapNewItemTypeToModalType(selectedType!)
        onSave(data, modalType)
        onClose()
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSave(formData)
    }

    if (!isOpen) return null

    const title = editItem
        ? `Editar ${getTypeLabel(selectedType)}`
        : step === 'type'
            ? '¿Qué querés agregar?'
            : `Nuevo ${getTypeLabel(selectedType)}`

    const subtitle = step === 'type'
        ? 'Seleccioná el tipo de registro'
        : selectedType === 'income'
            ? 'Registrando ingreso'
            : selectedType === 'budget'
                ? 'Definir presupuesto variable'
                : 'Completá los datos'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border bg-muted/30">
                    <div>
                        <h3 className="text-lg font-medium text-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    {step === 'type' && (
                        <TypeSelector onSelect={handleTypeSelect} />
                    )}

                    {step === 'form' && selectedType === 'debt' && (
                        <DebtWizard
                            onSave={handleSave}
                            onBack={handleBackToType}
                            initialData={editItem as PFDebt | undefined}
                        />
                    )}

                    {step === 'form' && selectedType === 'budget' && (
                        <BudgetForm onSave={handleSave} onBack={handleBackToType} />
                    )}

                    {step === 'form' && selectedType === 'expense-fixed' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!editItem && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToType}
                                    className="mb-2"
                                >
                                    <ArrowLeft size={14} className="mr-1" /> Volver
                                </Button>
                            )}
                            <ExpenseForm formData={formData} setFormData={setFormData} />
                            <div className="pt-4 flex gap-3">
                                <Button type="submit" className="flex-1">
                                    {editItem ? 'Guardar Cambios' : 'Guardar'}
                                </Button>
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    )}

                    {step === 'form' && selectedType === 'income' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!editItem && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToType}
                                    className="mb-2"
                                >
                                    <ArrowLeft size={14} className="mr-1" /> Volver
                                </Button>
                            )}
                            <IncomeForm formData={formData} setFormData={setFormData} />
                            <div className="pt-4 flex gap-3">
                                <Button type="submit" className="flex-1">
                                    {editItem ? 'Guardar Cambios' : 'Guardar Ingreso'}
                                </Button>
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    )}

                    {step === 'form' && selectedType === 'expense-normal' && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {!editItem && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToType}
                                    className="mb-2"
                                >
                                    <ArrowLeft size={14} className="mr-1" /> Volver
                                </Button>
                            )}
                            <NormalExpenseForm formData={formData} setFormData={setFormData} />
                            <div className="pt-4 flex gap-3">
                                <Button type="submit" className="flex-1">
                                    Registrar Gasto
                                </Button>
                                <Button type="button" variant="outline" onClick={onClose}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getTypeLabel(type: NewItemType | null): string {
    switch (type) {
        case 'income': return 'Ingreso'
        case 'debt': return 'Deuda'
        case 'expense-fixed': return 'Gasto Fijo'
        case 'budget': return 'Presupuesto'
        case 'expense-normal': return 'Gasto'
        default: return ''
    }
}

function mapNewItemTypeToModalType(type: NewItemType): ModalType {
    if (type === 'expense-fixed') return 'expense'
    return type as ModalType
}

function getDefaultFormData(type: NewItemType): any {
    switch (type) {
        case 'debt':
            return {
                title: '',
                counterparty: '',
                totalAmount: 0,
                remainingAmount: 0,
                installmentsCount: 1,
                currentInstallment: 1,
                interestMode: 'none',
                monthlyValue: 0,
                dueDateDay: 10,
                status: 'active',
                category: 'credit_card',
            }
        case 'expense-fixed':
            return {
                title: '',
                amount: 0,
                dueDay: 10,
                category: 'service',
                status: 'pending',
                autoDebit: false,
            }
        case 'income':
            return {
                title: '',
                amount: 0,
                dateExpected: 1,
                isGuaranteed: true,
                status: 'pending',
            }
        case 'budget':
            return {
                name: '',
                estimatedAmount: 0,
            }
        case 'expense-normal':
            return {
                title: '',
                amount: 0,
                category: '',
                date: new Date().toISOString().split('T')[0],
            }
        default:
            return {}
    }
}

// -----------------------------------------------------------------------------
// Expense Form
// -----------------------------------------------------------------------------

function ExpenseForm({
    formData,
    setFormData,
}: {
    formData: any
    setFormData: (data: any) => void
}) {
    const updateField = (field: string, value: any) => {
        setFormData({ ...formData, [field]: value })
    }

    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Nombre del Gasto
                </Label>
                <Input
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Ej: Alquiler, Netflix"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">Monto</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                        <Input
                            type="number"
                            value={formData.amount || ''}
                            onChange={(e) => updateField('amount', Number(e.target.value))}
                            placeholder="0"
                            className="pl-8 font-mono"
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">
                        Día de Vencimiento
                    </Label>
                    <Input
                        type="number"
                        min={1}
                        max={31}
                        value={formData.dueDay || 10}
                        onChange={(e) => updateField('dueDay', Number(e.target.value))}
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">Categoría</Label>
                <select
                    value={formData.category || 'service'}
                    onChange={(e) => updateField('category', e.target.value as ExpenseCategory)}
                    className="w-full bg-background border border-border rounded-lg py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="service">Servicio</option>
                    <option value="subscription">Suscripción</option>
                    <option value="education">Educación</option>
                    <option value="housing">Vivienda</option>
                    <option value="insurance">Seguro</option>
                </select>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="autoDebit"
                    checked={formData.autoDebit || false}
                    onChange={(e) => updateField('autoDebit', e.target.checked)}
                    className="rounded bg-background border-border text-primary focus:ring-0"
                />
                <Label htmlFor="autoDebit" className="text-sm text-muted-foreground">
                    Débito automático
                </Label>
            </div>
        </>
    )
}

// -----------------------------------------------------------------------------
// Income Form
// -----------------------------------------------------------------------------

function IncomeForm({
    formData,
    setFormData,
}: {
    formData: any
    setFormData: (data: any) => void
}) {
    const updateField = (field: string, value: any) => {
        setFormData({ ...formData, [field]: value })
    }

    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Fuente de Ingreso
                </Label>
                <Input
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Ej: Sueldo, Freelance"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">Monto</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                        <Input
                            type="number"
                            value={formData.amount || ''}
                            onChange={(e) => updateField('amount', Number(e.target.value))}
                            placeholder="0"
                            className="pl-8 font-mono"
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">
                        Día Esperado
                    </Label>
                    <Input
                        type="number"
                        min={1}
                        max={31}
                        value={formData.dateExpected || 1}
                        onChange={(e) => updateField('dateExpected', Number(e.target.value))}
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isGuaranteed"
                    checked={formData.isGuaranteed ?? true}
                    onChange={(e) => updateField('isGuaranteed', e.target.checked)}
                    className="rounded bg-background border-border text-primary focus:ring-0"
                />
                <Label htmlFor="isGuaranteed" className="text-sm text-muted-foreground">
                    Ingreso fijo (garantizado todos los meses)
                </Label>
            </div>
        </>
    )
}

// -----------------------------------------------------------------------------
// Normal Expense Form (Quick Expense)
// -----------------------------------------------------------------------------

function NormalExpenseForm({
    formData,
    setFormData,
}: {
    formData: any
    setFormData: (data: any) => void
}) {
    const updateField = (field: string, value: any) => {
        setFormData({ ...formData, [field]: value })
    }

    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Concepto
                </Label>
                <Input
                    value={formData.title || ''}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Ej: Almuerzo, Taxi"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">Monto</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                        <Input
                            type="number"
                            value={formData.amount || ''}
                            onChange={(e) => updateField('amount', Number(e.target.value))}
                            placeholder="0"
                            className="pl-8 font-mono"
                            required
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs font-mono text-muted-foreground uppercase">Fecha</Label>
                    <Input
                        type="date"
                        value={formData.date || ''}
                        onChange={(e) => updateField('date', e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Categoría (opcional)
                </Label>
                <Input
                    value={formData.category || ''}
                    onChange={(e) => updateField('category', e.target.value)}
                    placeholder="Ej: Comida, Transporte"
                />
            </div>
        </>
    )
}
