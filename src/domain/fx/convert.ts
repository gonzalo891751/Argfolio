/**
 * FX Conversion Functions
 * Handles ARS ↔ USD conversions with Market and Liquidation modes
 */

import type { FxQuote, ValuationMode } from './types'
import type { FxPair } from '@/domain/types'

/**
 * Calculate the midpoint from bid and ask prices
 */
export function fxMid(bid: number | null | undefined, ask: number | null | undefined): number {
    const b = bid ?? 0
    const a = ask ?? 0

    if (b === 0 && a === 0) return 0
    if (b === 0) return a
    if (a === 0) return b

    return (b + a) / 2
}

/**
 * Build an FxQuote from an existing FxPair (from DolarAPI)
 * If only one value is available, uses it for all three
 */
export function buildFxQuote(pair: FxPair | undefined | null): FxQuote {
    if (!pair) {
        return { bid: 0, ask: 0, mid: 0 }
    }

    const bid = pair.buy ?? pair.sell ?? 0
    const ask = pair.sell ?? pair.buy ?? 0
    const mid = fxMid(bid, ask)

    return { bid, ask, mid }
}

/**
 * Convert ARS to USD
 * - Market mode: divides by mid
 * - Liquidation mode: divides by ask (you're selling ARS = buying USD = pay ask)
 */
export function toUsdFromArs(
    ars: number | null | undefined,
    fx: FxQuote,
    mode: ValuationMode
): number | null {
    if (ars == null || !Number.isFinite(ars)) return null

    const rate = mode === 'market' ? fx.mid : fx.ask

    if (!rate || rate === 0 || !Number.isFinite(rate)) return null

    const result = ars / rate
    return Number.isFinite(result) ? result : null
}

/**
 * Convert USD to ARS
 * - Market mode: multiplies by mid
 * - Liquidation mode: multiplies by bid (you're selling USD = get bid)
 */
export function toArsFromUsd(
    usd: number | null | undefined,
    fx: FxQuote,
    mode: ValuationMode
): number | null {
    if (usd == null || !Number.isFinite(usd)) return null

    const rate = mode === 'market' ? fx.mid : fx.bid

    if (!Number.isFinite(rate)) return null

    const result = usd * rate
    return Number.isFinite(result) ? result : null
}

/**
 * Get the effective FX rate used for a conversion based on mode and direction
 */
export function getEffectiveRate(
    fx: FxQuote,
    mode: ValuationMode,
    direction: 'ars-to-usd' | 'usd-to-ars'
): number {
    if (mode === 'market') {
        return fx.mid
    }

    // Liquidation mode
    if (direction === 'ars-to-usd') {
        return fx.ask // Selling ARS, buying USD → pay ask
    } else {
        return fx.bid // Selling USD, buying ARS → get bid
    }
}
