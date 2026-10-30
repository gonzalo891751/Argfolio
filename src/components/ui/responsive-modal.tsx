import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ResponsiveModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    children: React.ReactNode
    footer?: React.ReactNode
    className?: string
}

/**
 * Bottom sheet on phones, centered dialog on larger screens.
 * Content scrolls; header and footer stay visible.
 */
export function ResponsiveModal({ open, onOpenChange, title, description, children, footer, className }: ResponsiveModalProps) {
    React.useEffect(() => {
        if (!open) return
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false)
        }
        window.addEventListener('keydown', onKey)
        return () => {
            document.body.style.overflow = previous
            window.removeEventListener('keydown', onKey)
        }
    }, [open, onOpenChange])

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" onClick={() => onOpenChange(false)} />
            <div
                className={cn(
                    'relative flex w-full flex-col bg-card text-card-foreground shadow-2xl',
                    'max-h-[92dvh] rounded-t-2xl border-t sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl sm:border',
                    'animate-fade-in',
                    className,
                )}
            >
                <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
                    <div>
                        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
                        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="-mr-1 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
                {footer && <div className="border-t px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
            </div>
        </div>,
        document.body,
    )
}
