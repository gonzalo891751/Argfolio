import { describe, expect, it } from 'vitest'
import type { Movement, Snapshot } from '@/domain/types'
import type { PortfolioV2 } from '@/features/portfolioV2'
import { computeDashboardMetrics } from './dashboard-metrics'

function makeSnapshot(dateLocal: string, totalARS: number, withBreakdown = true): Snapshot {
    return {
        id: `snapshot-${dateLocal}`,
        dateLocal,
        totalARS,
        totalUSD: totalARS / 1000,
        fxUsed: {
            usdArs: 1000,
            type: 'MEP',
        },
        source: withBreakdown ? 'v2' : 'legacy',
        breakdownItems: withBreakdown ? {
            'wallet:acc1:ARS': { rubroId: 'wallets', ars: totalARS * 0.5, usd: (totalARS * 0.5) / 1000 },
            'pf:acc2:PF1': { rubroId: 'plazos', ars: totalARS * 0.5, usd: (totalARS * 0.5) / 1000 },
        } : undefined,
        createdAtISO: `${dateLocal}T12:00:00.000Z`,
    }
}

function makePortfolio(totalArs: number): PortfolioV2 {
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
            totalArs,
            totalUsd: totalArs / 1000,
            totalUsdEq: totalArs / 1000,
            pnlUnrealizedArs: 0,
            pnlUnrealizedUsd: 0,
            pnlUnrealizedUsdEq: 0,
            exposure: { usdHard: 0, usdEquivalent: 0, arsReal: totalArs },
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
                totals: { ars: totalArs * 0.4, usd: (totalArs * 0.4) / 1000 },
                pnl: { ars: 0, usd: 0 },
                providers: [
                    {
                        id: 'acc1',
                        name: 'Cuenta ARS',
                        totals: { ars: totalArs * 0.4, usd: (totalArs * 0.4) / 1000 },
                        pnl: { ars: 0, usd: 0 },
                        items: [
                            {
                                id: 'wallet-item',
                                kind: 'wallet_yield',
                                symbol: 'ARS',
                                label: 'Wallet',
                                valArs: totalArs * 0.4,
                                valUsd: (totalArs * 0.4) / 1000,
                                accountId: 'acc1',
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
                totals: { ars: totalArs * 0.6, usd: (totalArs * 0.6) / 1000 },
                pnl: { ars: 0, usd: 0 },
                providers: [
                    {
                        id: 'acc2',
                        name: 'Banco',
                        totals: { ars: totalArs * 0.6, usd: (totalArs * 0.6) / 1000 },
                        pnl: { ars: 0, usd: 0 },
                        items: [
                            {
                                id: 'pf-1',
                                kind: 'plazo_fijo',
                                symbol: 'PF',
                                label: 'PF 1',
                                valArs: totalArs * 0.6,
                                valUsd: (totalArs * 0.6) / 1000,
                                accountId: 'acc2',
                                pfMeta: {
                                    startDateISO: '2026-02-01T00:00:00.000Z',
                                    maturityDateISO: '2026-03-03T00:00:00.000Z',
                                    daysRemaining: 22,
                                    capitalArs: 6000,
                                    expectedInterestArs: 600,
                                    expectedTotalArs: 6600,
                                },
                                yieldMeta: { tna: 40 },
                            },
                        ],
                    },
                ],
            },
        ],
        walletDetails: new Map(),
        fixedDepositDetails: new Map([
            ['pf-1', {
                movementId: 'pf-mov-1',
                pfCode: 'PF-001',
                bank: 'Banco',
                status: 'active',
                capitalArs: 6000,
                tna: 40,
                termDays: 30,
                startDateISO: '2026-02-01T00:00:00.000Z',
                maturityDateISO: '2026-03-03T00:00:00.000Z',
                daysRemaining: 22,
                daysElapsed: 8,
                expectedInterestArs: 600,
                expectedTotalArs: 6600,
                accruedInterestArs: 160,
            }],
        ]),
        cedearDetails: new Map(),
        cryptoDetails: new Map(),
        fciDetails: new Map(),
    }
}

describe('dashboard metrics', () => {
    it('computes deltas and range net income with explicit statuses', () => {
        const portfolio = makePortfolio(12000)
        const snapshots = [
            makeSnapshot('2026-01-01', 9000),
            makeSnapshot('2026-01-31', 10000),
            makeSnapshot('2026-02-08', 11800),
        ]
        const movements: Movement[] = [
            {
                id: 'interest-1',
                datetimeISO: '2026-02-05T10:00:00.000Z',
                type: 'INTEREST',
                accountId: 'acc1',
                tradeCurrency: 'ARS',
                totalAmount: 50,
            } as Movement,
            {
                id: 'fee-1',
                datetimeISO: '2026-02-06T10:00:00.000Z',
                type: 'FEE',
                accountId: 'acc1',
                tradeCurrency: 'ARS',
                totalAmount: -10,
            } as Movement,
        ]

        const metrics = computeDashboardMetrics({
            portfolio,
            snapshots,
            movements,
            range: '30D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        expect(metrics.variation24h.status).toBe('ok')
        expect(metrics.variation24h.value?.deltaArs).toBe(200)
        expect(metrics.mtd.status).toBe('ok')
        expect(metrics.ytd.status).toBe('ok')

        expect(metrics.netIncome.status).toBe('ok')
        expect(metrics.netIncome.netArs).toBe(3000)
        expect(metrics.netIncome.feesArs).toBe(-10)
        expect(metrics.drivers.status).toBe('ok')
        expect(metrics.drivers.rows.length).toBeGreaterThan(0)
    })

    it('returns missing_history when there is no baseline snapshot', () => {
        const portfolio = makePortfolio(5000)
        const snapshots = [makeSnapshot('2026-02-09', 5000, false)]
        const metrics = computeDashboardMetrics({
            portfolio,
            snapshots,
            movements: [],
            range: '7D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        expect(metrics.variation24h.status).toBe('missing_history')
        expect(metrics.netIncome.status).toBe('missing_history')
        expect(metrics.drivers.status).toBe('missing_history')
    })

    it('includes fixed deposit accrued interest in short ranges', () => {
        const portfolio = makePortfolio(12000)
        const snapshots = [
            makeSnapshot('2026-02-08', 11950),
            makeSnapshot('2026-02-09', 12000),
        ]

        const metrics = computeDashboardMetrics({
            portfolio,
            snapshots,
            movements: [],
            range: '1D',
            now: new Date('2026-02-09T12:00:00.000Z'),
        })

        expect(metrics.netIncome.status).toBe('ok')
        expect(metrics.netIncome.interestArs).toBeGreaterThan(0)
        const plazos = metrics.drivers.rows.find((row) => row.rubroId === 'plazos')
        expect(plazos?.interestArs ?? 0).toBeGreaterThan(0)
    })
})
