import { describe, it, expect } from 'vitest'
import { buildPortfolioV2 } from './builder'
import type { AssetRowMetrics } from '@/domain/assets/types'
import type { Account, FxRates, Movement } from '@/domain/types'

function makeMetrics(overrides: Partial<AssetRowMetrics>): AssetRowMetrics {
    const base: AssetRowMetrics = {
        instrumentId: 'inst',
        symbol: 'SYM',
        name: 'Instrument',
        category: 'OTHER',
        quantity: 1,
        valArs: 0,
        valUsdEq: 0,
        costArs: 0,
        costUsdEq: 0,
        pnlArs: 0,
        pnlPct: 0,
        pnlUsdEq: 0,
        roiPct: 0,
        fxKeyUsed: 'oficial',
        fxUsedLabel: 'Oficial',
        fxRate: 1,
        currentPrice: 0,
        avgCost: 0,
        avgCostUsdEq: 0,
        investedArs: 0,
        nativeCurrency: 'ARS',
        cedearDetails: undefined,
        changePct1d: 0,
        changeArs1d: 0,
        accountId: 'acc',
        accountName: 'Account',
        openingBalanceInferred: false,
        openingBalance: 0,
    }
    return { ...base, ...overrides }
}

const fxRates: FxRates = {
    oficial: { buy: 1000, sell: 1010 },
    blue: { buy: 0, sell: 0 },
    mep: { buy: 1200, sell: 1210 },
    ccl: { buy: 0, sell: 0 },
    cripto: { buy: 1100, sell: 1110 },
    updatedAtISO: '2026-02-05T00:00:00.000Z',
    source: 'test',
}

describe('portfolioV2 builder - rubro classification', () => {
    it('keeps broker FCI ONLY in Fondos (FCI) and never inside CEDEARs', () => {
        const broker: Account = {
            id: 'iol',
            name: 'InvertirOnline',
            kind: 'BROKER',
            defaultCurrency: 'ARS',
        }

        const cedear = makeMetrics({
            accountId: broker.id,
            accountName: broker.name,
            instrumentId: 'cedear-aapl',
            symbol: 'AAPL',
            name: 'Apple CEDEAR',
            category: 'CEDEAR',
            quantity: 2,
            valArs: 1000,
            valUsdEq: 0.83,
            fxKeyUsed: 'mep',
            fxUsedLabel: 'MEP',
            fxRate: 1210,
        })

        const fci = makeMetrics({
            accountId: broker.id,
            accountName: broker.name,
            instrumentId: 'fci-premier-d',
            symbol: 'PREMIERD',
            name: 'Premier Capital - Clase D',
            category: 'FCI',
            quantity: 1,
            valArs: 2000,
            valUsdEq: 1.98,
            fxKeyUsed: 'oficial',
            fxUsedLabel: 'Oficial',
            fxRate: 1010,
        })

        const groupedRows = {
            [broker.id]: {
                accountName: broker.name,
                metrics: [cedear, fci],
                totals: {
                    valArs: 3000,
                    valUsd: 2.81,
                    pnlArs: 0,
                    pnlUsd: 0,
                },
            },
        }

        const portfolio = buildPortfolioV2({
            groupedRows: groupedRows as any,
            accounts: [broker],
            fxRates,
            movements: [],
        })

        const cedears = portfolio.rubros.find(r => r.id === 'cedears')
        const fondos = portfolio.rubros.find(r => r.id === 'fci')

        expect(cedears).toBeTruthy()
        expect(fondos).toBeTruthy()

        const cedearsItems = (cedears?.providers ?? []).flatMap(p => p.items)
        const fondosItems = (fondos?.providers ?? []).flatMap(p => p.items)

        expect(cedearsItems.map(i => i.kind)).toEqual(['cedear'])
        expect(fondosItems.map(i => i.kind)).toEqual(['fci'])

        // Ensure "Premier Capital - Clase D" never appears inside CEDEARs
        expect(cedearsItems.some(i => i.label === 'Premier Capital - Clase D')).toBe(false)
        expect(fondosItems.some(i => i.label === 'Premier Capital - Clase D')).toBe(true)

        // Totals must not double-count the FCI
        expect(portfolio.kpis.totalArs).toBe(3000)
        expect(portfolio.kpis.totalUsd).toBeCloseTo((1000 / 1210) + (2000 / 1010), 10)
        expect(portfolio.kpis.totalUsdEq).toBeCloseTo(portfolio.kpis.totalUsd, 10)

        // Hard guard: same account+instrument must not be present in more than one rubro
        const keysByRubro = portfolio.rubros.map(r => ({
            rubroId: r.id,
            keys: new Set(
                r.providers.flatMap(p =>
                    p.items.map(it => `${it.accountId}:${it.instrumentId ?? it.symbol}`)
                )
            ),
        }))
        const allKeys = new Map<string, Set<string>>()
        for (const { rubroId, keys } of keysByRubro) {
            for (const k of keys) {
                const entry = allKeys.get(k) ?? new Set<string>()
                entry.add(rubroId)
                allKeys.set(k, entry)
            }
        }
        const duplicated = [...allKeys.entries()].filter(([, rubroIds]) => rubroIds.size > 1)
        expect(duplicated).toEqual([])
    })

    it('values FCI as qty * currentPrice (quote) and sets priceMeta.source=quote', () => {
        const broker: Account = {
            id: 'iol',
            name: 'InvertirOnline',
            kind: 'BROKER',
            defaultCurrency: 'ARS',
        }

        const qty = 1167.9121
        const unit = 145.9
        const expected = qty * unit

        const fci = makeMetrics({
            accountId: broker.id,
            accountName: broker.name,
            instrumentId: 'fci-premier-d',
            symbol: 'PREMIERD',
            name: 'Premier Capital - Clase D',
            category: 'FCI',
            nativeCurrency: 'ARS',
            quantity: qty,
            // Simulate the bug: upstream valArs looked like qty due to price=1 fallback
            valArs: qty,
            valUsdEq: 0,
            currentPrice: unit,
        })

        const groupedRows = {
            [broker.id]: {
                accountName: broker.name,
                metrics: [fci],
                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
            },
        }

        const portfolio = buildPortfolioV2({
            groupedRows: groupedRows as any,
            accounts: [broker],
            fxRates,
            movements: [],
        })

        const fondos = portfolio.rubros.find(r => r.id === 'fci')
        const item = fondos?.providers.flatMap(p => p.items)[0]

        expect(item).toBeTruthy()
        expect(item!.valArs).toBeCloseTo(expected, 2)
        expect(item!.priceMeta?.source).toBe('quote')
        expect(item!.priceMeta?.unitPrice).toBe(unit)
    })

    it('falls back to last_trade price for FCI when quote is missing (never price=1 silently)', () => {
        const broker: Account = {
            id: 'iol',
            name: 'InvertirOnline',
            kind: 'BROKER',
            defaultCurrency: 'ARS',
        }

        const qty = 1167.9121
        const lastTradeUnit = 145.9
        const expected = qty * lastTradeUnit

        const fci = makeMetrics({
            accountId: broker.id,
            accountName: broker.name,
            instrumentId: 'fci-premier-d',
            symbol: 'PREMIERD',
            name: 'Premier Capital - Clase D',
            category: 'FCI',
            nativeCurrency: 'ARS',
            quantity: qty,
            // Simulate the bug: upstream valArs looked like qty due to price=1 fallback
            valArs: qty,
            valUsdEq: 0,
            currentPrice: null,
        })

        const movements: Movement[] = [{
            id: 'm1',
            datetimeISO: '2026-02-01T10:00:00.000Z',
            type: 'BUY',
            assetClass: 'fci',
            instrumentId: 'fci-premier-d',
            accountId: broker.id,
            quantity: qty,
            unitPrice: lastTradeUnit,
            tradeCurrency: 'ARS',
            totalAmount: expected,
        }]

        const groupedRows = {
            [broker.id]: {
                accountName: broker.name,
                metrics: [fci],
                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
            },
        }

        const portfolio = buildPortfolioV2({
            groupedRows: groupedRows as any,
            accounts: [broker],
            fxRates,
            movements,
        })

        const fondos = portfolio.rubros.find(r => r.id === 'fci')
        const item = fondos?.providers.flatMap(p => p.items)[0]

        expect(item).toBeTruthy()
        expect(item!.valArs).toBeCloseTo(expected, 2)
        expect(item!.priceMeta?.source).toBe('last_trade')
        expect(item!.priceMeta?.unitPrice).toBe(lastTradeUnit)
        expect(item!.priceMeta?.asOfISO).toBe('2026-02-01T10:00:00.000Z')
    })

    it('computes KPI totalUsd as sum of item valuations (no global totalArs/TC conversion)', () => {
        const wallet: Account = {
            id: 'bank',
            name: 'Banco',
            kind: 'BANK',
            defaultCurrency: 'ARS',
        }

        const broker: Account = {
            id: 'iol',
            name: 'InvertirOnline',
            kind: 'BROKER',
            defaultCurrency: 'ARS',
        }

        const cash = makeMetrics({
            accountId: wallet.id,
            accountName: wallet.name,
            instrumentId: 'cash-ars',
            symbol: 'ARS',
            name: 'Pesos',
            category: 'CASH_ARS',
            nativeCurrency: 'ARS',
            quantity: 1000,
            valArs: 1000,
            valUsdEq: 0,
        })

        const cedear = makeMetrics({
            accountId: broker.id,
            accountName: broker.name,
            instrumentId: 'cedear-aapl',
            symbol: 'AAPL',
            name: 'Apple CEDEAR',
            category: 'CEDEAR',
            nativeCurrency: 'ARS',
            quantity: 1,
            valArs: 1210,
            valUsdEq: 0,
        })

        const groupedRows = {
            [wallet.id]: {
                accountName: wallet.name,
                metrics: [cash],
                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
            },
            [broker.id]: {
                accountName: broker.name,
                metrics: [cedear],
                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
            },
        }

        const portfolio = buildPortfolioV2({
            groupedRows: groupedRows as any,
            accounts: [wallet, broker],
            fxRates,
            movements: [],
        })

        const expectedUsd = (1000 / 1010) + (1210 / 1210)
        expect(portfolio.kpis.totalArs).toBe(2210)
        expect(portfolio.kpis.totalUsd).toBeCloseTo(expectedUsd, 10)
    })
})
