/**
 * Asset Valuation Tests
 * Tests for computeAssetMetrics with various asset classes
 */

import { describe, it, expect } from 'vitest'
import { computeAssetMetrics, computePortfolioTotals, getFxKeyForAsset } from './valuation'
import type { AssetInput, AssetPrices } from './types'
import type { FxQuotes } from '@/domain/fx/types'

// Test Fixtures
const fxQuotes: FxQuotes = {
    oficial: { bid: 1060, ask: 1080, mid: 1070 },
    mep: { bid: 1470, ask: 1485, mid: 1477.5 },
    cripto: { bid: 1520, ask: 1535, mid: 1527.5 },
}

describe('getFxKeyForAsset', () => {
    it('returns mep for CEDEAR', () => {
        expect(getFxKeyForAsset('CEDEAR')).toBe('mep')
    })

    it('returns cripto for CRYPTO', () => {
        expect(getFxKeyForAsset('CRYPTO')).toBe('cripto')
    })

    it('returns oficial for CASH_ARS', () => {
        expect(getFxKeyForAsset('CASH_ARS')).toBe('oficial')
        expect(getFxKeyForAsset('ARS_CASH')).toBe('oficial')
    })
})

describe('computeAssetMetrics - CEDEAR', () => {
    const cedearInput: AssetInput = {
        instrumentId: 'aapl-id',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        category: 'CEDEAR',
        nativeCurrency: 'ARS',
        quantity: 5,
        avgCostNative: 15000,
        costBasisArs: 75000, // 5 * 15000
        cedearRatio: 10,
        underlyingSymbol: 'AAPL.US',
    }

    const cedearPrices: AssetPrices = {
        currentPrice: 19790,
        underlyingUsd: 175.50,
        changePct1d: 1.5,
    }

    it('calculates valuations correctly in market mode', () => {
        const result = computeAssetMetrics(cedearInput, cedearPrices, fxQuotes, 'market')

        // valArs = 5 * 19790 = 98,950
        expect(result.valArs).toBe(98950)

        // valUsdEq = 98950 / 1477.5 (mid) ≈ 66.9712
        expect(result.valUsdEq).toBeCloseTo(66.9712, 2)

        // costArs = 75,000
        expect(result.costArs).toBe(75000)

        // pnlArs = 98950 - 75000 = 23,950
        expect(result.pnlArs).toBe(23950)

        // pnlPct = 23950 / 75000 ≈ 0.3193
        expect(result.pnlPct).toBeCloseTo(0.3193, 3)

        expect(result.fxKeyUsed).toBe('mep')
    })

    it('calculates valuations correctly in liquidation mode', () => {
        const result = computeAssetMetrics(cedearInput, cedearPrices, fxQuotes, 'liquidation')

        // valArs = 5 * 19790 = 98,950
        expect(result.valArs).toBe(98950)

        // valUsdEq = 98950 / 1485 (ask) ≈ 66.6330
        expect(result.valUsdEq).toBeCloseTo(66.6330, 2)
    })

    it('includes CEDEAR structural details', () => {
        const result = computeAssetMetrics(cedearInput, cedearPrices, fxQuotes, 'market')

        expect(result.cedearDetails).toBeDefined()

        // usdExposure = 5 * (175.50 / 10) = 5 * 17.55 = 87.75
        expect(result.cedearDetails?.usdExposure).toBeCloseTo(87.75, 2)

        // impliedFx = (19790 * 10) / 175.50 ≈ 1127.92
        expect(result.cedearDetails?.impliedFx).toBeCloseTo(1127.92, 0)

        expect(result.cedearDetails?.ratioText).toBe('10:1')
    })
})

describe('computeAssetMetrics - CRYPTO', () => {
    const btcInput: AssetInput = {
        instrumentId: 'btc-id',
        symbol: 'BTC',
        name: 'Bitcoin',
        category: 'CRYPTO',
        nativeCurrency: 'USD',
        quantity: 0.02,
        avgCostNative: 40000,
        costBasisArs: 0, // Tracked separately
    }

    const btcPrices: AssetPrices = {
        currentPrice: 43000,
    }

    it('calculates valuations correctly in market mode', () => {
        const result = computeAssetMetrics(btcInput, btcPrices, fxQuotes, 'market')

        // valUsdEq = 0.02 * 43000 = 860
        expect(result.valUsdEq).toBe(860)

        // valArs = 860 * 1527.5 (cripto mid) = 1,313,650
        expect(result.valArs).toBeCloseTo(1313650, 0)

        expect(result.fxKeyUsed).toBe('cripto')
    })

    it('calculates valuations correctly in liquidation mode', () => {
        const result = computeAssetMetrics(btcInput, btcPrices, fxQuotes, 'liquidation')

        // valUsdEq = 860
        expect(result.valUsdEq).toBe(860)

        // valArs = 860 * 1520 (bid, selling USD) = 1,307,200
        expect(result.valArs).toBeCloseTo(1307200, 0)
    })
})

describe('computeAssetMetrics - CASH_ARS', () => {
    const cashInput: AssetInput = {
        instrumentId: 'cash-ars-id',
        symbol: 'ARS',
        name: 'Pesos Argentinos',
        category: 'CASH_ARS',
        nativeCurrency: 'ARS',
        quantity: 250000,
        avgCostNative: 250000,
        costBasisArs: 250000,
    }

    const cashPrices: AssetPrices = {
        currentPrice: null,
    }

    it('calculates valuations correctly in market mode', () => {
        const result = computeAssetMetrics(cashInput, cashPrices, fxQuotes, 'market')

        // valArs = 250,000
        expect(result.valArs).toBe(250000)

        // valUsdEq = 250000 / 1070 (oficial mid) ≈ 233.64
        expect(result.valUsdEq).toBeCloseTo(233.64, 0)

        // PnL = 0 (cash has no change)
        expect(result.pnlArs).toBe(0)

        expect(result.fxKeyUsed).toBe('oficial')
    })

    it('calculates valuations correctly in liquidation mode', () => {
        const result = computeAssetMetrics(cashInput, cashPrices, fxQuotes, 'liquidation')

        // valArs = 250,000
        expect(result.valArs).toBe(250000)

        // valUsdEq = 250000 / 1080 (ask) ≈ 231.48
        expect(result.valUsdEq).toBeCloseTo(231.48, 0)
    })
})

describe('computePortfolioTotals', () => {
    it('sums values correctly', () => {
        const rows = [
            { valArs: 100000, valUsdEq: 67, costArs: 80000, costUsdEq: 54 },
            { valArs: 50000, valUsdEq: 33, costArs: 45000, costUsdEq: 30 },
        ] as any

        const totals = computePortfolioTotals(rows)

        expect(totals.totalArs).toBe(150000)
        expect(totals.totalUsdEq).toBe(100)
        expect(totals.totalCostArs).toBe(125000)
        expect(totals.totalPnlArs).toBe(25000)
        expect(totals.totalPnlPct).toBeCloseTo(0.2, 2) // 25000/125000 = 20%
    })

    it('handles null values', () => {
        const rows = [
            { valArs: null, valUsdEq: 50, costArs: 100, costUsdEq: null },
            { valArs: 200, valUsdEq: null, costArs: null, costUsdEq: 100 },
        ] as any

        const totals = computePortfolioTotals(rows)

        expect(totals.totalArs).toBe(200)
        expect(totals.totalUsdEq).toBe(50)
        expect(totals.totalCostArs).toBe(100)
    })
})
