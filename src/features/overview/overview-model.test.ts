import { describe, it, expect } from 'vitest'
import { buildOverview, projectInterest } from './overview-model'
import type { ItemV2, PortfolioV2, RubroV2 } from '@/features/portfolioV2/types'

const fx = {
    officialSell: 1435,
    officialBuy: 1385,
    mepSell: 1462,
    mepBuy: 1452,
    cclSell: 1488,
    cclBuy: 1478,
    cryptoSell: 1495,
    cryptoBuy: 1470,
    updatedAtISO: '2026-10-30T12:00:00.000Z',
}

function item(partial: Partial<ItemV2> & Pick<ItemV2, 'id' | 'kind' | 'symbol' | 'accountId' | 'valArs' | 'valUsd'>): ItemV2 {
    return { label: partial.symbol, ...partial }
}

function rubro(id: RubroV2['id'], providers: Array<{ id: string; name: string; items: ItemV2[] }>): RubroV2 {
    return {
        id,
        name: id,
        icon: 'Wallet',
        fxPolicy: 'MEP',
        totals: { ars: 0, usd: 0 },
        pnl: { ars: 0, usd: 0 },
        providers: providers.map(p => ({ ...p, totals: { ars: 0, usd: 0 }, pnl: { ars: 0, usd: 0 } })),
    }
}

function portfolio(rubros: RubroV2[], walletInterest: Record<string, number> = {}): PortfolioV2 {
    return {
        isLoading: false,
        asOfISO: '2026-10-30T12:00:00.000Z',
        fx,
        kpis: {
            totalArs: 0, totalUsd: 0, totalUsdEq: 0, pnlUnrealizedArs: 0, pnlUnrealizedUsd: 0,
            pnlUnrealizedUsdEq: 0, exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 0 },
            pctUsdHard: 0, pctUsdEq: 0, pctArs: 0,
        },
        flags: { inferredBalanceCount: 0 },
        rubros,
        walletDetails: new Map(Object.entries(walletInterest).map(([accountId, interestTotalArs]) => [accountId, {
            accountId, accountName: accountId, cashBalanceArs: 0, cashBalanceUsd: 0, yieldEnabled: true,
            interestTotalArs, recentInterestMovements: [],
        }])),
        fixedDepositDetails: new Map(),
        cedearDetails: new Map(),
        cryptoDetails: new Map(),
        fciDetails: new Map(),
    }
}

const sample = () => portfolio([
    rubro('wallets', [
        { id: 'mp', name: 'Mercado Pago', items: [item({ id: 'mp-ars', kind: 'cash_ars', symbol: 'ARS', accountId: 'mp', valArs: 1_000_000, valUsd: 696.86, nativeCurrency: 'ARS', yieldMeta: { tna: 30 } })] },
        { id: 'belo', name: 'Belo', items: [item({ id: 'belo-usd', kind: 'cash_usd', symbol: 'USD', accountId: 'belo', valArs: 1_662_000, valUsd: 1200, nativeCurrency: 'USD' })] },
        { id: 'iol-cash', name: 'InvertirOnline (Liquidez)', items: [item({ id: 'iol-ars', kind: 'cash_ars', symbol: 'ARS', accountId: 'iol', valArs: 50_000, valUsd: 34.84, nativeCurrency: 'ARS' })] },
    ]),
    rubro('frascos', [
        { id: 'nx', name: 'Naranja X', items: [item({ id: 'nx-ars', kind: 'wallet_yield', symbol: 'ARS', accountId: 'nx', valArs: 500_000, valUsd: 348.43, nativeCurrency: 'ARS', yieldMeta: { tna: 20 } })] },
    ]),
    rubro('plazos', [
        { id: 'pf-nacion', name: 'Banco Nación', items: [item({
            id: 'pf1', kind: 'plazo_fijo', symbol: 'PF', label: 'PF Nación', accountId: 'nacion', valArs: 1_015_000, valUsd: 707.32, nativeCurrency: 'ARS',
            yieldMeta: { tna: 36.5 },
            pfMeta: { startDateISO: '2026-10-15T03:00:00.000Z', maturityDateISO: '2026-11-14T03:00:00.000Z', daysRemaining: 15, capitalArs: 1_000_000, expectedInterestArs: 30_000, expectedTotalArs: 1_030_000 },
        })] },
    ]),
    rubro('cedears', [
        { id: 'iol', name: 'InvertirOnline', items: [item({ id: 'iol-aapl', kind: 'cedear', symbol: 'AAPL', label: 'Apple', accountId: 'iol', valArs: 738_000, valUsd: 504.79, pnlArs: 130_000, pnlUsd: 40, pnlPct: 0.086, nativeCurrency: 'ARS' })] },
    ]),
    rubro('crypto', [
        { id: 'binance', name: 'Binance', items: [
            item({ id: 'bn-btc', kind: 'crypto', symbol: 'BTC', label: 'Bitcoin', accountId: 'binance', qty: 0.035, valArs: 5_363_662, valUsd: 3648.75, pnlArs: 1_200_000, pnlUsd: 568.75, pnlPct: 0.1847, nativeCurrency: 'USD' }),
            item({ id: 'bn-usdt', kind: 'stable', symbol: 'USDT', accountId: 'binance', valArs: 147_000, valUsd: 100, pnlArs: 12_000, pnlUsd: 0, nativeCurrency: 'USD' }),
            item({ id: 'bn-nexo', kind: 'crypto', symbol: 'NEXO', accountId: 'binance', qty: 10, valArs: 0, valUsd: 0, valueMissing: true, nativeCurrency: 'USD' }),
        ] },
    ]),
], { mp: 42_000 })

describe('buildOverview', () => {
    it('splits real pesos from dollar positions', () => {
        const ov = buildOverview(sample(), Date.parse('2026-10-30T12:00:00.000Z'))

        expect(ov.pesos.groups.map(g => g.id)).toEqual(['billeteras', 'frascos', 'plazos'])
        expect(ov.dolares.groups.map(g => g.id)).toEqual(['dolares', 'cripto', 'cedears'])
        expect(ov.pesos.totalArs).toBe(1_000_000 + 50_000 + 500_000 + 1_015_000)
        // USD cash and USDT count as dollars; NEXO without price is not valued.
        expect(ov.dolares.totalUsd).toBeCloseTo(1200 + 100 + 3648.75 + 504.79, 2)
        expect(ov.totalArs).toBe(ov.pesos.totalArs + ov.dolares.totalArs)
        expect(ov.pesos.sharePct + ov.dolares.sharePct).toBeCloseTo(100, 6)
        expect(ov.missingPriceCount).toBe(1)
    })

    it('reports dollar results in USD and keeps missing quotes out of totals', () => {
        const ov = buildOverview(sample(), Date.parse('2026-10-30T12:00:00.000Z'))
        expect(ov.dolares.resultUsd).toBeCloseTo(568.75 + 40, 2)
        const nexo = ov.dolares.groups.flatMap(g => g.positions).find(p => p.symbol === 'NEXO')
        expect(nexo?.valueMissing).toBe(true)
        expect(nexo?.resultUsd).toBeUndefined()
    })

    it('projects and accumulates peso interest', () => {
        const ov = buildOverview(sample(), Date.parse('2026-10-30T12:00:00.000Z'))
        const mp = ov.pesos.groups[0].positions.find(p => p.accountId === 'mp')
        expect(mp?.interestTomorrowArs).toBeCloseTo(1_000_000 * 0.30 / 365, 4)
        expect(mp?.interestEarnedArs).toBe(42_000)

        const pf = ov.pesos.groups.find(g => g.id === 'plazos')!.positions[0]
        expect(pf.interestEarnedArs).toBe(15_000)
        expect(pf.interestTomorrowArs).toBeCloseTo(1000, 6)
        expect(pf.pf?.totalAtMaturityArs).toBe(1_030_000)

        expect(ov.pesos.interestEarnedArs).toBe(42_000 + 15_000)
        expect(ov.pesos.interest30dArs).toBeGreaterThan(0)
    })

    it('labels cash positions by account and strips the liquidity suffix', () => {
        const ov = buildOverview(sample(), Date.parse('2026-10-30T12:00:00.000Z'))
        const labels = ov.pesos.groups[0].positions.map(p => p.label)
        expect(labels).toEqual(['Mercado Pago', 'InvertirOnline'])
        expect(ov.pesos.groups[0].positions[0].href).toBe('/activos/billeteras/mp')
    })

    it('handles an empty portfolio', () => {
        const ov = buildOverview(null)
        expect(ov.totalArs).toBe(0)
        expect(ov.hasPositions).toBe(false)
    })
})

describe('projectInterest', () => {
    it('compounds daily', () => {
        expect(projectInterest(365_000, 36.5, 1)).toBeCloseTo(365, 6)
        expect(projectInterest(100_000, 30, 30)).toBeGreaterThan(100_000 * 0.30 / 365 * 30)
        expect(projectInterest(100_000, 0, 30)).toBe(0)
    })
})
