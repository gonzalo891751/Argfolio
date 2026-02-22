/**
 * Shared Costing Method Picker
 *
 * Pill-style selector for lot costing methods (PPP/PEPS/UEPS/Baratos/Manual).
 * Reused across CEDEAR, Crypto, and FCI sell wizards.
 */

import { cn } from '@/lib/utils'
import { COSTING_METHODS, type CostingMethod } from '@/domain/portfolio/lot-allocation'

export interface CostMethodPickerProps {
    value: CostingMethod
    onChange: (method: CostingMethod) => void
    /** Methods to exclude from the picker */
    exclude?: CostingMethod[]
    /** Accent color class. Default: 'indigo' */
    accent?: 'indigo' | 'rose'
}

export function CostMethodPicker({
    value,
    onChange,
    exclude = [],
    accent = 'indigo',
}: CostMethodPickerProps) {
    const methods = exclude.length > 0
        ? COSTING_METHODS.filter(m => !exclude.includes(m.value))
        : COSTING_METHODS

    const activeClasses = accent === 'rose'
        ? 'border-rose-500/50 bg-rose-500/10 text-rose-400 font-bold'
        : 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 font-bold'

    return (
        <div className="flex gap-2 flex-wrap">
            {methods.map(m => (
                <button
                    key={m.value}
                    onClick={() => onChange(m.value)}
                    className={cn(
                        'px-3 py-1.5 rounded-full border text-xs transition',
                        value === m.value
                            ? activeClasses
                            : 'border-white/10 text-slate-400 hover:text-white'
                    )}
                    title={m.description}
                >
                    {m.short}
                </button>
            ))}
        </div>
    )
}
