import { describe, expect, it } from 'vitest'
import type { Account, Instrument, Movement } from '@/domain/types'
import { reconcileCryptoBalances } from './crypto-reconciliation'

const accounts: Account[] = [
    { id: 'binance', name: 'Binance', kind: 'EXCHANGE', defaultCurrency: 'USD' },
    { id: 'nexo', name: 'Nexo Wallet', kind: 'EXCHANGE', defaultCurrency: 'USD' },
]
const instruments: Instrument[] = [
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'btc' },
    { id: 'nexo-token', symbol: 'NEXO', name: 'Nexo', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'nexo' },
    { id: 'usdc', symbol: 'USDC', name: 'USD Coin', category: 'STABLE', nativeCurrency: 'USD', priceKey: 'usdc' },
    { id: 'bnb', symbol: 'BNB', name: 'BNB', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'bnb' },
]

function deposit(id: string, accountId: string, instrumentId: string, ticker: string, quantity: number): Movement {
    return {
        id,
        datetimeISO: '2026-07-09T12:00:00.000Z',
        type: 'DEPOSIT',
        assetClass: 'crypto',
        accountId,
        instrumentId,
        ticker,
        quantity,
        unitPrice: 1,
        tradeCurrency: 'USD',
        totalAmount: quantity,
    }
}

describe('crypto reconciliation', () => {
    it('reports exact Nexo and Binance differences with symbol tolerances', () => {
        const rows = reconcileCryptoBalances({
            movements: [
                deposit('btc-nexo', 'nexo', 'btc', 'BTC', 0.017),
                deposit('nexo-nexo', 'nexo', 'nexo-token', 'NEXO', 162.11328913),
                deposit('btc-binance', 'binance', 'btc', 'BTC', 0.0001),
            ],
            accounts,
            instruments,
            targets: [
                { accountNameOrId: 'Nexo', symbol: 'BTC', targetQty: 0.0172965 },
                { accountNameOrId: 'Nexo', symbol: 'NEXO', targetQty: 162.22502272 },
                { accountNameOrId: 'Binance', symbol: 'BTC', targetQty: 0 },
            ],
        })

        expect(rows[0]).toMatchObject({ diffQty: 0.0002965, status: 'needs_increase' })
        expect(rows[1]).toMatchObject({ diffQty: 0.11173359, status: 'needs_increase', suggestedAction: 'balance_adjustment' })
        expect(rows[2]).toMatchObject({ diffQty: -0.0001, status: 'needs_decrease', suggestedAction: 'transfer' })
        expect(rows[0].tolerance).toBe(1e-8)
        expect(rows[1].tolerance).toBe(1e-6)
    })

    it('ignores superseded balances', () => {
        const row = reconcileCryptoBalances({
            movements: [{ ...deposit('old', 'nexo', 'btc', 'BTC', 1), meta: { operationStatus: 'superseded' } }],
            accounts,
            instruments,
            targets: [{ accountNameOrId: 'nexo', symbol: 'BTC', targetQty: 0 }],
        })[0]
        expect(row.status).toBe('ok')
        expect(row.currentQty).toBe(0)
    })
})
