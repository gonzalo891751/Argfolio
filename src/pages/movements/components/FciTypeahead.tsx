/**
 * FCI Typeahead Component
 * 
 * Search/select FCI funds from market data for the movement wizard.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMarketFci } from '@/hooks/useMarketFci'
import type { FciFund } from '@/domain/fci/types'

// Simplified type for display/edit - only core fields required
export interface FciValue {
    id: string
    name: string
    manager: string
    category: string
    currency: 'ARS' | 'USD'
    vcp: number
    date: string
}

export interface FciTypeaheadProps {
    value: FciValue | null
    onChange: (fund: FciFund | null) => void
    restrictToIds?: string[] // For SELL mode: only show owned funds
    disabled?: boolean
    placeholder?: string
}

/**
 * Generate stable ID for FCI fund
 */
export function generateFciSlug(fund: { manager: string; name: string; currency: string }): string {
    const slug = `${fund.manager}|${fund.name}|${fund.currency}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9|]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    return `fci:${slug.slice(0, 80)}`
}

export function FciTypeahead({
    value,
    onChange,
    restrictToIds,
    disabled,
    placeholder = 'Buscar fondo...'
}: FciTypeaheadProps) {
    const { items, isLoading } = useMarketFci()
    const [query, setQuery] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [highlightIndex, setHighlightIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Filter results
    const filteredItems = useMemo(() => {
        let result = items

        // Apply restriction if in SELL mode
        if (restrictToIds && restrictToIds.length > 0) {
            const idSet = new Set(restrictToIds)
            result = result.filter(f => idSet.has(generateFciSlug(f)))
        }

        // Apply search filter
        if (query.trim()) {
            const q = query.toLowerCase()
            result = result.filter(f =>
                f.name.toLowerCase().includes(q) ||
                f.manager.toLowerCase().includes(q)
            )
        }

        // Limit to top 20
        return result.slice(0, 20)
    }, [items, query, restrictToIds])

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Reset highlight when results change
    useEffect(() => {
        setHighlightIndex(0)
    }, [filteredItems.length])

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true)
            }
            return
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setHighlightIndex(i => Math.min(i + 1, filteredItems.length - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setHighlightIndex(i => Math.max(i - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (filteredItems[highlightIndex]) {
                    onChange(filteredItems[highlightIndex])
                    setIsOpen(false)
                    setQuery('')
                }
                break
            case 'Escape':
                setIsOpen(false)
                break
        }
    }

    const handleSelect = (fund: FciFund) => {
        onChange(fund)
        setIsOpen(false)
        setQuery('')
    }

    const handleClear = () => {
        onChange(null)
        setQuery('')
        inputRef.current?.focus()
    }

    // Format VCP based on currency
    const formatVcp = (vcp: number, currency: string) => {
        if (currency === 'USD') {
            return `US$ ${vcp.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
        }
        return `$ ${vcp.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Selected Value Display */}
            {value && !isOpen ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border">
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate">{value.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{value.manager}</span>
                            <span className="px-1.5 py-0.5 rounded bg-background text-[10px]">{value.currency}</span>
                            <span className="px-1.5 py-0.5 rounded bg-background text-[10px]">{value.category}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-sm">{formatVcp(value.vcp, value.currency)}</div>
                        <div className="text-[10px] text-muted-foreground">{value.date}</div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="p-1 hover:bg-background rounded"
                        disabled={disabled}
                    >
                        <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            ) : (
                /* Search Input */
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setIsOpen(true)
                        }}
                        onFocus={() => setIsOpen(true)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="w-full pl-10 pr-4 py-3 rounded-lg bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                    {isLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-muted border-l-primary rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}

            {/* Dropdown */}
            {isOpen && !value && (
                <div className="absolute z-50 w-full mt-1 max-h-80 overflow-auto rounded-lg bg-card border border-border shadow-xl">
                    {filteredItems.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                            {restrictToIds && restrictToIds.length === 0
                                ? 'No tenés FCI en esta cuenta para vender'
                                : query
                                    ? 'No se encontraron fondos'
                                    : 'Escribí para buscar...'}
                        </div>
                    ) : (
                        filteredItems.map((fund, idx) => (
                            <button
                                key={fund.id}
                                type="button"
                                onClick={() => handleSelect(fund)}
                                className={cn(
                                    "w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted transition",
                                    idx === highlightIndex && "bg-muted"
                                )}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-foreground truncate">{fund.name}</div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span className="truncate">{fund.manager}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] shrink-0">{fund.currency}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] shrink-0 hidden sm:inline">{fund.category}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="font-mono text-sm">{formatVcp(fund.vcp, fund.currency)}</div>
                                    {fund.variation1d != null && (
                                        <div className={cn(
                                            "text-[10px] flex items-center gap-0.5 justify-end",
                                            fund.variation1d > 0 ? "text-success" : fund.variation1d < 0 ? "text-destructive" : "text-muted-foreground"
                                        )}>
                                            {fund.variation1d > 0 ? <TrendingUp className="h-3 w-3" /> : fund.variation1d < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                            {(fund.variation1d * 100).toFixed(2)}%
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
