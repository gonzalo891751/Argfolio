import { AssetCategory } from '@/domain/types'

export function formatMoney(amount: number, currency: 'ARS' | 'USD' | 'USDT' | 'USDC' | string): string {
    // If currency is USD-like, use USD formatting
    const isUSD = ['USD', 'USDT', 'USDC'].includes(currency)

    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: isUSD ? 'USD' : 'ARS', // es-AR locale uses US$ for USD and $ for ARS usually, or just formats numbers correctly
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount)
}

export function formatQuantity(value: number, category?: AssetCategory): string {
    // defaults
    let minDecimals = 0
    let maxDecimals = 2

    if (category === 'CEDEAR') {
        // CEDEARs must be integers
        minDecimals = 0
        maxDecimals = 0
    } else if (category === 'CRYPTO' || category === 'STABLE') {
        // Crypto up to 8 decimals, trim trailing zeros
        minDecimals = 0
        maxDecimals = 8
    } else if (category === 'FCI') {
        // FCI might need decimals
        maxDecimals = 4
    }

    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    }).format(value)
}

export function formatPercent(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value / 100)
}
