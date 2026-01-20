/**
 * FCI Formatters
 * 
 * Utility functions for formatting FCI data in Argentine locale.
 */

/**
 * Format VCP value for ARS currency
 * Example: 1520.35 → "$ 1.520,35"
 */
export function formatVcpArs(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—'
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

/**
 * Format VCP value for USD currency
 * Example: 1.2345 → "US$ 1,2345"
 */
export function formatVcpUsd(value: number | null | undefined, decimals = 4): string {
    if (value == null || !Number.isFinite(value)) return '—'
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals,
    }).format(value)
}

/**
 * Format VCP based on currency
 */
export function formatVcp(value: number | null | undefined, currency: 'ARS' | 'USD'): string {
    return currency === 'USD' ? formatVcpUsd(value) : formatVcpArs(value)
}

/**
 * Format variation percentage with sign
 * Example: 0.0123 → "+1,23%", -0.0045 → "-0,45%"
 */
export function formatVariation(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—'

    const pct = value * 100 // Convert decimal to percentage
    const sign = pct > 0 ? '+' : ''

    return `${sign}${new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(pct)}%`
}

/**
 * Format date in Argentine format
 * Example: "2026-01-20" → "20/01/2026"
 */
export function formatDateAR(dateStr: string | null | undefined): string {
    if (!dateStr) return '—'

    try {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    } catch {
        return dateStr
    }
}

/**
 * Generate deterministic sparkline data from a seed
 * Returns 12 values between 0-1 for consistent visualization
 */
export function generateSparkline(seed: string): number[] {
    // Simple hash function for deterministic random
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
    }

    // Generate 12 pseudo-random values
    const values: number[] = []
    for (let i = 0; i < 12; i++) {
        hash = ((hash * 1103515245) + 12345) & 0x7fffffff
        values.push((hash % 1000) / 1000)
    }

    return values
}

/**
 * Category display mapping
 */
export const CATEGORY_LABELS: Record<string, string> = {
    'Money Market': 'Mercado de Dinero (T+0)',
    'Renta Fija': 'Renta Fija (Bonos)',
    'Renta Mixta': 'Renta Mixta',
    'Renta Variable': 'Renta Variable (Acciones)',
    'Infraestructura': 'Infraestructura',
    'Otros': 'Otros',
}

/**
 * Get display label for category dropdown
 */
export function getCategoryLabel(category: string): string {
    return CATEGORY_LABELS[category] || category
}
