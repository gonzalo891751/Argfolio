import { Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreditCardPlasticProps {
    title: string
    holderName: string
    last4: string
    network?: 'VISA' | 'MASTERCARD' | 'AMEX'
    className?: string
}

function NetworkBadge({ network }: { network?: 'VISA' | 'MASTERCARD' | 'AMEX' }) {
    if (network === 'MASTERCARD') {
        return (
            <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-rose-500/80" />
                <span className="w-5 h-5 rounded-full bg-amber-400/80 -ml-2" />
            </div>
        )
    }

    if (network === 'AMEX') {
        return (
            <span className="text-[11px] font-mono tracking-widest text-white/80">
                AMEX
            </span>
        )
    }

    return (
        <span className="text-[12px] font-mono tracking-widest text-white/80">
            VISA
        </span>
    )
}

export function CreditCardPlastic({
    title,
    holderName,
    last4,
    network,
    className,
}: CreditCardPlasticProps) {
    return (
        <div
            className={cn(
                'relative w-full max-w-sm mx-auto lg:mx-0 aspect-[1.586/1]',
                className
            )}
            style={{ perspective: '1000px' }}
        >
            <div className="absolute inset-0 rounded-2xl p-6 flex flex-col justify-between border border-white/20 backdrop-blur-[20px] bg-gradient-to-br from-white/10 to-white/5 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] transition-transform duration-500 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-sky-400/10 rounded-2xl pointer-events-none" />
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 blur-3xl rounded-full pointer-events-none" />

                <div className="flex justify-between items-start z-10">
                    <span className="font-display font-semibold text-lg tracking-wider text-white/90">
                        {title}
                    </span>
                    <Wifi className="w-6 h-6 text-white/50 rotate-90" />
                </div>

                <div className="w-12 h-9 rounded bg-gradient-to-tr from-yellow-200 to-yellow-500 opacity-80 z-10 flex items-center justify-center border border-yellow-600/30">
                    <div className="w-full h-[1px] bg-black/20" />
                </div>

                <div className="z-10 space-y-4">
                    <div className="font-mono text-lg md:text-xl text-white tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                        **** **** **** {last4}
                    </div>
                    <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-white/50 uppercase font-mono mb-0.5">
                                Titular
                            </span>
                            <span className="text-sm font-medium text-white/90 uppercase tracking-wide">
                                {holderName}
                            </span>
                        </div>
                        <NetworkBadge network={network} />
                    </div>
                </div>
            </div>
        </div>
    )
}
