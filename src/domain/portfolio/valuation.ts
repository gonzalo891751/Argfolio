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
 * 4) CASH in USD: valueUsd = amount; valueArs = valueUsd * fxRates.mep
 * 5) CASH in ARS: valueArs = amount; valueUsd = valueArs / fxRates.mep
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
        exchangeRate: fxRates.mep.sell || fxRates.mep.buy || 0,
        ruleApplied: 'MISSING_DATA'
    }

    if (!Number.isFinite(quantity)) {
        return nullResult
    }

    if (quantity === 0) {
        return {
            valueArs: 0,
            valueUsd: 0,
            fxUsed: 'MEP',
            exchangeRate: fxRates.mep.sell || fxRates.mep.buy || 0,
            ruleApplied: 'ZERO_QTY'
        }
    }

    // -------------------------------------------------------------------------
    // 1 & 2. CRYPTO & STABLECOIN
    // -------------------------------------------------------------------------
    if (category === 'CRYPTO' || category === 'STABLE') {
        const effPrice = (price !== undefined && Number.isFinite(price)) ? price : 0
        const valueUsd = quantity * effPrice
        const fxUsed = 'CRIPTO'
        const exchangeRate = fxRates.cripto?.sell || fxRates.cripto?.buy || 0

        let valueArs: number | null = null
        if (Number.isFinite(valueUsd) && Number.isFinite(exchangeRate)) {
            valueArs = valueUsd * exchangeRate
        }

        return {
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            valueArs: Number.isFinite(valueArs) ? valueArs : null,
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
        if (price === undefined || price === null || !Number.isFinite(price)) {
            return nullResult
        }

        const valueArs = quantity * price

        // Prefer CCL for theoretical USD valuation of CEDEARs
        // Use SELL price for valuation
        const cclVar = fxRates.ccl.sell || fxRates.ccl.buy
        const mepVar = fxRates.mep.sell || fxRates.mep.buy

        const useCcl = cclVar && cclVar > 0
        const fxUsed = useCcl ? 'CCL' : 'MEP'
        const exchangeRate = useCcl ? cclVar : mepVar

        let valueUsd: number | null = null
        if (Number.isFinite(valueArs) && Number.isFinite(exchangeRate) && exchangeRate && exchangeRate > 0) {
            valueUsd = valueArs / exchangeRate
        }

        return {
            valueArs: Number.isFinite(valueArs) ? valueArs : null,
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            fxUsed,
            exchangeRate: exchangeRate || 0,
            ruleApplied: 'CEDEAR_IMPLICIT_USD'
        }
    }

    // -------------------------------------------------------------------------
    // 4. CASH (USD)
    // -------------------------------------------------------------------------
    if (category === 'USD_CASH') {
        // For cash, quantity is the amount
        const valueUsd = quantity
        const fxUsed = 'MEP' // CHANGED from OFICIAL to MEP
        const exchangeRate = fxRates.mep.sell || fxRates.mep.buy || 0

        let valueArs: number | null = null
        if (Number.isFinite(valueUsd) && Number.isFinite(exchangeRate) && exchangeRate > 0) {
            valueArs = valueUsd * exchangeRate
        }

        return {
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            valueArs: Number.isFinite(valueArs) ? valueArs : null,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CASH_USD_MEP'
        }
    }

    // -------------------------------------------------------------------------
    // 5. CASH (ARS)
    // -------------------------------------------------------------------------
    if (category === 'ARS_CASH') {
        const valueArs = quantity
        const fxUsed = 'MEP' // CHANGED from OFICIAL to MEP
        const exchangeRate = fxRates.mep.sell || fxRates.mep.buy || 0

        let valueUsd: number | null = null
        if (Number.isFinite(valueArs) && Number.isFinite(exchangeRate) && exchangeRate > 0) {
            valueUsd = valueArs / exchangeRate
        }

        return {
            valueArs: Number.isFinite(valueArs) ? valueArs : null,
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            fxUsed,
            exchangeRate,
            ruleApplied: 'CASH_ARS_MEP'
        }
    }

    // -------------------------------------------------------------------------
    // Fallback for other things (e.g. FCI, WALLET, OTHER) or Explicit Currency
    // -------------------------------------------------------------------------
    const effPrice = (price !== undefined && Number.isFinite(price)) ? price : 1
    const valueNative = quantity * effPrice

    if (currency === 'USD') {
        const valueUsd = valueNative
        const rate = fxRates.mep.sell || fxRates.mep.buy || 0
        const valueArs = (Number.isFinite(valueUsd) && Number.isFinite(rate)) ? valueUsd * rate : null

        return {
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            valueArs,
            fxUsed: 'MEP',
            exchangeRate: rate,
            ruleApplied: 'GENERIC_USD'
        }
    } else {
        const valueArs = valueNative
        const rate = fxRates.mep.sell || fxRates.mep.buy || 0
        const valueUsd = (Number.isFinite(valueArs) && Number.isFinite(rate) && rate > 0) ? valueArs / rate : null

        return {
            valueArs: Number.isFinite(valueArs) ? valueArs : null,
            valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
            fxUsed: 'MEP',
            exchangeRate: rate,
            ruleApplied: 'GENERIC_ARS'
        }
    }
}
