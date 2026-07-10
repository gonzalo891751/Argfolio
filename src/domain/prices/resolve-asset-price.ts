/**
 * Pure price-resolution logic shared by useAssetsRows (and tests).
 *
 * Priority order:
 *   1. Manual price (user override) — marked as 'estimated' with source 'manual'
 *      so the UI can surface that the valuation is not a live market quote.
 *   2. Category provider quote (PPI for CEDEARs, CoinGecko for crypto/stable).
 *   3. Portfolio engine fallback price (e.g. FCI latest VCP).
 *   4. Missing — the asset must NOT be valued at zero downstream.
 */

import type { ManualPrice } from '@/domain/types'
import { createPriceResult, missingPrice, okPrice, type PriceResult } from './price-result'

export interface ResolveAssetPriceInput {
    category: string
    symbol: string
    instrumentId: string
    manualEntry?: ManualPrice | null
    cedearQuote?: { lastPriceArs?: number | null; updatedAt?: string | null } | null
    cryptoPriceUsd?: number | null
    /** Fallback price already computed by the portfolio engine (e.g. FCI VCP). */
    portfolioPrice?: number | null
}

export function resolveAssetPriceResult(input: ResolveAssetPriceInput): PriceResult {
    const { category, manualEntry, cedearQuote, cryptoPriceUsd, portfolioPrice } = input

    // 1. Manual override always wins, but is flagged as manual/estimated.
    if (manualEntry && Number.isFinite(manualEntry.price) && manualEntry.price > 0) {
        return createPriceResult({
            price: manualEntry.price,
            status: 'estimated',
            source: 'manual',
            asOf: manualEntry.updatedAtISO ?? null,
            confidence: 'medium',
        })
    }

    // 2. Provider quotes per category.
    if (category === 'CEDEAR' && cedearQuote?.lastPriceArs != null && cedearQuote.lastPriceArs > 0) {
        return okPrice(cedearQuote.lastPriceArs, 'PPI', cedearQuote.updatedAt ?? null, 'high')
    }

    if ((category === 'CRYPTO' || category === 'STABLE') && cryptoPriceUsd != null && Number.isFinite(cryptoPriceUsd) && cryptoPriceUsd > 0) {
        return okPrice(cryptoPriceUsd, 'coingecko', null, 'high')
    }

    // 3. Portfolio engine fallback.
    if (portfolioPrice != null && Number.isFinite(portfolioPrice) && portfolioPrice > 0) {
        const source = category === 'FCI' ? 'fci_latest' : 'portfolio'
        return okPrice(portfolioPrice, source, null, category === 'FCI' ? 'high' : 'medium')
    }

    // 4. Missing — downstream consumers must treat this as "value not available".
    return missingPrice(category === 'FCI' ? 'fci_latest' : 'missing')
}

/**
 * True when a PriceResult should be treated as "no valuation available".
 * Callers must not coerce the market value to 0 in this case.
 */
export function isPriceMissing(result: PriceResult | null | undefined): boolean {
    return !result || result.status === 'missing' || result.price == null
}
