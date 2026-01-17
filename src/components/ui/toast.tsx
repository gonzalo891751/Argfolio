import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

// Toast Types
interface ToastData {
    id: string
    title: string
    description?: string
    variant?: 'default' | 'success' | 'error' | 'info'
    duration?: number
}

interface ToastContextValue {
    toast: (data: Omit<ToastData, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}

// Provider Component
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastData[]>([])

    const toast = useCallback((data: Omit<ToastData, 'id'>) => {
        const id = Math.random().toString(36).substring(2, 9)
        const duration = data.duration ?? 3000

        setToasts(prev => [...prev, { ...data, id }])

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {createPortal(
                <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2">
                    {toasts.map(t => (
                        <ToastItem key={t.id} {...t} onDismiss={() => removeToast(t.id)} />
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    )
}

// Toast Item Component
function ToastItem({
    title,
    description,
    variant = 'default',
    onDismiss,
}: ToastData & { onDismiss: () => void }) {
    const icons = {
        default: Check,
        success: Check,
        error: AlertCircle,
        info: Info,
    }
    const Icon = icons[variant]

    const iconColors = {
        default: 'bg-emerald-500/20 text-emerald-400',
        success: 'bg-emerald-500/20 text-emerald-400',
        error: 'bg-rose-500/20 text-rose-400',
        info: 'bg-blue-500/20 text-blue-400',
    }

    const borderColors = {
        default: 'border-emerald-500/30',
        success: 'border-emerald-500/30',
        error: 'border-rose-500/30',
        info: 'border-blue-500/30',
    }

    return (
        <div
            className={cn(
                'bg-slate-800 border text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3',
                'animate-in slide-in-from-right-5 fade-in duration-300',
                borderColors[variant]
            )}
        >
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', iconColors[variant])}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1">
                <h4 className="font-medium text-sm">{title}</h4>
                {description && <p className="text-xs text-slate-400">{description}</p>}
            </div>
            <button
                onClick={onDismiss}
                className="text-slate-500 hover:text-white transition p-1"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
