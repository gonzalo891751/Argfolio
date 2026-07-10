/**
 * Price resolution tests — Fase 1 (NEXO, precio manual, "sin precio" seguro)
 */

import { describe, it, expect } from 'vitest'
import { resolveAssetPriceResult, isPriceMissing } from './resolve-asset-price'
import { COINGECKO_MAP, getCoingeckoId } from '@/data/providers/crypto-coingecko'

describe('COINGECKO_MAP', () => {
    it('includes NEXO with the correct CoinGecko id', () => {
        expect(COINGECKO_MAP.NEXO).toBe('nexo')
        expect(getCoingeckoId('nexo')).toBe('nexo')
        expect(getCoingeckoId('NEXO')).toBe('nexo')
    })

    it('keeps existing mappings intact', () => {
        expect(getCoingeckoId('BTC')).toBe('bitcoin')
        expect(getCoingeckoId('BNB')).toBe('binancecoin')
        expect(getCoingeckoId('USDT')).toBe('tether')
        expect(getCoingeckoId('USDC')).toBe('usd-coin')
    })

    it('returns null for unmapped symbols', () => {
        expect(getCoingeckoId('FAKECOIN123')).toBeNull()
    })
})

describe('resolveAssetPriceResult — crypto', () => {
    it('uses provider price when available (status ok)', () => {
        const result = resolveAssetPriceResult({
            category: 'CRYPTO',
            symbol: 'NEXO',
            instrumentId: 'nexo-id',
            cryptoPriceUsd: 1.23,
        })
        expect(result.price).toBe(1.23)
        expect(result.status).toBe('ok')
        expect(result.source).toBe('coingecko')
    })

    it('returns missing (never zero) when there is no price', () => {
        const result = resolveAssetPriceResult({
            category: 'CRYPTO',
            symbol: 'NEXO',
            instrumentId: 'nexo-id',
            cryptoPriceUsd: null,
        })
        expect(result.status).toBe('missing')
        expect(result.price).toBeNull()
        expect(isPriceMissing(result)).toBe(true)
    })

    it('treats a zero provider price as missing, not as a valid price', () => {
        const result = resolveAssetPriceResult({
            category: 'CRYPTO',
            symbol: 'NEXO',
            instrumentId: 'nexo-id',
            cryptoPriceUsd: 0,
        })
        expect(result.status).toBe('missing')
        expect(result.price).toBeNull()
    })

    it('uses manual price as valid fallback, flagged as manual/estimated with date', () => {
        const result = resolveAssetPriceResult({
            category: 'CRYPTO',
            symbol: 'NEXO',
            instrumentId: 'nexo-id',
            cryptoPriceUsd: null,
            manualEntry: { instrumentId: 'nexo-id', price: 1.31, updatedAtISO: '2026-07-01T12:00:00.000Z' },
        })
        expect(result.price).toBe(1.31)
        expect(result.status).toBe('estimated')
        expect(result.source).toBe('manual')
        expect(result.asOf).toBe('2026-07-01T12:00:00.000Z')
        expect(isPriceMissing(result)).toBe(false)
    })

    it('manual price takes priority over provider price', () => {
        const result = resolveAssetPriceResult({
            category: 'CRYPTO',
            symbol: 'BTC',
            instrumentId: 'btc-id',
            cryptoPriceUsd: 70000,
            manualEntry: { instrumentId: 'btc-id', price: 65000, updatedAtISO: '2026-07-01T12:00:00.000Z' },
        })
        expect(result.price).toBe(65000)
        expect(result.source).toBe('manual')
    })
})

describe('resolveAssetPriceResult — other categories unaffected', () => {
    it('CEDEAR still resolves from PPI quote', () => {
        const result = resolveAssetPriceResult({
            category: 'CEDEAR',
            symbol: 'AAPL',
            instrumentId: 'aapl-id',
            cedearQuote: { lastPriceArs: 19790, updatedAt: '2026-07-09T10:00:00.000Z' },
        })
        expect(result.price).toBe(19790)
        expect(result.status).toBe('ok')
        expect(result.source).toBe('PPI')
    })

    it('FCI falls back to portfolio price', () => {
        const result = resolveAssetPriceResult({
            category: 'FCI',
            symbol: 'PREMIER',
            instrumentId: 'fci-id',
            portfolioPrice: 1543.21,
        })
        expect(result.price).toBe(1543.21)
        expect(result.status).toBe('ok')
        expect(result.source).toBe('fci_latest')
    })
})
