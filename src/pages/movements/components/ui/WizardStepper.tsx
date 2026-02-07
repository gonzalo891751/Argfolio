import { cn } from '@/lib/utils'

interface WizardStepperProps {
    currentStep: number
    totalSteps: number
    className?: string
}

export function WizardStepper({ currentStep, totalSteps, className }: WizardStepperProps) {
    return (
        <div className={cn('flex gap-2', className)}>
            {Array.from({ length: totalSteps }, (_, i) => {
                const step = i + 1
                return (
                    <div
                        key={step}
                        className={cn(
                            'h-1 flex-1 rounded-full transition-all duration-300',
                            step < currentStep
                                ? 'bg-emerald-500'
                                : step === currentStep
                                    ? 'bg-indigo-500'
                                    : 'bg-slate-700/60',
                        )}
                    />
                )
            })}
        </div>
    )
}
