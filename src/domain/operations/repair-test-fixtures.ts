import type { Account, Instrument, Movement } from '@/domain/types'
import type { TargetCryptoBalance } from './crypto-reconciliation'

export const repairAccounts: Account[] = [
    { id: 'binance', name: 'Binance', kind: 'EXCHANGE', defaultCurrency: 'USD' },
    { id: 'nexo', name: 'Nexo', kind: 'EXCHANGE', defaultCurrency: 'USD' },
]

export const repairInstruments: Instrument[] = [
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'btc' },
    { id: 'bnb', symbol: 'BNB', name: 'BNB', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'bnb' },
    { id: 'usdt', symbol: 'USDT', name: 'Tether', category: 'STABLE', nativeCurrency: 'USD', priceKey: 'usdt' },
    { id: 'usdc', symbol: 'USDC', name: 'USD Coin', category: 'STABLE', nativeCurrency: 'USD', priceKey: 'usdc' },
    { id: 'nexo-token', symbol: 'NEXO', name: 'Nexo Token', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'nexo' },
]

export const repairTargets: TargetCryptoBalance[] = [
    { accountNameOrId: 'Nexo', symbol: 'BTC', targetQty: 0.0172965 },
    { accountNameOrId: 'Nexo', symbol: 'NEXO', targetQty: 162.22502272 },
    { accountNameOrId: 'Nexo', symbol: 'USDC', targetQty: 20.031414 },
    { accountNameOrId: 'Nexo', symbol: 'BNB', targetQty: 0.03341429 },
    { accountNameOrId: 'Binance', symbol: 'BTC', targetQty: 0 },
    { accountNameOrId: 'Binance', symbol: 'BNB', targetQty: 0 },
    { accountNameOrId: 'Binance', symbol: 'USDT', targetQty: 0 },
    { accountNameOrId: 'Binance', symbol: 'USDC', targetQty: 0 },
]

function trade(
    id: string,
    accountId: string,
    instrumentId: string,
    ticker: string,
    type: 'BUY' | 'SELL' | 'DEPOSIT',
    quantity: number,
    unitPrice: number,
    datetimeISO: string,
): Movement {
    return {
        id,
        datetimeISO,
        type,
        assetClass: 'crypto',
        accountId,
        instrumentId,
        ticker,
        quantity,
        unitPrice,
        tradeCurrency: 'USD',
        totalAmount: quantity * unitPrice,
        totalUSD: quantity * unitPrice,
        source: 'user',
    }
}

export function buildRepairFixtureMovements(): Movement[] {
    return [
        trade('btc-original', 'binance', 'btc', 'BTC', 'BUY', 0.01857219, 50000, '2026-06-01T10:00:00.000Z'),
        trade('bnb-original', 'binance', 'bnb', 'BNB', 'BUY', 0.03341429, 600, '2026-06-01T10:01:00.000Z'),
        trade('usdt-original', 'binance', 'usdt', 'USDT', 'BUY', 40.735376, 1, '2026-06-01T10:02:00.000Z'),
        trade('usdc-visible', 'nexo', 'usdc', 'USDC', 'DEPOSIT', 19, 1, '2026-07-08T10:00:00.000Z'),
        trade('legacy-btc-sell', 'binance', 'btc', 'BTC', 'SELL', 0.00127569, 63234.9008, '2026-07-09T10:00:00.000Z'),
        trade('legacy-usdt-buy', 'binance', 'usdt', 'USDT', 'BUY', 80.666981, 1, '2026-07-09T10:01:00.000Z'),
        trade('legacy-nexo-buy', 'nexo', 'nexo-token', 'NEXO', 'BUY', 162.11301874, 0.74, '2026-07-09T10:02:00.000Z'),
    ]
}
