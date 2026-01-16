/**
 * FX Conversion Types
 * Supports Market (mid) and Liquidation (bid/ask) valuation modes
 */

/**
 * Represents an FX quote with bid, ask, and mid prices.
 * - bid: What you get when selling USD (compra in Spanish)
 * - ask: What you pay when buying USD (venta in Spanish)
 * - mid: Midpoint = (bid + ask) / 2
 */
export interface FxQuote {
    bid: number
    ask: number
    mid: number
}

/**
 * FX type keys for different dollar rates
 */
export type FxKey = 'oficial' | 'mep' | 'cripto'

/**
 * Valuation mode for portfolio calculations
 * - market: Uses mid price for all conversions
 * - liquidation: Uses bid/ask depending on direction
 */
export type ValuationMode = 'market' | 'liquidation'

/**
 * Complete FX quotes by type
 */
export interface FxQuotes {
    oficial: FxQuote
    mep: FxQuote
    cripto: FxQuote
}
