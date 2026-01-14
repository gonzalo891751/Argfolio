import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogContextValue {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | undefined>(undefined)

interface DialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    return (
        <DialogContext.Provider value={{ open, onOpenChange }}>
            {children}
        </DialogContext.Provider>
    )
}

export function DialogTrigger({
    children,
    asChild,
}: {
    children: React.ReactNode
    asChild?: boolean
}) {
    const context = React.useContext(DialogContext)

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => context?.onOpenChange(true),
        })
    }

    return (
        <button onClick={() => context?.onOpenChange(true)}>
            {children}
        </button>
    )
}

export function DialogContent({
    children,
    className,
}: {
    children: React.ReactNode
    className?: string
}) {
    const context = React.useContext(DialogContext)

    React.useEffect(() => {
        if (context?.open) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [context?.open])

    if (!context?.open) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={() => context.onOpenChange(false)}
            />
            {/* Dialog */}
            <div
                className={cn(
                    'relative z-[101] w-full max-w-lg max-h-[90vh] overflow-y-auto',
                    'bg-background border rounded-xl shadow-2xl animate-scale-in',
                    className
                )}
            >
                <button
                    onClick={() => context.onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity z-50"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Cerrar</span>
                </button>
                {children}
            </div>
        </div>,
        document.body
    )
}

export function DialogHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('flex flex-col space-y-1.5 p-6 pb-4', className)}
            {...props}
        />
    )
}

export function DialogTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2
            className={cn('text-lg font-semibold leading-none tracking-tight', className)}
            {...props}
        />
    )
}

export function DialogDescription({
    className,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            className={cn('text-sm text-muted-foreground', className)}
            {...props}
        />
    )
}

export function DialogFooter({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0', className)}
            {...props}
        />
    )
}
