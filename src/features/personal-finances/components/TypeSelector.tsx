// =============================================================================
// TYPE SELECTOR — Modal wizard step 1: Choose what to add
// =============================================================================

import {
    TrendingUp,
    CreditCard,
    Zap,
    PieChart,
    ShoppingBag,
} from 'lucide-react'
import type { NewItemType } from '../models/types'

interface TypeSelectorProps {
    onSelect: (type: NewItemType) => void
}

const TYPE_OPTIONS: {
    id: NewItemType
    icon: React.ElementType
    label: string
    desc: string
    colorClass: string
}[] = [
        {
            id: 'income',
            icon: TrendingUp,
            label: 'Nuevo Ingreso',
            desc: 'Sueldo, freelance, ventas',
            colorClass: 'text-emerald-400',
        },
        {
            id: 'debt',
            icon: CreditCard,
            label: 'Nueva Deuda',
            desc: 'Tarjeta, préstamo, personal',
            colorClass: 'text-rose-400',
        },
        {
            id: 'expense-fixed',
            icon: Zap,
            label: 'Gasto Fijo',
            desc: 'Recurrente mensual',
            colorClass: 'text-amber-400',
        },
        {
            id: 'budget',
            icon: PieChart,
            label: 'Presupuesto',
            desc: 'Estimación variable (super, nafta)',
            colorClass: 'text-primary',
        },
        {
            id: 'expense-normal',
            icon: ShoppingBag,
            label: 'Gasto Puntual',
            desc: 'Registro rápido del mes',
            colorClass: 'text-muted-foreground',
        },
    ]

export function TypeSelector({ onSelect }: TypeSelectorProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            {TYPE_OPTIONS.map((item) => (
                <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="flex flex-col items-start p-4 rounded-xl border border-border bg-muted/30 hover:bg-accent hover:border-primary/30 transition-all text-left group"
                >
                    <div
                        className={`mb-3 p-2 rounded-lg bg-background border border-border ${item.colorClass} group-hover:border-primary/30`}
                    >
                        <item.icon size={20} />
                    </div>
                    <span className="font-medium text-foreground mb-1 group-hover:text-primary transition-colors">
                        {item.label}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                        {item.desc}
                    </span>
                </button>
            ))}
        </div>
    )
}
