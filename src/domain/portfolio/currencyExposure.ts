import type { HoldingAggregated, Exposure } from '@/domain/types'

/**
 * Compute real currency exposure (Native ARS vs Native USD).
 * Separates holdings into "Real ARS" and "Real USD" buckets based on asset nature.
 * 
 * Rules:
 * - ARS: Cash ARS, PF, FCI ARS, Debt ARS.
 * - USD: Cash USD, Crypto, Stable, CEDEAR (Implied USD), FCI USD, Stocks.
 */
export function computeExposure(
    holdings: HoldingAggregated[],
    fxMepBuy: number
): Exposure {
    let arsReal = 0
    let usdReal = 0

    for (const h of holdings) {
        // Skip empty holdings to avoid noise, though 0 value doesn't hurt sums
        if (!h.instrument) continue

        let isUsd = false
        const cat = h.instrument.category
        const cur = h.instrument.nativeCurrency

        // Classification Logic
        if (['CRYPTO', 'STABLE', 'CEDEAR', 'USD_CASH', 'STOCK'].includes(cat)) {
            isUsd = true
        } else if (cat === 'FCI' && cur === 'USD') {
            isUsd = true
        } else if (cat === 'FCI' && cur === 'ARS') {
            isUsd = false
        } else if (['ARS_CASH', 'PF', 'DEBT', 'WALLET'].includes(cat)) {
            isUsd = false
        } else {
            // Fallback by currency
            isUsd = cur === 'USD' || cur === 'USDT' || cur === 'USDC' // etc
        }

        if (isUsd) {
            // Add to USD Bucket (Native Amount)
            // Use valueUSD if available (which is Quantity * PriceUSD)
            // For CEDEARs, valueUSD is derived as ValueARS / FX. This represents the "External" Dollar Value.
            usdReal += h.valueUSD ?? 0
        } else {
            // Add to ARS Bucket (Native Amount)
            arsReal += h.valueARS ?? 0
        }
    }

    // Convert USD to ARS Eq for Percentage Calculation
    // User requested using MEP Buy for conservative estimate (or consistent conversion)
    const usdEqArs = usdReal * fxMepBuy
    const arsEq = arsReal
    const totalEq = arsEq + usdEqArs

    const pctArs = totalEq > 0 ? (arsEq / totalEq) : 0
    const pctUsd = totalEq > 0 ? (usdEqArs / totalEq) : 0

    return {
        arsReal,
        usdReal,
        fxMepBuy,
        arsEq, // == arsReal
        usdEqArs,
        totalEq,
        pctArs,
        pctUsd
    }
}
