import { describe, expect, it } from 'vitest'
import type { Account, FxRates, Instrument, Movement } from '@/domain/types'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { computeCashLedger } from '@/domain/portfolio/cash-ledger'
import { computeRealizedPnL } from '@/domain/portfolio/computePnL'
import { computeHoldings } from '@/domain/portfolio/computeHoldings'

function movement(id: string, type: Movement['type'], quantity: number, status?: 'posted' | 'superseded' | 'voided'): Movement {
    return {
        id,
        datetimeISO: `2026-07-0${id.length}T12:00:00.000Z`,
        type,
        assetClass: 'crypto',
        accountId: 'nexo',
        instrumentId: 'btc',
        ticker: 'BTC',
        quantity,
        unitPrice: type === 'SELL' ? 120 : 100,
        tradeCurrency: 'USD',
        totalAmount: quantity * (type === 'SELL' ? 120 : 100),
        meta: status ? { operationStatus: status } : undefined,
    }
}

const fxRates: FxRates = {
    mep: { buy: 1000, sell: 1000 },
    ccl: { buy: 1000, sell: 1000 },
    oficial: { buy: 1000, sell: 1000 },
    blue: { buy: 1000, sell: 1000 },
    cripto: { buy: 1000, sell: 1000 },
    updatedAtISO: '2026-07-09T00:00:00.000Z',
    source: 'test',
}
const instruments = new Map<string, Instrument>([[
    'btc',
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'btc' },
]])
const accounts = new Map<string, Account>([[
    'nexo',
    { id: 'nexo', name: 'Nexo', kind: 'EXCHANGE', defaultCurrency: 'USD' },
]])

describe('operationStatus in portfolio engines', () => {
    it('counts posted and legacy BUY movements', () => {
        expect(computeAverageCost([movement('a', 'BUY', 2)]).quantity).toBe(2)
        expect(computeAverageCost([movement('b', 'BUY', 3, 'posted')]).quantity).toBe(3)
    })

    it('ignores superseded and voided BUY movements', () => {
        expect(computeAverageCost([
            movement('a', 'BUY', 2, 'superseded'),
            movement('b', 'BUY', 3, 'voided'),
        ]).quantity).toBe(0)
        expect(computeHoldings([
            movement('a', 'BUY', 2, 'superseded'),
            movement('b', 'BUY', 3, 'voided'),
        ], instruments, accounts)).toEqual([])
    })

    it('does not let a superseded SELL reduce holdings or realize PnL', () => {
        const movements = [movement('a', 'BUY', 2), movement('bb', 'SELL', 1, 'superseded')]
        expect(computeAverageCost(movements).quantity).toBe(2)
        expect(computeRealizedPnL(movements, fxRates).realizedUsd).toBe(0)
    })

    it('ignores every leg of a superseded operation group', () => {
        const group = [
            { ...movement('a', 'BUY', 2), meta: { operationId: 'old', operationStatus: 'superseded' as const } },
            { ...movement('bb', 'SELL', 1), meta: { operationId: 'old', operationStatus: 'superseded' as const } },
        ]
        expect(computeAverageCost(group).quantity).toBe(0)
    })

    it('ignores superseded cash movements', () => {
        const deposit: Movement = {
            ...movement('cash', 'DEPOSIT', 0),
            instrumentId: undefined,
            assetClass: 'wallet',
            totalAmount: 100,
            quantity: undefined,
            meta: { operationStatus: 'voided' },
        }
        expect(computeCashLedger([deposit]).balances.size).toBe(0)
    })
})
