import { describe, expect, it } from 'vitest'
import type { PortfolioV2 } from '@/features/portfolioV2'
import { computeProjectedEarningsByRubro } from './projected-earnings'

function makePortfolio(): PortfolioV2 {
    return {
        isLoading: false,
        asOfISO: '2026-02-09T12:00:00.000Z',
        fx: {
            officialSell: 1000,
            officialBuy: 980,
            mepSell: 1000,
            mepBuy: 990,
            cclSell: 1100,
            cclBuy: 1080,
            cryptoSell: 1010,
            cryptoBuy: 1000,
            updatedAtISO: '2026-02-09T12:00:00.000Z',
        },
        kpis: {
            totalArs: 500000,
            totalUsd: 500,
            totalUsdEq: 500,
            pnlUnrealizedArs: 0,
            pnlUnrealizedUsd: 0,
            pnlUnrealizedUsdEq: 0,
            exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 500000 },
            pctUsdHard: 0,
            pctUsdEq: 0,
            pctArs: 100,
        },
        flags: { inferredBalanceCount: 0 },
        rubros: [
            {
                id: 'wallets',
                name: 'Billeteras',
                icon: 'wallet',
                fxPolicy: 'MEP',
                totals: { ars: 100000, usd: 100 },
                pnl: { ars: 1200, usd: 1.2 },
                providers: [
                    {
                        id: 'acc-wallet',
                        name: 'Wallet',
                        totals: { ars: 100000, usd: 100 },
                        pnl: { ars: 1200, usd: 1.2 },
                        items: [
                            {
                                id: 'wallet-1',
                                kind: 'wallet_yield',
                                symbol: 'ARS',
                                label: 'Wallet ARS',
                                valArs: 100000,
                                valUsd: 100,
                                pnlArs: 1200,
                                pnlUsd: 1.2,
                                accountId: 'acc-wallet',
                                yieldMeta: { tna: 36 },
                            },
                        ],
                    },
                ],
            },
            {
                id: 'plazos',
                name: 'Plazos',
                icon: 'clock',
                fxPolicy: 'Oficial Venta',
                totals: { ars: 200000, usd: 200 },
                pnl: { ars: 5000, usd: 5 },
                providers: [
                    {
                        id: 'acc-pf',
                        name: 'Banco',
                        totals: { ars: 200000, usd: 200 },
                        pnl: { ars: 5000, usd: 5 },
                        items: [
                            {
                                id: 'pf-1',
                                kind: 'plazo_fijo',
                                symbol: 'PF',
                                label: 'PF',
                                valArs: 200000,
                                valUsd: 200,
                                pnlArs: 5000,
                                pnlUsd: 5,
                                accountId: 'acc-pf',
                            },
                        ],
                    },
                ],
            },
            {
                id: 'cedears',
                name: 'CEDEARs',
                icon: 'line-chart',
                fxPolicy: 'MEP',
                totals: { ars: 80000, usd: 80 },
                pnl: { ars: 10000, usd: 10 },
                providers: [
                    {
                        id: 'acc-ced',
                        name: 'Broker',
                        totals: { ars: 80000, usd: 80 },
                        pnl: { ars: 10000, usd: 10 },
                        items: [
                            {
                                id: 'ced-1',
                                kind: 'cedear',
                                symbol: 'AAPL',
                                label: 'AAPL',
                                valArs: 80000,
                                valUsd: 80,
                                pnlArs: 10000,
                                pnlUsd: 10,
                                accountId: 'acc-ced',
                            },
                        ],
                    },
                ],
            },
            {
                id: 'crypto',
                name: 'Cripto',
                icon: 'bitcoin',
                fxPolicy: 'Cripto',
                totals: { ars: 70000, usd: 70 },
                pnl: { ars: 8000, usd: 8 },
                providers: [
                    {
                        id: 'acc-crypto',
                        name: 'Exchange',
                        totals: { ars: 70000, usd: 70 },
                        pnl: { ars: 8000, usd: 8 },
                        items: [
                            {
                                id: 'btc-1',
                                kind: 'crypto',
                                symbol: 'BTC',
                                label: 'BTC',
                                valArs: 70000,
                                valUsd: 70,
                                pnlArs: 8000,
                                pnlUsd: 8,
                                accountId: 'acc-crypto',
                            },
                        ],
                    },
                ],
            },
            {
                id: 'fci',
                name: 'Fondos',
                icon: 'pie-chart',
                fxPolicy: 'Oficial Venta',
                totals: { ars: 50000, usd: 50 },
                pnl: { ars: 3000, usd: 3 },
                providers: [
                    {
                        id: 'acc-fci',
                        name: 'Banco',
                        totals: { ars: 50000, usd: 50 },
                        pnl: { ars: 3000, usd: 3 },
                        items: [
                            {
                                id: 'fci-1',
                                kind: 'fci',
                                symbol: 'FCI',
                                label: 'Fondo',
                                valArs: 50000,
                                valUsd: 50,
                                pnlArs: 3000,
                                pnlUsd: 3,
                                accountId: 'acc-fci',
                            },
                        ],
                    },
                ],
            },
        ],
        walletDetails: new Map(),
        fixedDepositDetails: new Map([
            ['pf-1', {
                movementId: 'mov-pf-1',
                pfCode: 'PF-1',
                bank: 'Banco',
                status: 'active',
                capitalArs: 200000,
                tna: 0,
                termDays: 30,
                startDateISO: '2026-02-01T00:00:00.000Z',
                maturityDateISO: '2026-03-05T00:00:00.000Z',
                daysRemaining: 24,
                daysElapsed: 6,
                expectedInterestArs: 30000,
                expectedTotalArs: 230000,
                accruedInterestArs: 6000,
            }],
        ]),
        cedearDetails: new Map(),
        cryptoDetails: new Map(),
        fciDetails: new Map(),
    }
}

describe('computeProjectedEarningsByRubro', () => {
    it('projects wallet carry for MAN/30D/1A', () => {
        const portfolio = makePortfolio()
        const tomorrow = computeProjectedEarningsByRubro({
            portfolio,
            horizon: 'MAN',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })
        const d30 = computeProjectedEarningsByRubro({
            portfolio,
            horizon: '30D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })
        const y1 = computeProjectedEarningsByRubro({
            portfolio,
            horizon: '1A',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        const walletsTomorrow = tomorrow.rows.find((row) => row.rubroId === 'wallets')
        const wallets30d = d30.rows.find((row) => row.rubroId === 'wallets')
        const wallets1y = y1.rows.find((row) => row.rubroId === 'wallets')

        expect(walletsTomorrow).toBeTruthy()
        expect(walletsTomorrow!.projectedGainArs).toBeGreaterThan(0)
        expect(wallets30d!.projectedGainArs).toBeGreaterThan(walletsTomorrow!.projectedGainArs)
        expect(wallets1y!.projectedGainArs).toBeGreaterThan(wallets30d!.projectedGainArs)
    })

    it('projects PF accrual proportionally and caps by remaining days', () => {
        const rows15 = computeProjectedEarningsByRubro({
            portfolio: makePortfolio(),
            horizon: '30D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        }).rows
        const rows90 = computeProjectedEarningsByRubro({
            portfolio: makePortfolio(),
            horizon: '90D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        }).rows

        const pf30 = rows15.find((row) => row.rubroId === 'plazos')
        const pf90 = rows90.find((row) => row.rubroId === 'plazos')
        expect(pf30).toBeTruthy()
        expect(pf90).toBeTruthy()

        expect(pf30!.projectedGainArs).toBeCloseTo(24000, 4)
        expect(pf90!.projectedGainArs).toBeCloseTo(24000, 4)
    })

    it('keeps CEDEAR/Cripto/FCI projected incremental at 0 and preserves pnlNow', () => {
        const result = computeProjectedEarningsByRubro({
            portfolio: makePortfolio(),
            horizon: '1A',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        const cedears = result.rows.find((row) => row.rubroId === 'cedears')
        const crypto = result.rows.find((row) => row.rubroId === 'crypto')
        const fci = result.rows.find((row) => row.rubroId === 'fci')

        expect(cedears?.projectedGainArs).toBe(0)
        expect(crypto?.projectedGainArs).toBe(0)
        expect(fci?.projectedGainArs).toBe(0)

        expect(cedears?.pnlNowArs).toBeGreaterThan(0)
        expect(crypto?.pnlNowArs).toBeGreaterThan(0)
        expect(fci?.pnlNowArs).toBeGreaterThan(0)
    })

    it('handles missing FX with status/hint and no NaN', () => {
        const portfolio = makePortfolio()
        portfolio.fx.mepSell = 0
        portfolio.fx.officialSell = 0
        portfolio.fx.mepBuy = 0
        portfolio.fx.officialBuy = 0

        const result = computeProjectedEarningsByRubro({
            portfolio,
            horizon: 'MAN',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        const wallets = result.rows.find((row) => row.rubroId === 'wallets')
        expect(wallets).toBeTruthy()
        expect(wallets!.projectedGainArs).toBeGreaterThan(0)
        expect(wallets!.projectedGainUsd).toBe(0)
        expect(wallets!.status).toBe('missing_data')
        expect(wallets!.notes.join(' ')).toContain('FX')
    })
})
