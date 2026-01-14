import type {
    ValuationResult,
    AssetCategory,
    Currency,
    FxRates,
} from '@/domain/types'

/**
 * Calculates the valuation of a holding based on its category and currency.
 * 
 * Rules:
 * 1) CRYPTO: valueUsd = qty * priceUsd; valueArs = valueUsd * fxRates.cripto
 * 2) STABLECOIN: priceUsd = 1.0 (unless overridden); same conversion as CRYPTO
 * 3) CEDEAR:
 *    - valueArs = qty * priceArs (from manual price or provider)
 *    - valueUsd = valueArs / fxRates.mep (default)
 * 4) CASH in USD: valueUsd = amount; valueArs = valueUsd * fxRates.oficial
 * 5) CASH in ARS: valueArs = amount; valueUsd = valueArs / fxRates.oficial
 * 
 * @param quantity Total quantity of the asset
 * @param price Current price (either USD for Crypto/Stable or ARS for Cedear)
 * @param category Asset category
 * @param currency Native currency of the asset
 * @param fxRates Current FX rates
 */
export function calculateValuation(
    quantity: number,
    price: number | undefined,
    category: AssetCategory,
    currency: Currency,
    fxRates: FxRates
): ValuationResult {
    // Default result if missing data (nulls to avoid poisoning totals)
    const nullResult: ValuationResult = {
        valueArs: null,
        valueUsd: null,
        fxUsed: 'MEP',
        exchangeRate: fxRates.mep,
        ruleApplied: 'MISSING_DATA'
    }

    if (quantity === 0) {
        return {
            valueArs: 0,
            valueUsd: 0,
            fxUsed: 'MEP',
            exchangeRate: fxRates.mep,
            ruleApplied: 'ZERO_QTY'
        }
    }

    // -------------------------------------------------------------------------
    // 1 & 2. CRYPTO & STABLECOIN
    // -------------------------------------------------------------------------
    if (category === 'CRYPTO' || category === 'STABLE') {
        const effPrice = price ?? 0
        const valueUsd = quantity * effPrice
        const fxUsed = 'CRIPTO'
        const exchangeRate = fxRates.cripto
        const valueArs = valueUsd * exchangeRate

        return {
            valueUsd,
            valueArs,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CRYPTO_TO_ARS'
        }
    }

    // -------------------------------------------------------------------------
    // 3. CEDEAR (Native currency usually ARS for local quotes)
    // -------------------------------------------------------------------------
    if (category === 'CEDEAR') {
        // If price is missing (undefined or 0/NaN check depending on provider contract)
        // We return NULL so it doesn't count as 0 value in totals
        if (price === undefined || price === null) {
            return nullResult
        }

        const valueArs = quantity * price
        const fxUsed = 'MEP'
        const exchangeRate = fxRates.mep
        // valueUsd implies implicit USD value via MEP
        const valueUsd = exchangeRate > 0 ? valueArs / exchangeRate : 0

        return {
            valueArs,
            valueUsd,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CEDEAR_IMPLICIT_USD'
        }
    }

    // -------------------------------------------------------------------------
    // 4. CASH (USD)
    // -------------------------------------------------------------------------
    if (category === 'USD_CASH') {
        // For cash, quantity is the amount
        const valueUsd = quantity
        const fxUsed = 'OFICIAL'
        const exchangeRate = fxRates.oficial
        const valueArs = valueUsd * exchangeRate

        return {
            valueUsd,
            valueArs,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CASH_USD_OFFICIAL'
        }
    }

    // -------------------------------------------------------------------------
    // 5. CASH (ARS)
    // -------------------------------------------------------------------------
    if (category === 'ARS_CASH') {
        const valueArs = quantity
        const fxUsed = 'OFICIAL'
        const exchangeRate = fxRates.oficial
        const valueUsd = exchangeRate > 0 ? valueArs / exchangeRate : 0

        return {
            valueArs,
            valueUsd,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CASH_ARS_OFFICIAL'
        }
    }

    // -------------------------------------------------------------------------
    // Fallback for other things (e.g. FCI, WALLET, OTHER) or Explicit Currency
    // -------------------------------------------------------------------------
    const effPrice = price ?? 1
    const valueNative = quantity * effPrice

    if (currency === 'USD') {
        return {
            valueUsd: valueNative,
            valueArs: valueNative * fxRates.mep, // Use MEP for generics
            fxUsed: 'MEP',
            exchangeRate: fxRates.mep,
            ruleApplied: 'GENERIC_USD'
        }
    } else {
        const rate = fxRates.mep
        return {
            valueArs: valueNative,
            valueUsd: rate > 0 ? valueNative / rate : 0,
            fxUsed: 'MEP',
            exchangeRate: rate,
            ruleApplied: 'GENERIC_ARS'
        }
    }
}
