/**
 * Display formatting for the simple views: whole pesos for big amounts,
 * cents only where they matter, explicit signs for results.
 */

const nf = (min: number, max: number) => new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
})

const nf0 = nf(0, 0)
const nf2 = nf(2, 2)

function abs(value: number): number {
    return Math.abs(value)
}

export function fmtArs(value: number | null | undefined, opts: { cents?: boolean } = {}): string {
    if (value == null || !Number.isFinite(value)) return '—'
    const cents = opts.cents ?? abs(value) < 1000
    const body = (cents ? nf2 : nf0).format(abs(value))
    return `${value < 0 ? '−' : ''}$ ${body}`
}

export function fmtUsd(value: number | null | undefined, opts: { cents?: boolean } = {}): string {
    if (value == null || !Number.isFinite(value)) return '—'
    const cents = opts.cents ?? abs(value) < 10_000
    const body = (cents ? nf2 : nf0).format(abs(value))
    return `${value < 0 ? '−' : ''}US$ ${body}`
}

export function fmtMoney(value: number | null | undefined, currency: 'ARS' | 'USD', opts: { cents?: boolean } = {}): string {
    return currency === 'USD' ? fmtUsd(value, opts) : fmtArs(value, opts)
}

function sign(value: number): string {
    if (value > 0) return '+'
    if (value < 0) return '−'
    return ''
}

export function fmtSignedArs(value: number | null | undefined, opts: { cents?: boolean } = {}): string {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${sign(value)}${fmtArs(abs(value), opts)}`
}

export function fmtSignedUsd(value: number | null | undefined, opts: { cents?: boolean } = {}): string {
    if (value == null || !Number.isFinite(value)) return '—'
    return `${sign(value)}${fmtUsd(abs(value), opts)}`
}

/** Fraction to percent: 0.1234 → "+12,3%" */
export function fmtPct(value: number | null | undefined, opts: { signed?: boolean; decimals?: number } = {}): string {
    if (value == null || !Number.isFinite(value)) return '—'
    const decimals = opts.decimals ?? (abs(value) < 0.1 ? 2 : 1)
    const body = nf(decimals, decimals).format(abs(value) * 100)
    const prefix = opts.signed === false ? (value < 0 ? '−' : '') : sign(value)
    return `${prefix}${body}%`
}

export function fmtQty(value: number | null | undefined, maxDecimals = 8): string {
    if (value == null || !Number.isFinite(value)) return '—'
    return nf(0, maxDecimals).format(value)
}

export function fmtRate(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value <= 0) return '—'
    return `$ ${nf0.format(value)}`
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-09-30" → "30 sep" (adds the year when it is not the current one) */
export function fmtDayKey(dateKey: string, now: Date = new Date()): string {
    const [y, m, d] = dateKey.split('-').map(Number)
    if (!y || !m || !d) return dateKey
    const base = `${d} ${MONTHS[m - 1]}`
    return y === now.getFullYear() ? base : `${base} ${y}`
}

export function fmtDateISO(iso: string | undefined, now: Date = new Date()): string {
    if (!iso) return '—'
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return '—'
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return fmtDayKey(key, now)
}

/** Tailwind classes for a result, readable in light and dark themes. */
export function toneClass(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return 'text-muted-foreground'
    return value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
}
