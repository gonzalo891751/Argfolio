import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipContextValue {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextValue | undefined>(undefined)

function TooltipProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}

function Tooltip({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(false)

    return (
        <TooltipContext.Provider value={{ open, onOpenChange: setOpen }}>
            <div className="relative inline-block">
                {children}
            </div>
        </TooltipContext.Provider>
    )
}

function TooltipTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
    const context = React.useContext(TooltipContext)

    const handleMouseEnter = () => context?.onOpenChange(true)
    const handleMouseLeave = () => context?.onOpenChange(false)

    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<{
            onMouseEnter?: () => void
            onMouseLeave?: () => void
        }>, {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
        })
    }

    return (
        <span onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {children}
        </span>
    )
}

function TooltipContent({
    children,
    className,
    side = 'top',
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { side?: 'top' | 'bottom' | 'left' | 'right' }) {
    const context = React.useContext(TooltipContext)

    if (!context?.open) return null

    const positions = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    }

    return (
        <div
            className={cn(
                'absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-fade-in',
                positions[side],
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
