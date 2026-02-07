import { cn } from '@/lib/utils'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'

interface WizardFooterProps {
    onBack?: () => void
    onCancel?: () => void
    primaryLabel: string
    onPrimary: () => void
    primaryVariant?: 'indigo' | 'emerald'
    primaryDisabled?: boolean
    primaryLoading?: boolean
    showBack?: boolean
    backDisabled?: boolean
}

export function WizardFooter({
    onBack,
    onCancel,
    primaryLabel,
    onPrimary,
    primaryVariant = 'indigo',
    primaryDisabled = false,
    primaryLoading = false,
    showBack = true,
    backDisabled = false,
}: WizardFooterProps) {
    const isConfirm = primaryVariant === 'emerald'

    return (
        <div className="px-6 py-4 border-t border-white/10 bg-[#0F172A]/80 backdrop-blur-md flex justify-between items-center shrink-0">
            {/* Left: Back */}
            {showBack ? (
                <button
                    onClick={onBack}
                    disabled={backDisabled}
                    className={cn(
                        'px-4 py-2 text-slate-400 hover:text-white font-medium text-sm transition flex items-center gap-2',
                        backDisabled && 'opacity-30 pointer-events-none',
                    )}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Atrás
                </button>
            ) : (
                <div />
            )}

            {/* Right: Cancel + Primary */}
            <div className="ml-auto flex gap-3">
                {onCancel && (
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-slate-400 hover:text-white font-medium text-sm transition"
                    >
                        Cancelar
                    </button>
                )}
                <button
                    onClick={onPrimary}
                    disabled={primaryDisabled || primaryLoading}
                    className={cn(
                        'px-6 py-2 rounded-lg text-white text-sm font-medium shadow-lg transition flex items-center gap-2',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        primaryVariant === 'indigo' && 'bg-indigo-600 hover:bg-indigo-500',
                        primaryVariant === 'emerald' && 'bg-emerald-600 hover:bg-emerald-500',
                    )}
                >
                    {primaryLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isConfirm ? (
                        <Check className="w-4 h-4" />
                    ) : null}
                    {primaryLoading ? 'Guardando...' : primaryLabel}
                    {!isConfirm && !primaryLoading && <ArrowRight className="w-4 h-4" />}
                </button>
            </div>
        </div>
    )
}
