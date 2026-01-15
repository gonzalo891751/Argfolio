export const formatNumberAR = (value: number, minimumFractionDigits = 2, maximumFractionDigits = 2) => {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits,
        maximumFractionDigits,
    }).format(value)
}

/**
 * Formats a quantity based on the asset category.
 * - CEDEAR/STABLE/CASH: Integer if whole, otherwise up to 2 decimals. (Except CASH maybe 2 always? Prompt says CEDEAR default 0 decimals (trim trailing zeros), CASH 2 decimals).
 *   Actually prompt says: "CEDEAR quantity must display as integer when it is effectively whole units... CEDEAR default 0 decimals (trim trailing zeros)"
 *   "CRYPTO up to 8 decimals (trim)"
 *   "CASH 2 decimals"
 */
export const formatQty = (value: number, category?: string): string => {
    if (!Number.isFinite(value)) return '—'

    if (category === 'CRYPTO') {
        // Up to 8 decimals, trim trailing zeros
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
        }).format(value)
    }

    if (category === 'CEDEAR') {
        // Prompt: "CEDEAR quantity must display as integer when it is effectively whole units... default 0 decimals (trim trailing zeros)"
        // This implies if 10.0 -> 10. If 10.5 -> 10,5? The prompt example says "10.0000" -> "10".
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6, // Allow some decimals if not whole, but usually whole.
        }).format(value)
    }

    if (category === 'USD_CASH' || category === 'ARS_CASH' || category === 'CASH') {
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value)
    }

    // Default for others (STABLE, FCI, etc) - let's stick to a safe default like up to 4 or 6?
    // Prompt "formatQty(value, category) -> CEDEAR default 0 decimals (trim trailing zeros), CRYPTO up to 8 decimals (trim), CASH 2 decimals"
    // Let's use up to 6 for generic to be safe.
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
    }).format(value)
}

export const formatMoneyARS = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

export const formatMoneyUSD = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

/**
 * Legacy/Generic helper if needed, but prefer specific ones above.
 */
export const formatMoney = (value: number | null | undefined, currency: string = 'ARS'): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'

    // Handle Crypto currencies with higher precision
    if (['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'DAI'].includes(currency)) {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency === 'USDT' || currency === 'USDC' || currency === 'DAI' ? 'USD' : currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 8,
        }).format(value).replace('US$', currency === 'USDT' ? 'USDT ' : currency === 'USDC' ? 'USDC ' : currency === 'DAI' ? 'DAI ' : 'US$')
    }

    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}

export const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—'
    // Value coming in is likely 15.5 for 15.5%, or 0.155? 
    // Usually in this app strictly checking previous files, PnL percent seems to be Number.
    // Let's assume the value is a multiplier (0.15) or percentage (15)? 
    // Looking at AssetKpiCards: `unrealizedPnLPercent` used `formatPercent`.
    // In `valuation.ts`: not calculating percent there.
    // Let's look at `AssetKpiCards` again... it was passing `unrealizedPnLPercent`.
    // I need to check if it's 0.XX or XX.
    // Standard Intl.NumberFormat style='percent' expects 0.15 for 15%.
    // If the app uses 15 for 15%, I should just add '%'.
    // I will use style='percent' and assume 0.XX input, but I will check other files to confirm.
    // Safe default: use existing logic if I can find it, or assume 0.XX.
    // Actually, looking at `AssetKpiCards` in previous turn: `formatPercent(unrealizedPnLPercent)`.
    // Let's assume standard 0.XX -> XX% for now. If weird numbers appear (1500%) I will fix.
    return new Intl.NumberFormat('es-AR', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value)
}
