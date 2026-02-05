import { describe, it, expect } from 'vitest'
import { computeCashLedger } from './cash-ledger'
import { computeHoldings } from './computeHoldings'
import { computeTotals } from './computeTotals'
import { computeAssetMetrics } from '@/domain/assets/valuation'
import type { Movement, Instrument, Account, FxRates } from '@/domain/types'

const fxRates: FxRates = {
    oficial: { buy: 900, sell: 910, mid: 905 },
    blue: { buy: 1200, sell: 1210, mid: 1205 },
    mep: { buy: 1100, sell: 1110, mid: 1105 },
    ccl: { buy: 1150, sell: 1160, mid: 1155 },
    cripto: { buy: 1120, sell: 1130, mid: 1125 },
    updatedAtISO: '2024-01-01T00:00:00Z',
    source: 'test',
}

const accounts: Account[] = [
    { id: 'IOL', name: 'InvertirOnline', kind: 'BROKER', defaultCurrency: 'ARS' },
    { id: 'Carrefour', name: 'Carrefour', kind: 'BANK', defaultCurrency: 'ARS' },
    { id: 'NaranjaX', name: 'NaranjaX', kind: 'BANK', defaultCurrency: 'ARS' },
    { id: 'Binance', name: 'Binance', kind: 'EXCHANGE', defaultCurrency: 'USD' },
]

const instruments: Instrument[] = [
    { id: 'QQQ', symbol: 'QQQ', name: 'QQQ', category: 'CEDEAR', nativeCurrency: 'ARS', priceKey: 'qqq' },
    { id: 'SPY', symbol: 'SPY', name: 'SPY', category: 'CEDEAR', nativeCurrency: 'ARS', priceKey: 'spy' },
    { id: 'FCI_MM', symbol: 'FCI_MM', name: 'FCI Money', category: 'FCI', nativeCurrency: 'ARS', priceKey: 'fci' },
    { id: 'PF_ARS_GENERIC', symbol: 'PF_ARS', name: 'Plazo Fijo', category: 'PF', nativeCurrency: 'ARS', priceKey: 'pf' },
    { id: 'BNB', symbol: 'BNB', name: 'BNB', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'bnb' },
    { id: 'USD', symbol: 'USD', name: 'USD', category: 'USD_CASH', nativeCurrency: 'USD', priceKey: 'usd' },
]

describe('cash ledger + portfolio integration', () => {
    it('infers opening balances and keeps simple net worth consistent', () => {
        const movements: Movement[] = [
            {
                id: 'm1',
                datetimeISO: '2024-01-01T10:00:00Z',
                type: 'BUY',
                assetClass: 'cedear',
                instrumentId: 'QQQ',
                accountId: 'IOL',
                quantity: 10,
                unitPrice: 1000,
                tradeCurrency: 'ARS',
                totalAmount: 10000,
            } as Movement,
            {
                id: 'm2',
                datetimeISO: '2024-01-02T10:00:00Z',
                type: 'BUY',
                assetClass: 'cedear',
                instrumentId: 'SPY',
                accountId: 'IOL',
                quantity: 5,
                unitPrice: 2000,
                tradeCurrency: 'ARS',
                totalAmount: 10000,
            } as Movement,
            {
                id: 'm3',
                datetimeISO: '2024-01-03T10:00:00Z',
                type: 'BUY',
                assetClass: 'fci',
                instrumentId: 'FCI_MM',
                accountId: 'IOL',
                quantity: 1000,
                unitPrice: 1,
                tradeCurrency: 'ARS',
                totalAmount: 1000,
            } as Movement,
            {
                id: 'm4',
                datetimeISO: '2024-01-04T10:00:00Z',
                type: 'BUY',
                assetClass: 'pf',
                instrumentId: 'PF_ARS_GENERIC',
                accountId: 'NaranjaX',
                quantity: 100000,
                unitPrice: 1,
                tradeCurrency: 'ARS',
                totalAmount: 100000,
            } as Movement,
        ]

        const instrumentsMap = new Map(instruments.map(i => [i.id, i]))
        const accountsMap = new Map(accounts.map(a => [a.id, a]))
        const holdings = computeHoldings(movements, instrumentsMap, accountsMap)

        const pricesMap = new Map<string, number>([
            ['QQQ', 1000],
            ['SPY', 2000],
            ['FCI_MM', 1],
            ['PF_ARS_GENERIC', 1],
        ])

        const totalsOff = computeTotals({
            holdings,
            currentPrices: pricesMap,
            priceChanges: new Map(),
            fxRates,
            baseFx: 'MEP',
            stableFx: 'CRIPTO',
            cashBalances: new Map(),
            accountsById: accountsMap,
            realizedPnLArs: 0,
            realizedPnLUsd: 0,
            realizedPnLByAccount: {},
        })

        const ledger = computeCashLedger(movements)
        const totalsOn = computeTotals({
            holdings,
            currentPrices: pricesMap,
            priceChanges: new Map(),
            fxRates,
            baseFx: 'MEP',
            stableFx: 'CRIPTO',
            cashBalances: ledger.balances,
            openingBalances: ledger.openingBalances,
            accountsById: accountsMap,
            realizedPnLArs: 0,
            realizedPnLUsd: 0,
            realizedPnLByAccount: {},
        })

        expect(Math.abs(totalsOn.totalARS - totalsOff.totalARS)).toBeLessThan(0.01)
        expect(totalsOn.exposure.pctArs).toBeGreaterThanOrEqual(0)
        expect(totalsOn.exposure.pctArs).toBeLessThanOrEqual(1)
        expect(totalsOn.exposure.pctUsd).toBeGreaterThanOrEqual(0)
        expect(totalsOn.exposure.pctUsd).toBeLessThanOrEqual(1)

        // Cash injection should preserve real account naming when accountsById is provided
        const arsCash = totalsOn.categories.find(c => c.category === 'ARS_CASH')
        const iolArsCashHolding = arsCash?.items
            .flatMap(i => i.byAccount)
            .find(h => h.accountId === 'IOL')
        expect(iolArsCashHolding?.account.name).toBe('InvertirOnline')
    })

    it('computes Carrefour cash from deposit + interest', () => {
        const movements: Movement[] = [
            {
                id: 'd1',
                datetimeISO: '2024-01-10T10:00:00Z',
                type: 'DEPOSIT',
                accountId: 'Carrefour',
                tradeCurrency: 'ARS',
                totalAmount: 356141.36,
            } as Movement,
            {
                id: 'd2',
                datetimeISO: '2024-01-11T10:00:00Z',
                type: 'INTEREST',
                accountId: 'Carrefour',
                tradeCurrency: 'ARS',
                totalAmount: 331.75,
            } as Movement,
        ]

        const ledger = computeCashLedger(movements)
        const carrefour = ledger.balances.get('Carrefour')
        expect(carrefour?.get('ARS')).toBeCloseTo(356473.11, 2)
    })

    it('handles USD and USDT cash with opening balances', () => {
        const movements: Movement[] = [
            {
                id: 'u1',
                datetimeISO: '2024-01-10T10:00:00Z',
                type: 'BUY_USD',
                accountId: 'Binance',
                instrumentId: 'USD',
                quantity: 1000,
                tradeCurrency: 'ARS',
                totalAmount: 1000000,
                totalUSD: 1000,
            } as Movement,
            {
                id: 'u2',
                datetimeISO: '2024-01-11T10:00:00Z',
                type: 'BUY',
                assetClass: 'crypto',
                accountId: 'Binance',
                instrumentId: 'BNB',
                quantity: 1,
                unitPrice: 200,
                tradeCurrency: 'USDT',
                totalAmount: 200,
            } as Movement,
        ]

        const ledger = computeCashLedger(movements)
        const binance = ledger.balances.get('Binance')
        const binanceOpening = ledger.openingBalances.get('Binance')

        expect(binance?.get('USD')).toBeCloseTo(1000, 6)
        expect(binance?.get('USDT') ?? 0).toBeCloseTo(0, 6)
        expect(binanceOpening?.get('USDT') ?? 0).toBeCloseTo(200, 6)
    })

    it('returns null ROI when invested base is zero', () => {
        const metrics = computeAssetMetrics(
            {
                instrumentId: 'cash-ars',
                symbol: 'ARS',
                name: 'Pesos',
                category: 'CASH_ARS',
                nativeCurrency: 'ARS',
                quantity: 0,
                avgCostNative: 0,
                costBasisArs: 0,
                costBasisUsdEq: 0,
            },
            {
                currentPrice: 1,
            },
            {
                oficial: { bid: 900, ask: 910, mid: 905 },
                mep: { bid: 1100, ask: 1110, mid: 1105 },
                cripto: { bid: 1120, ask: 1130, mid: 1125 },
            }
        )

        expect(metrics.roiPct).toBeNull()
    })

    describe('settlement currency for stablecoin sales', () => {
        it('SELL USDT with settlementCurrency=ARS credits CASH_ARS not CASH_USD', () => {
            const movements: Movement[] = [
                {
                    id: 'usdt-sell-1',
                    datetimeISO: '2024-01-15T10:00:00Z',
                    type: 'SELL',
                    assetClass: 'crypto',
                    instrumentId: 'USDT',
                    accountId: 'Binance',
                    quantity: 200,
                    unitPrice: 1,
                    tradeCurrency: 'USD', // USDT trades in USD
                    totalAmount: 200,
                    // Key: settlement is in ARS, not USD fiat
                    meta: {
                        settlementCurrency: 'ARS',
                        settlementArs: 240000, // 200 USDT * 1200 ARS/USD
                    },
                } as Movement,
            ]

            const ledger = computeCashLedger(movements)
            const binance = ledger.balances.get('Binance')

            // Should credit ARS, not USD
            expect(binance?.get('ARS')).toBeCloseTo(240000, 2)
            // Should NOT have USD balance from this sale
            expect(binance?.get('USD') ?? 0).toBe(0)
        })

        it('SELL USDT with settlementCurrency=USD credits CASH_USD (explicit USD fiat)', () => {
            const movements: Movement[] = [
                {
                    id: 'usdt-sell-2',
                    datetimeISO: '2024-01-15T10:00:00Z',
                    type: 'SELL',
                    assetClass: 'crypto',
                    instrumentId: 'USDT',
                    accountId: 'Binance',
                    quantity: 200,
                    unitPrice: 1,
                    tradeCurrency: 'USD',
                    totalAmount: 200,
                    // Explicit: settlement in USD fiat
                    meta: {
                        settlementCurrency: 'USD',
                    },
                } as Movement,
            ]

            const ledger = computeCashLedger(movements)
            const binance = ledger.balances.get('Binance')

            // Should credit USD
            expect(binance?.get('USD')).toBeCloseTo(200, 2)
            // Should NOT have ARS balance from this sale
            expect(binance?.get('ARS') ?? 0).toBe(0)
        })

        it('SELL USDT without settlementCurrency defaults to tradeCurrency (backwards compatible)', () => {
            const movements: Movement[] = [
                {
                    id: 'usdt-sell-3',
                    datetimeISO: '2024-01-15T10:00:00Z',
                    type: 'SELL',
                    assetClass: 'crypto',
                    instrumentId: 'USDT',
                    accountId: 'Binance',
                    quantity: 200,
                    unitPrice: 1,
                    tradeCurrency: 'USD',
                    totalAmount: 200,
                    // No meta.settlementCurrency -> defaults to tradeCurrency
                } as Movement,
            ]

            const ledger = computeCashLedger(movements)
            const binance = ledger.balances.get('Binance')

            // Backwards compatible: credits tradeCurrency (USD)
            expect(binance?.get('USD')).toBeCloseTo(200, 2)
        })
    })
})
