import { describe, expect, it } from 'vitest'
import { isPortfolioReadyForSnapshot } from './snapshot-v2'
import type { PortfolioV2 } from '@/features/portfolioV2'

function makeBasePortfolio(overrides: Partial<PortfolioV2> = {}): PortfolioV2 {
    return {
        isLoading: false,
        asOfISO: '2025-02-01T12:00:00Z',
        fx: {
            officialSell: 1000,
            officialBuy: 990,
            mepSell: 1200,
            mepBuy: 1190,
            cclSell: 0,
            cclBuy: 0,
            cryptoSell: 0,
            cryptoBuy: 0,
            updatedAtISO: '2025-02-01T12:00:00Z',
        },
        kpis: {
            totalArs: 0,
            totalUsd: 0,
            totalUsdEq: 0,
            pnlUnrealizedArs: 0,
            pnlUnrealizedUsd: 0,
            pnlUnrealizedUsdEq: 0,
            exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 0 },
            pctUsdHard: 0,
            pctUsdEq: 0,
            pctArs: 100,
        },
        flags: { inferredBalanceCount: 0 },
        rubros: [],
        walletDetails: new Map(),
        fixedDepositDetails: new Map(),
        cedearDetails: new Map(),
        cryptoDetails: new Map(),
        fciDetails: new Map(),
        ...overrides,
    }
}

describe('snapshot-v2 readiness', () => {
    it('blocks zero snapshot when there is external portfolio evidence', () => {
        const portfolio = makeBasePortfolio()
        const check = isPortfolioReadyForSnapshot(portfolio, {
            accountsCount: 1,
            movementsCount: 3,
            instrumentsCount: 2,
        })
        expect(check.ready).toBe(false)
        expect(check.reason).toBe('TOTAL_ZERO_WITH_ASSETS')
    })

    it('allows genuine empty portfolio with zero totals and no evidence', () => {
        const portfolio = makeBasePortfolio()
        const check = isPortfolioReadyForSnapshot(portfolio, {
            accountsCount: 0,
            movementsCount: 0,
            instrumentsCount: 0,
        })
        expect(check.ready).toBe(true)
        expect(check.reason).toBeNull()
    })

    it('blocks zero snapshot when yield-bearing wallet metadata exists', () => {
        const portfolio = makeBasePortfolio({
            rubros: [{
                id: 'wallets',
                name: 'Billeteras',
                icon: 'Wallet',
                fxPolicy: 'Oficial Venta',
                totals: { ars: 0, usd: 0 },
                pnl: { ars: 0, usd: 0 },
                providers: [{
                    id: 'wallet-1',
                    name: 'Wallet 1',
                    totals: { ars: 0, usd: 0 },
                    pnl: { ars: 0, usd: 0 },
                    items: [{
                        id: 'wallet-item-1',
                        kind: 'cash_ars',
                        symbol: 'ARS',
                        label: 'Pesos',
                        accountId: 'wallet-1',
                        valArs: 0,
                        valUsd: 0,
                        yieldMeta: { tna: 40 },
                    }],
                }],
            }],
        })

        const check = isPortfolioReadyForSnapshot(portfolio)
        expect(check.ready).toBe(false)
        expect(check.reason).toBe('TOTAL_ZERO_WITH_ASSETS')
    })
})

