import { cn } from '@/lib/utils'

interface RefreshOverlayProps {
    visible: boolean
}

/**
 * RefreshOverlay - Full-screen overlay shown during data refresh
 * Features blur backdrop, spinner, and status text
 */
export function RefreshOverlay({ visible }: RefreshOverlayProps) {
    return (
        <div className={cn('refresh-overlay', visible && 'visible')}>
            <div className="text-center">
                {/* Spinner ring */}
                <div className="relative w-16 h-16 mx-auto mb-6">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>

                {/* Status text */}
                <p className="font-display text-sm tracking-widest text-primary font-bold animate-pulse-slow uppercase">
                    Actualizando Mercado
                </p>
                <p className="font-mono text-xs text-slate-500 mt-2">
                    Conectando con Argfolio Engine...
                </p>
            </div>
        </div>
    )
}
