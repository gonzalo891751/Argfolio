import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatCurrency(
    value: number,
    currency: 'ARS' | 'USD' | 'USDT' | 'USDC' | 'BTC' | 'ETH' = 'ARS',
    options?: { showSign?: boolean; compact?: boolean }
): string {
    const { showSign = false, compact = false } = options ?? {}

    // Handle crypto currencies
    if (currency === 'BTC' || currency === 'ETH') {
        const formatted = new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: currency === 'BTC' ? 8 : 4,
            maximumFractionDigits: currency === 'BTC' ? 8 : 4,
        }).format(Math.abs(value))
        const prefix = showSign && value > 0 ? '+' : value < 0 ? '-' : ''
        return `${prefix}${formatted} ${currency}`
    }

    const isStablecoin = currency === 'USDT' || currency === 'USDC'

    const formatter = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: isStablecoin ? 'USD' : currency,
        minimumFractionDigits: currency === 'ARS' ? 0 : 2,
        maximumFractionDigits: currency === 'ARS' ? 0 : 2,
        notation: compact ? 'compact' : 'standard',
    })

    let formatted = formatter.format(Math.abs(value))

    if (isStablecoin) {
        formatted = formatted.replace('US$', `${currency} `)
    }

    if (showSign && value !== 0) {
        formatted = (value > 0 ? '+' : '-') + formatted
    } else if (value < 0) {
        formatted = '-' + formatted
    }

    return formatted
}


export function formatPercent(value: number, options?: { showSign?: boolean }): string {
    const { showSign = true } = options ?? {}
    const sign = showSign && value > 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
}

export function formatNumber(value: number, decimals = 2): string {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value)
}

export function formatRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Recién'
    if (diffMins === 1) return 'Hace 1 min'
    if (diffMins < 60) return `Hace ${diffMins} min`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours === 1) return 'Hace 1 hora'
    if (diffHours < 24) return `Hace ${diffHours} horas`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Hace 1 día'
    return `Hace ${diffDays} días`
}

export function getChangeColor(value: number): string {
    if (value > 0) return 'text-success'
    if (value < 0) return 'text-destructive'
    return 'text-muted-foreground'
}

export function getChangeBgColor(value: number): string {
    if (value > 0) return 'bg-success/10 text-success'
    if (value < 0) return 'bg-destructive/10 text-destructive'
    return 'bg-muted text-muted-foreground'
}
