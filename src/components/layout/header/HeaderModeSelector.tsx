import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TickerMode = 'dolar' | 'mercado'

interface HeaderModeSelectorProps {
    mode: TickerMode
    onModeChange: (mode: TickerMode) => void
}

/**
 * HeaderModeSelector - Dropdown for switching between Dólar Hoy and Mercado modes
 * Single chevron that rotates, accessible with Escape/click outside handling
 */
export function HeaderModeSelector({ mode, onModeChange }: HeaderModeSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const modeLabels: Record<TickerMode, string> = {
        dolar: 'Dólar Hoy',
        mercado: 'Mercado',
    }

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [])

    // Close on Escape key
    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [])

    const handleModeSelect = (selectedMode: TickerMode) => {
        onModeChange(selectedMode)
        setIsOpen(false)
    }

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    setIsOpen(!isOpen)
                }}
                className="glass-button h-9 px-4 rounded-full flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200 hover:text-white transition-colors"
                aria-expanded={isOpen}
                aria-haspopup="true"
                aria-label="Seleccionar modo de ticker"
            >
                <span>{modeLabels[mode]}</span>
                <ChevronDown
                    className={cn(
                        "w-3 h-3 text-sky-400 ml-1 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            {/* Dropdown Menu */}
            <div
                className={cn(
                    "absolute top-full right-0 mt-2 w-44 glass-dropdown rounded-xl overflow-hidden",
                    "transform transition-all duration-200 origin-top-right z-50",
                    isOpen
                        ? "opacity-100 visible translate-y-0"
                        : "opacity-0 invisible -translate-y-2"
                )}
            >
                <ul className="py-1">
                    <li>
                        <button
                            className="w-full text-left px-4 py-3 text-sm font-medium text-slate-300 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2 group/item"
                            onClick={() => handleModeSelect('dolar')}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                            Dólar Hoy
                        </button>
                    </li>
                    <li>
                        <button
                            className="w-full text-left px-4 py-3 text-sm font-medium text-slate-300 hover:bg-primary/20 hover:text-white transition-colors flex items-center gap-2 group/item"
                            onClick={() => handleModeSelect('mercado')}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary opacity-0 group-hover/item:opacity-100 transition-opacity" />
                            Mercado
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    )
}
