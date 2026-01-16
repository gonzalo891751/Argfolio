/**
 * Valuation Mode Toggle
 * Segmented button for switching between Market and Liquidation modes
 */

import { cn } from '@/lib/utils'
import type { ValuationMode } from '@/domain/fx/types'

interface ValuationModeToggleProps {
    value: ValuationMode
    onChange: (mode: ValuationMode) => void
    className?: string
}

export function ValuationModeToggle({ value, onChange, className }: ValuationModeToggleProps) {
    return (
        <div className={cn("flex bg-muted rounded-lg p-1", className)}>
            <button
                onClick={() => onChange('market')}
                className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-all font-medium",
                    value === 'market'
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                Market (Mid)
            </button>
            <button
                onClick={() => onChange('liquidation')}
                className={cn(
                    "px-4 py-1.5 text-sm rounded-md transition-all font-medium",
                    value === 'liquidation'
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                )}
            >
                Liquidación
            </button>
        </div>
    )
}
