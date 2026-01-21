import { cn } from '@/lib/utils'

interface ArgfolioLogoProps {
    /** 
     * 'full' = isotipo + text "Argfolio"
     * 'mark' = isotipo only (for collapsed sidebar)
     */
    variant?: 'full' | 'mark'
    className?: string
}

/**
 * ArgfolioLogo - Reusable brand logo component
 * 
 * Features exact prototype effects:
 * - SVG isotipo with drop-shadow glow
 * - Halo blur on hover
 * - Scale 105% on hover
 * - Text color changes to primary/90 on hover
 */
export function ArgfolioLogo({ variant = 'full', className }: ArgfolioLogoProps) {
    const showText = variant === 'full'

    return (
        <div
            className={cn(
                "flex items-center gap-3 shrink-0 cursor-pointer group logo-container",
                className
            )}
        >
            {/* Logo Icon Container */}
            <div className="w-9 h-9 flex items-center justify-center relative transition-transform group-hover:scale-105 duration-300">
                {/* Halo blur effect on hover */}
                <div className="logo-halo" />

                {/* SVG Isotipo with glow */}
                <svg
                    viewBox="0 0 40 40"
                    fill="none"
                    className="w-full h-full text-primary relative z-10 logo-glow"
                >
                    {/* Triangle "A" shape */}
                    <path
                        d="M20 4L4 36H12L20 20L28 36H36L20 4Z"
                        fill="currentColor"
                    />
                    {/* Circle dot */}
                    <circle
                        cx="20"
                        cy="14"
                        r="3"
                        className="text-white"
                        fill="currentColor"
                    />
                </svg>
            </div>

            {/* Brand Name (only in 'full' variant) */}
            {showText && (
                <span className="font-display font-bold text-xl tracking-tight text-foreground group-hover:text-primary/90 transition-colors duration-300">
                    Argfolio
                </span>
            )}
        </div>
    )
}
