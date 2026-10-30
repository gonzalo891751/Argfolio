/**
 * Small form primitives for the quick entry sheet, themed with the app tokens
 * (they work in light and dark mode). Inputs use 16px text so phones don't zoom.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export const inputClass = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground',
    'placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40',
    'disabled:opacity-60',
)

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <label className={cn('block space-y-1.5', className)}>
            <span className="text-sm font-medium text-foreground">{label}</span>
            {children}
            {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </label>
    )
}

export function Segmented<T extends string>({
    value,
    onChange,
    options,
    className,
}: {
    value: T
    onChange: (value: T) => void
    options: Array<{ value: T; label: string }>
    className?: string
}) {
    return (
        <div className={cn('grid gap-1 rounded-xl bg-muted p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
            {options.map(opt => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        'h-9 rounded-lg px-2 text-sm font-medium transition-colors',
                        value === opt.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-pressed={value === opt.value}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

/** Parses "1.234,56", "1234.56" or "1234,56" into a number. */
export function parseAmount(raw: string): number {
    const trimmed = raw.trim().replace(/\s/g, '').replace(/^\$|^US\$/i, '')
    if (!trimmed) return NaN
    const hasComma = trimmed.includes(',')
    const hasDot = trimmed.includes('.')
    let normalized = trimmed
    if (hasComma && hasDot) {
        // The last separator is the decimal one
        normalized = trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
            ? trimmed.replace(/\./g, '').replace(',', '.')
            : trimmed.replace(/,/g, '')
    } else if (hasComma) {
        normalized = trimmed.replace(',', '.')
    } else if (hasDot) {
        // "1.234.567" (thousands) vs "1234.5" (decimal)
        const parts = trimmed.split('.')
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && /^\d+$/.test(parts[1]) && Number(parts[0]) > 0)) {
            normalized = trimmed.replace(/\./g, '')
        }
    }
    const value = Number(normalized)
    return Number.isFinite(value) ? value : NaN
}

export function NumberInput({
    value,
    onChange,
    placeholder,
    prefix,
    autoFocus,
    ariaLabel,
}: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    prefix?: string
    autoFocus?: boolean
    ariaLabel?: string
}) {
    return (
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
            <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                aria-label={ariaLabel}
                className={cn(inputClass, 'tabular-nums', prefix && (prefix.length > 2 ? 'pl-12' : 'pl-8'))}
                value={value}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={e => onChange(e.target.value)}
            />
        </div>
    )
}

export function todayInputValue(now: Date = new Date()): string {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Date input value → ISO timestamp (now for today, midday for past days). */
export function dateInputToISO(value: string, now: Date = new Date()): string {
    if (!value || value === todayInputValue(now)) return now.toISOString()
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}
