/**
 * FX Conversion Functions
 * Handles ARS ↔ USD conversions with Market and Liquidation modes
 */

import type { FxQuote } from './types'
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
    fx: FxQuote
): number | null {
    if (ars == null || !Number.isFinite(ars)) return null

    // Always Liquidation: ARS -> USD = Pay Ask
    const rate = fx.ask

    if (!rate || rate === 0 || !Number.isFinite(rate)) return null

    const result = ars / rate
    return Number.isFinite(result) ? result : null
}

/**
 * Convert USD to ARS
 * - Liquidation mode: multiplies by bid (you're selling USD = get bid)
 */
export function toArsFromUsd(
    usd: number | null | undefined,
    fx: FxQuote
): number | null {
    if (usd == null || !Number.isFinite(usd)) return null

    // Always Liquidation: USD -> ARS = Get Bid
    const rate = fx.bid

    if (!Number.isFinite(rate)) return null

    const result = usd * rate
    return Number.isFinite(result) ? result : null
}

/**
 * Get the effective FX rate used for a conversion based on direction
 */
export function getEffectiveRate(
    fx: FxQuote,
    direction: 'ars-to-usd' | 'usd-to-ars'
): number {
    // FORCE LIQUIDATION MODE (User Request)
    // Always use realizable value (Bid/Ask)
    // Market/Mid is removed.

    // Liquidation mode logic:
    if (direction === 'ars-to-usd') {
        return fx.ask // Selling ARS, buying USD → pay ask
    } else {
        return fx.bid // Selling USD, buying ARS → get bid
    }
}


/**
 * Get the label for the effective rate (e.g. "Mid", "Compra", "Venta")
 */
export function getFxRateLabel(
    direction: 'ars-to-usd' | 'usd-to-ars'
): string {
    // Always Liquidation Labels
    if (direction === 'ars-to-usd') return 'Venta' // Paying Ask
    return 'Compra' // Getting Bid
}

/**
 * Helper to determine the correct FX rate for a movement snapshot
 * Rules:
 * - BUY USD Assets -> You are performing ARS->USD (buying USD) -> You pay Seller's Price -> USE SELL (Ask)
 * - SELL USD Assets -> You are performing USD->ARS (selling USD) -> You get Buyer's Price -> USE BUY (Bid)
 */
export function getFxForTradeSnapshot(
    side: 'buy' | 'sell', // Movement side (BUY asset or SELL asset)
    rates: FxQuote
): { rate: number; sideLabel: 'buy' | 'sell' | 'mid' } {
    // If movement is BUY (Buying Asset/USD), we need the Rate to convert ARS to USD.
    // We pay the Ask price (Venta).
    if (side === 'buy') {
        const r = rates.ask || rates.mid
        return { rate: r, sideLabel: 'sell' }
    }

    // If movement is SELL (Selling Asset/USD), we get the Bid price (Compra).
    if (side === 'sell') {
        const r = rates.bid || rates.mid
        return { rate: r, sideLabel: 'buy' }
    }

    return { rate: rates.mid, sideLabel: 'mid' }
}
