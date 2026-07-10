import { describe, expect, it } from 'vitest'
import { shouldCreateAutoUsdtBalance } from './auto-usdt-balance'

describe('auto USDT balance policy', () => {
    const base = { enabled: true, isExchange: true, ticker: 'BTC' }

    it.each(['swap', 'transfer', 'balance_adjustment'] as const)('never runs for %s operations', operationKind => {
        expect(shouldCreateAutoUsdtBalance({ ...base, operationKind })).toBe(false)
    })

    it('only runs for non-stable trades on exchanges', () => {
        expect(shouldCreateAutoUsdtBalance({ ...base, operationKind: 'trade' })).toBe(true)
        expect(shouldCreateAutoUsdtBalance({ ...base, ticker: 'USDT', operationKind: 'trade' })).toBe(false)
    })
})
