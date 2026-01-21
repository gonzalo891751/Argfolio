// =============================================================================
// MONTH PICKER COMPONENT
// =============================================================================

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MonthPickerProps {
    currentDate: Date
    onPrevious: () => void
    onNext: () => void
}

export function MonthPicker({ currentDate, onPrevious, onNext }: MonthPickerProps) {
    const monthLabel = currentDate
        .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        .toUpperCase()

    return (
        <div className="flex items-center bg-card rounded-lg border border-border p-1">
            <Button
                variant="ghost"
                size="icon"
                onClick={onPrevious}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft size={16} />
            </Button>
            <div className="px-4 font-mono text-sm font-medium text-foreground min-w-[140px] text-center">
                {monthLabel}
            </div>
            <Button
                variant="ghost"
                size="icon"
                onClick={onNext}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
                <ChevronRight size={16} />
            </Button>
        </div>
    )
}
