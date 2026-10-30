import { describe, it, expect } from 'vitest'
import { normalizeInstrument } from './instruments'
import type { Instrument } from '@/domain/types'

describe('normalizeInstrument', () => {
    it('reads CEDEARs as peso assets even when stored as USD-native', () => {
        const legacy: Instrument = { id: 'aapl', symbol: 'AAPL', name: 'Apple', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'aapl', cedearRatio: 10 }
        expect(normalizeInstrument(legacy)).toEqual({ ...legacy, nativeCurrency: 'ARS' })
        expect(legacy.nativeCurrency).toBe('USD')
    })

    it('leaves every other instrument as stored', () => {
        const btc: Instrument = { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'btc' }
        expect(normalizeInstrument(btc)).toBe(btc)
    })
})
