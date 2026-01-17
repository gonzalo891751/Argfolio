
import { useState, useRef, useEffect } from 'react'
import { Building2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BANK_SUGGESTIONS, type BankSuggestion } from '@/domain/pf/types'

interface BankTypeaheadProps {
    value: string
    onChange: (bankName: string) => void
    placeholder?: string
    className?: string
}

export function BankTypeahead({
    value,
    onChange,
    placeholder = 'Ej: Banco Nación, Galicia...',
    className,
}: BankTypeaheadProps) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Sync search with external value if typing hasn't started or distinct
    useEffect(() => {
        if (value && value !== search) {
            // Only override if we are not actively typing? 
            // Actually for a simple input-like typeahead, we often want the input to reflect value.
            // But here we want free text too.
            // Let's treat 'search' as the input value.
            setSearch(value)
        }
    }, [value])

    // Filter suggestions
    const filtered = search.length > 0
        ? BANK_SUGGESTIONS.filter(
            b => b.name.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 50)
        : BANK_SUGGESTIONS.slice(0, 10) // Show some defaults if empty? Or nothing?

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = (bank: BankSuggestion) => {
        onChange(bank.name)
        setSearch(bank.name)
        setIsOpen(false)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value
        setSearch(newVal)
        onChange(newVal) // Allow free text
        setIsOpen(true)
    }

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-slate-500" />
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={handleChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500"
                    autoComplete="off"
                />
                {search.length > 0 && (
                    <button
                        onClick={() => {
                            setSearch('')
                            onChange('')
                        }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && filtered.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-[#1E293B] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-auto">
                    <ul className="py-1 text-sm text-slate-300">
                        {filtered.map(bank => (
                            <li
                                key={bank.id}
                                onClick={() => handleSelect(bank)}
                                className="px-4 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition"
                            >
                                <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center text-xs font-bold">
                                    {bank.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="text-white font-medium">{bank.name}</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
