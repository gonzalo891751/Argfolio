// =============================================================================
// BUDGET FORM — Create a new budget category
// =============================================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BudgetFormProps {
    onSave: (data: { name: string; estimatedAmount: number }) => void
    onBack: () => void
}

export function BudgetForm({ onSave, onBack }: BudgetFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        estimatedAmount: 0,
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSave(formData)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Categoría
                </Label>
                <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Supermercado, Nafta, Salidas"
                    required
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground uppercase">
                    Presupuesto Mensual Estimado
                </Label>
                <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">$</span>
                    <Input
                        type="number"
                        value={formData.estimatedAmount || ''}
                        onChange={(e) =>
                            setFormData({ ...formData, estimatedAmount: Number(e.target.value) })
                        }
                        placeholder="0"
                        className="pl-8 font-mono"
                        required
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    Este monto se restará de tu disponible como "gasto variable"
                </p>
            </div>

            <div className="pt-4 flex gap-3">
                <Button type="submit" className="flex-1">
                    Definir Presupuesto
                </Button>
                <Button type="button" variant="outline" onClick={onBack}>
                    Volver
                </Button>
            </div>
        </form>
    )
}
