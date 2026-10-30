import { describe, it, expect } from 'vitest'
import { buildBalanceUpdate, buildCashMovement, buildTradeMovements } from './quick-movements'
import { computeCashBalances, computeCashLedger, getMovementCashDeltas, traceCashBalanceContributions } from '@/domain/portfolio/cash-ledger'
import type { Movement } from '@/domain/types'

/** Net cash effect of the movements, without the ledger's inferred opening balance. */
const cashDelta = (movements: Movement[], currency: string) => movements
    .flatMap(getMovementCashDeltas)
    .filter(d => d.currency === currency)
    .reduce((s, d) => s + d.amount, 0)
import { computeAverageCost } from '@/domain/portfolio/average-cost'

let seq = 0
const newId = () => `id-${++seq}`
const when = '2026-10-30T15:00:00.000Z'

describe('buildTradeMovements', () => {
    it('crypto buy on an exchange is settled with USDT and leaves fiat cash untouched', () => {
        const [buy, usdt] = buildTradeMovements({
            side: 'buy', assetClass: 'crypto', instrumentId: 'btc', symbol: 'BTC', name: 'Bitcoin',
            accountId: 'binance', isExchange: true, qty: 0.01, unitPrice: 100_000, fee: 1,
            datetimeISO: when, fxRate: 1495, settleWithStable: true, stableInstrumentId: 'usdt', newId,
        })

        expect(buy.type).toBe('BUY')
        expect(buy.totalAmount).toBe(1000)
        expect(buy.netAmount).toBe(1001)
        expect(buy.totalARS).toBe(1001 * 1495)
        expect(usdt.type).toBe('SELL')
        expect(usdt.quantity).toBe(1001)
        expect(usdt.groupId).toBe(buy.id)

        expect(Math.abs(cashDelta([buy, usdt], 'USD'))).toBeLessThan(1e-9)
    })

    it('crypto sell receives USDT', () => {
        const [sell, usdt] = buildTradeMovements({
            side: 'sell', assetClass: 'crypto', instrumentId: 'btc', symbol: 'BTC', name: 'Bitcoin',
            accountId: 'binance', isExchange: true, qty: 0.01, unitPrice: 100_000,
            datetimeISO: when, fxRate: 1495, settleWithStable: true, stableInstrumentId: 'usdt', newId,
        })
        expect(sell.type).toBe('SELL')
        expect(sell.meta?.costingMethod).toBe('PPP')
        expect(usdt.type).toBe('BUY')
        expect(usdt.quantity).toBe(1000)
    })

    it('does not add a stable leg when trading USDT itself or outside an exchange', () => {
        expect(buildTradeMovements({
            side: 'buy', assetClass: 'crypto', instrumentId: 'usdt', symbol: 'USDT', name: 'Tether',
            accountId: 'binance', isExchange: true, qty: 100, unitPrice: 1,
            datetimeISO: when, fxRate: 1495, settleWithStable: true, newId,
        })).toHaveLength(1)
        expect(buildTradeMovements({
            side: 'buy', assetClass: 'crypto', instrumentId: 'btc', symbol: 'BTC', name: 'Bitcoin',
            accountId: 'belo', isExchange: false, qty: 0.01, unitPrice: 100_000,
            datetimeISO: when, fxRate: 1495, settleWithStable: true, newId,
        })).toHaveLength(1)
    })

    it('CEDEAR buy is paid with the broker ARS cash and records its USD cost at MEP', () => {
        const [buy] = buildTradeMovements({
            side: 'buy', assetClass: 'cedear', instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple',
            accountId: 'iol', isExchange: false, qty: 10, unitPrice: 18_000,
            datetimeISO: when, fxRate: 1500, settleWithStable: false, newId,
        })
        expect(buy.tradeCurrency).toBe('ARS')
        expect(buy.totalARS).toBe(180_000)
        expect(buy.totalUSD).toBe(120)
        expect(cashDelta([buy], 'ARS')).toBe(-180_000)
    })

    it('rejects incomplete trades', () => {
        expect(() => buildTradeMovements({
            side: 'buy', assetClass: 'cedear', instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple',
            accountId: 'iol', isExchange: false, qty: 0, unitPrice: 18_000,
            datetimeISO: when, fxRate: 1500, settleWithStable: false, newId,
        })).toThrow('cantidad')
    })
})

describe('buildCashMovement', () => {
    it('USD deposit keeps its ARS value as cost basis', () => {
        const dep = buildCashMovement({
            direction: 'in', accountId: 'belo', currency: 'USD', amount: 1000, datetimeISO: when,
            instrumentId: 'usd-cash', fxRate: 1435, fxKind: 'OFICIAL', newId,
        })
        expect(dep.totalARS).toBe(1_435_000)
        const cost = computeAverageCost([dep])
        expect(cost.costBasisArs).toBe(1_435_000)
        expect(cost.arsCostUnknown).toBe(false)
        expect(computeCashBalances([dep]).get('belo')?.get('USD')).toBe(1000)
    })
})

describe('buildBalanceUpdate', () => {
    const base = {
        accountId: 'naranja', currency: 'ARS' as const, datetimeISO: when,
        instrumentId: 'ars-cash', fxRate: 1435, fxKind: 'OFICIAL' as const, newId,
    }

    it('books a higher real balance as interest', () => {
        const mov = buildBalanceUpdate({ ...base, systemBalance: 100_000, realBalance: 100_550.5, reason: 'interest' })!
        expect(mov.type).toBe('INTEREST')
        expect(mov.quantity).toBe(550.5)
        expect(computeCashBalances([mov]).get('naranja')?.get('ARS')).toBe(550.5)
    })

    it('books a lower real balance as a withdrawal', () => {
        const mov = buildBalanceUpdate({ ...base, systemBalance: 100_000, realBalance: 60_000, reason: 'withdraw' })!
        expect(mov.type).toBe('WITHDRAW')
        expect(mov.quantity).toBe(40_000)
        expect(mov.meta).toBeUndefined()
    })

    it('tags corrections so they are not counted as money flow', () => {
        const mov = buildBalanceUpdate({ ...base, systemBalance: 100_000, realBalance: 99_000, reason: 'adjustment' })!
        expect(mov.type).toBe('WITHDRAW')
        expect(mov.meta?.operationKind).toBe('balance_adjustment')
    })

    it('does nothing when balances match', () => {
        expect(buildBalanceUpdate({ ...base, systemBalance: 100, realBalance: 100, reason: 'interest' })).toBeNull()
    })

    it('refuses impossible reasons', () => {
        expect(() => buildBalanceUpdate({ ...base, systemBalance: 100, realBalance: 50, reason: 'interest' })).toThrow()
        expect(() => buildBalanceUpdate({ ...base, systemBalance: 100, realBalance: 150, reason: 'withdraw' })).toThrow()
    })
})

describe('crypto trades settled with USDT in the cash ledger', () => {
    const trade = (side: 'buy' | 'sell') => buildTradeMovements({
        side, assetClass: 'crypto', instrumentId: 'btc', symbol: 'BTC', name: 'Bitcoin',
        accountId: 'binance', isExchange: true, qty: 0.002, unitPrice: 101_000,
        datetimeISO: when, fxRate: 1500, settleWithStable: true, stableInstrumentId: 'usdt', newId,
    })

    it('never creates fiat cash, whatever order the legs come in (same timestamp)', () => {
        for (const side of ['buy', 'sell'] as const) {
            const [asset, usdt] = trade(side)
            for (const order of [[asset, usdt], [usdt, asset]]) {
                const ledger = computeCashLedger(order)
                expect(ledger.balances.get('binance')?.get('USD') ?? 0).toBe(0)
                expect(ledger.openingBalances.get('binance')?.get('USD') ?? 0).toBe(0)
                expect(traceCashBalanceContributions({ movements: order, accountId: 'binance', currency: 'USD' })).toEqual([])
            }
        }
    })

    it('keeps real fiat movements of the same account', () => {
        const dep = buildCashMovement({
            direction: 'in', accountId: 'binance', currency: 'USD', amount: 50, datetimeISO: '2026-10-29T15:00:00.000Z',
            instrumentId: 'usd-cash', fxRate: 1500, fxKind: 'CRIPTO', newId,
        })
        const ledger = computeCashLedger([...trade('buy').reverse(), dep])
        expect(ledger.balances.get('binance')?.get('USD')).toBe(50)
    })
})
