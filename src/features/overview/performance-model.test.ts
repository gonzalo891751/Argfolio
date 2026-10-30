import { describe, it, expect } from 'vitest'
import { buildOverview } from './overview-model'
import { buildPerformance } from './performance-model'
import type { CedearDetail, CryptoDetail, FciDetail, ItemV2, PortfolioV2, RubroV2 } from '@/features/portfolioV2/types'

const fx = {
    officialSell: 1560, officialBuy: 1510, mepSell: 1575, mepBuy: 1565, cclSell: 1590, cclBuy: 1580,
    cryptoSell: 1653.91, cryptoBuy: 1630, updatedAtISO: '2026-10-30T12:00:00.000Z',
}

const rubro = (id: RubroV2['id'], provider: string, items: ItemV2[]): RubroV2 => ({
    id, name: id, icon: 'Wallet', fxPolicy: 'MEP', totals: { ars: 0, usd: 0 }, pnl: { ars: 0, usd: 0 },
    providers: [{ id: provider, name: provider, items, totals: { ars: 0, usd: 0 }, pnl: { ars: 0, usd: 0 } }],
})

const cedearDetail = (partial: Partial<CedearDetail>): CedearDetail => ({
    instrumentId: 'qqq', symbol: 'QQQ', name: 'QQQ', ratio: 1, totalQty: 0, totalCostArs: 0, totalCostUsd: 0,
    avgCostArs: 0, avgCostUsd: 0, currentPriceArs: 0, currentPriceUsd: 0, currentValueArs: 0, currentValueUsd: 0,
    pnlArs: 0, pnlUsd: 0, pnlPctArs: 0, pnlPctUsd: 0, lots: [], fxUsed: 'MEP', ...partial,
})

const lot = (dateISO: string, qty: number, unitCostArs: number, fxAtTrade: number) => ({
    id: dateISO, dateISO, qty, unitCostArs, unitCostUsd: unitCostArs / fxAtTrade, totalCostArs: qty * unitCostArs,
    totalCostUsd: (qty * unitCostArs) / fxAtTrade, currentValueArs: 0, currentValueUsd: 0, pnlArs: 0, pnlUsd: 0,
    pnlPctArs: 0, pnlPctUsd: 0, fxAtTrade,
})

function portfolio(): PortfolioV2 {
    const qqqLots = [lot('2025-01-03T12:00:00.000Z', 8, 29_675, 1_196), lot('2025-01-04T12:00:00.000Z', 12, 31_041, 1_171)]
    const costArs = qqqLots.reduce((s, l) => s + l.totalCostArs, 0)
    const costUsd = qqqLots.reduce((s, l) => s + l.totalCostUsd, 0)
    const qqqValueArs = 20 * 57_375
    return {
        isLoading: false, asOfISO: fx.updatedAtISO, fx,
        kpis: {
            totalArs: 0, totalUsd: 0, totalUsdEq: 0, pnlUnrealizedArs: 0, pnlUnrealizedUsd: 0, pnlUnrealizedUsdEq: 0,
            exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 0 }, pctUsdHard: 0, pctUsdEq: 0, pctArs: 0,
        },
        flags: { inferredBalanceCount: 0 },
        rubros: [
            rubro('cedears', 'galicia', [{ id: 'qqq-item', kind: 'cedear', symbol: 'QQQ', label: 'QQQ', accountId: 'galicia', qty: 20, valArs: qqqValueArs, valUsd: qqqValueArs / fx.mepSell }]),
            rubro('crypto', 'nexo', [{ id: 'btc-item', kind: 'crypto', symbol: 'BTC', label: 'Bitcoin', accountId: 'nexo', qty: 0.01, valArs: 900 * 1653.91, valUsd: 900, pnlArs: 100 * 1653.91, pnlUsd: 100 }]),
            rubro('fci', 'iol', [{ id: 'cama-item', kind: 'fci', symbol: 'IOLCAMA', label: 'IOLCAMA', accountId: 'iol', qty: 1000, valArs: 12_500, valUsd: 12_500 / 1510, nativeCurrency: 'ARS' }]),
            rubro('wallets', 'naranja', [{ id: 'nx', kind: 'wallet_yield', symbol: 'ARS', label: 'Naranja X', accountId: 'naranja', valArs: 221_967.19, valUsd: 221_967.19 / 1510, nativeCurrency: 'ARS', yieldMeta: { tna: 20 } }]),
        ],
        walletDetails: new Map([['naranja', { accountId: 'naranja', accountName: 'Naranja X', cashBalanceArs: 0, cashBalanceUsd: 0, yieldEnabled: true, interestTotalArs: 22_341.81, recentInterestMovements: [] }]]),
        fixedDepositDetails: new Map(),
        cedearDetails: new Map([['qqq-item', cedearDetail({ totalQty: 20, totalCostArs: costArs, totalCostUsd: costUsd, lots: qqqLots })]]),
        cryptoDetails: new Map([['btc-item', { totalCostUsd: 800, lots: [{ dateISO: '2026-02-01T00:00:00.000Z' }] } as unknown as CryptoDetail]]),
        fciDetails: new Map([['cama-item', { totalCostArs: 10_000, totalCostUsd: 8, lots: [{ dateISO: '2026-03-18T00:00:00.000Z' }] } as unknown as FciDetail]]),
    }
}

describe('buildPerformance', () => {
    const pf = portfolio()
    const perf = buildPerformance(buildOverview(pf), pf)
    const byGroup = Object.fromEntries(perf.groups.map(g => [g.id, g]))

    it('splits the CEDEAR peso result into stock and dollar effects that add up', () => {
        const row = byGroup.cedears.rows[0]
        const d = row.cedear!
        expect(row.currency).toBe('USD')
        expect(row.investedArs).toBeCloseTo(8 * 29_675 + 12 * 31_041, 6)
        expect(d.fxBuy).toBeCloseTo(row.investedArs / row.investedUsd, 6)
        expect(d.fxBuy).toBeGreaterThan(1171)
        expect(d.fxBuy).toBeLessThan(1196)
        expect(d.fxNow).toBeCloseTo(1575, 6)
        expect(d.fromAssetArs).toBeCloseTo(row.resultUsd * 1575, 6)
        expect(d.fromAssetArs + d.fromFxArs).toBeCloseTo(row.resultArs, 6)
        // the dollar effect is the MEP change applied to the dollars bought
        expect(d.fromFxArs).toBeCloseTo(row.investedUsd * (1575 - d.fxBuy), 4)
        expect(row.sinceISO).toBe('2025-01-03T12:00:00.000Z')
        expect(byGroup.cedears.cedear!.fromAssetArs).toBeCloseTo(d.fromAssetArs, 6)
    })

    it('judges crypto in dollars and FCIs in pesos', () => {
        const btc = byGroup.cripto.rows[0]
        expect(btc.resultUsd).toBeCloseTo(100, 6)
        expect(btc.resultPct).toBeCloseTo(0.125, 6)
        const cama = byGroup.fci.rows[0]
        expect(cama.currency).toBe('ARS')
        expect(cama.resultArs).toBeCloseTo(2_500, 6)
        expect(cama.resultPct).toBeCloseTo(0.25, 6)
    })

    it('shows interest already earned by accounts with a TNA', () => {
        const nx = byGroup.intereses.rows[0]
        expect(nx.tna).toBe(20)
        expect(nx.resultArs).toBeCloseTo(22_341.81, 6)
        expect(nx.investedArs).toBeCloseTo(221_967.19 - 22_341.81, 6)
    })

    it('adds every row into the totals', () => {
        const sum = perf.groups.flatMap(g => g.rows).reduce((s, r) => s + r.resultArs, 0)
        expect(perf.totals.resultArs).toBeCloseTo(sum, 6)
    })
})
