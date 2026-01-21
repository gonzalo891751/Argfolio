/**
 * HeaderLogo - Logo with glow effect and hover animation
 * Inline SVG isotipo from prototype with exact effects
 */
export function HeaderLogo() {
    return (
        <div className="flex items-center gap-3 shrink-0 cursor-pointer group w-10 md:w-auto logo-container">
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

            {/* Brand Name */}
            <span className="font-display font-bold text-xl tracking-tight hidden md:block text-white group-hover:text-primary/90 transition-colors duration-300">
                Argfolio
            </span>
        </div>
    )
}
