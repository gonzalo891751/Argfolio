// =============================================================================
// REGISTER MOVEMENT PROMPT — Ask user to create movement
// =============================================================================

import { useState } from 'react'
import { X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAccounts } from '@/hooks/use-instruments'
import { formatARS } from '../models/calculations'
import {
    createMovementFromFinance,
    buildDebtPaymentDescription,
    buildExpensePaymentDescription,
    buildIncomeDescription,
} from '../services/movementBridge'
import type { Currency } from '@/domain/types'

interface RegisterMovementPromptProps {
    isOpen: boolean
    onClose: () => void
    type: 'debt' | 'expense' | 'income'
    title: string
    amount: number
    installmentInfo?: string // e.g., "3/12"
    defaultAccountId?: string
    linkId: string
}

export function RegisterMovementPrompt({
    isOpen,
    onClose,
    type,
    title,
    amount,
    installmentInfo,
    defaultAccountId,
    linkId,
}: RegisterMovementPromptProps) {
    const [step, setStep] = useState<'ask' | 'form'>('ask')
    const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId || '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { data: accounts = [] } = useAccounts()

    if (!isOpen) return null

    const handleNo = () => {
        setStep('ask')
        onClose()
    }

    const handleYes = () => {
        setStep('form')
        // Pre-select default account if available
        if (defaultAccountId && !selectedAccountId) {
            setSelectedAccountId(defaultAccountId)
        }
    }

    const handleSubmit = async () => {
        if (!selectedAccountId) return

        setIsSubmitting(true)
        try {
            let description = ''
            if (type === 'debt' && installmentInfo) {
                const [current, total] = installmentInfo.split('/').map(Number)
                description = buildDebtPaymentDescription(title, current, total)
            } else if (type === 'expense') {
                description = buildExpensePaymentDescription(title)
            } else {
                description = buildIncomeDescription(title)
            }

            await createMovementFromFinance({
                type: type === 'income' ? 'income' : 'expense',
                accountId: selectedAccountId,
                date: new Date().toISOString(),
                amount,
                currency: 'ARS' as Currency,
                description,
                tags: ['finanzas', type],
                link: { kind: type, id: linkId },
            })

            setStep('ask')
            onClose()
        } catch (error) {
            console.error('Failed to create movement:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const movementType = type === 'income' ? 'Ingreso' : 'Egreso'
    const movementTypeColor = type === 'income' ? 'text-emerald-400' : 'text-rose-400'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={handleNo}
            />

            {/* Modal */}
            <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                    <h3 className="text-sm font-medium text-foreground">Registrar Movimiento</h3>
                    <button
                        onClick={handleNo}
                        className="text-muted-foreground hover:text-foreground transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {step === 'ask' ? (
                        <AskStep onNo={handleNo} onYes={handleYes} />
                    ) : (
                        <FormStep
                            accounts={accounts}
                            selectedAccountId={selectedAccountId}
                            onAccountChange={setSelectedAccountId}
                            amount={amount}
                            title={title}
                            movementType={movementType}
                            movementTypeColor={movementTypeColor}
                            isSubmitting={isSubmitting}
                            onSubmit={handleSubmit}
                            onCancel={handleNo}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Ask Step
// -----------------------------------------------------------------------------

function AskStep({ onNo, onYes }: { onNo: () => void; onYes: () => void }) {
    return (
        <div className="text-center">
            <p className="text-foreground mb-6">¿Registrar movimiento en el sistema?</p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={onNo} className="flex-1">
                    No
                </Button>
                <Button onClick={onYes} className="flex-1">
                    Sí, registrar
                    <ArrowRight size={16} className="ml-2" />
                </Button>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Form Step
// -----------------------------------------------------------------------------

interface FormStepProps {
    accounts: { id: string; name: string; kind: string }[]
    selectedAccountId: string
    onAccountChange: (id: string) => void
    amount: number
    title: string
    movementType: string
    movementTypeColor: string
    isSubmitting: boolean
    onSubmit: () => void
    onCancel: () => void
}

function FormStep({
    accounts,
    selectedAccountId,
    onAccountChange,
    amount,
    title,
    movementType,
    movementTypeColor,
    isSubmitting,
    onSubmit,
    onCancel,
}: FormStepProps) {
    return (
        <div className="space-y-4">
            {/* Preview */}
            <div className="p-3 bg-muted/30 rounded-lg border border-border">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <span className={`text-xs font-medium ${movementTypeColor}`}>{movementType}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-muted-foreground">Monto</span>
                    <span className="text-sm font-mono text-foreground">{formatARS(amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Descripción</span>
                    <span className="text-xs text-foreground truncate max-w-[150px]">{title}</span>
                </div>
            </div>

            {/* Account Select */}
            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Cuenta / Billetera
                </Label>
                <select
                    value={selectedAccountId}
                    onChange={(e) => onAccountChange(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                >
                    <option value="">Seleccionar cuenta...</option>
                    {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.kind})
                        </option>
                    ))}
                </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onCancel} className="flex-1" disabled={isSubmitting}>
                    Cancelar
                </Button>
                <Button
                    onClick={onSubmit}
                    className="flex-1"
                    disabled={!selectedAccountId || isSubmitting}
                >
                    {isSubmitting ? 'Registrando...' : 'Registrar'}
                </Button>
            </div>
        </div>
    )
}
