/**
 * FX Conversion Tests
 * Tests for Market and Liquidation mode conversions
 */

import { describe, it, expect } from 'vitest'
import { fxMid, toUsdFromArs, toArsFromUsd, buildFxQuote, getEffectiveRate } from './convert'
import type { FxQuote } from './types'

describe('fxMid', () => {
    it('calculates midpoint correctly', () => {
        expect(fxMid(1470, 1485)).toBe(1477.5)
    })

    it('handles null bid', () => {
        expect(fxMid(null, 1485)).toBe(1485)
    })

    it('handles null ask', () => {
        expect(fxMid(1470, null)).toBe(1470)
    })

    it('handles both null', () => {
        expect(fxMid(null, null)).toBe(0)
    })
})

describe('buildFxQuote', () => {
    it('builds quote from FxPair', () => {
        const pair = { buy: 1470, sell: 1485, mid: null }
        const quote = buildFxQuote(pair)

        expect(quote.bid).toBe(1470)
        expect(quote.ask).toBe(1485)
        expect(quote.mid).toBe(1477.5)
    })

    it('handles null pair', () => {
        const quote = buildFxQuote(null)

        expect(quote.bid).toBe(0)
        expect(quote.ask).toBe(0)
        expect(quote.mid).toBe(0)
    })
})

describe('toUsdFromArs', () => {
    const mep: FxQuote = { bid: 1470, ask: 1485, mid: 1477.5 }

    it('uses ask always (selling ARS)', () => {
        const result = toUsdFromArs(98950, mep)

        // 98950 / 1485 ≈ 66.6330
        expect(result).toBeCloseTo(66.6330, 2)
    })

    it('returns null for null input', () => {
        expect(toUsdFromArs(null, mep)).toBeNull()
    })

    it('returns null for zero rate', () => {
        const zeroFx: FxQuote = { bid: 0, ask: 0, mid: 0 }
        expect(toUsdFromArs(1000, zeroFx)).toBeNull()
    })
})

describe('toArsFromUsd', () => {
    const cripto: FxQuote = { bid: 1520, ask: 1535, mid: 1527.5 }

    it('uses bid always (selling USD)', () => {
        const result = toArsFromUsd(860, cripto)

        // 860 * 1520 = 1,307,200
        expect(result).toBeCloseTo(1307200, 0)
    })

    it('returns null for null input', () => {
        expect(toArsFromUsd(null, cripto)).toBeNull()
    })
})

describe('getEffectiveRate', () => {
    const fx: FxQuote = { bid: 1470, ask: 1485, mid: 1477.5 }

    it('returns ask for ars-to-usd', () => {
        expect(getEffectiveRate(fx, 'ars-to-usd')).toBe(1485)
    })

    it('returns bid for usd-to-ars', () => {
        expect(getEffectiveRate(fx, 'usd-to-ars')).toBe(1470)
    })
})
