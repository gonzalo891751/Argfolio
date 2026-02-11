import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface SheetContextValue {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | undefined>(undefined)

interface SheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
    return (
        <SheetContext.Provider value={{ open, onOpenChange }}>
            {children}
        </SheetContext.Provider>
    )
}

function SheetTrigger({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
    const context = React.useContext(SheetContext)

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => context?.onOpenChange(true),
        })
    }

    return (
        <button onClick={() => context?.onOpenChange(true)} {...props}>
            {children}
        </button>
    )
}



function SheetContent({
    children,
    className,
    side = 'right',
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { side?: 'left' | 'right' }) {
    const context = React.useContext(SheetContext)

    // Lock body scroll when open
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
        <div className="fixed inset-0 z-[100] flex justify-start">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in data-[state=closed]:animate-fade-out"
                onClick={() => context.onOpenChange(false)}
            />
            {/* Sheet */}
            <div
                className={cn(
                    'fixed z-[101] flex flex-col bg-background shadow-2xl transition-transform duration-300 h-[100dvh]',
                    side === 'right'
                        ? 'inset-y-0 right-0 w-3/4 max-w-sm border-l animate-slide-in-right'
                        : 'inset-y-0 left-0 w-3/4 max-w-xs border-r animate-slide-in-left', // Mobile nav specific width
                    className
                )}
                {...props}
            >
                <div className="flex-1 overflow-y-auto">
                    <button
                        onClick={() => context.onOpenChange(false)}
                        className="absolute right-2 top-2 w-11 h-11 flex items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-50"
                        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Cerrar</span>
                    </button>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    )
}

function SheetHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('flex flex-col space-y-2 p-6 text-left', className)}
            {...props}
        />
    )
}

function SheetTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h2
            className={cn('text-lg font-semibold text-foreground', className)}
            {...props}
        />
    )
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle }
