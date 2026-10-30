/**
 * Regresiones de valuación:
 *  - Un depósito en dólares sin referencia en pesos no es "ganancia en pesos".
 *  - Un depósito en dólares con totalARS usa ese costo histórico.
 *  - Un plazo fijo vale capital + interés devengado a hoy (no el monto al vencimiento).
 */

import { describe, it, expect } from 'vitest'
import { computeAverageCost } from './average-cost'
import { computeAssetMetrics } from '@/domain/assets/valuation'
import { computePfValueToday } from '@/features/portfolioV2/builder'
import type { Movement } from '@/domain/types'
import type { FxQuotes } from '@/domain/fx/types'

const usdDeposit = (overrides: Partial<Movement> = {}): Movement => ({
    id: 'dep-usd',
    datetimeISO: '2026-08-01T12:00:00.000Z',
    type: 'DEPOSIT',
    assetClass: 'wallet',
    instrumentId: 'usd-cash',
    accountId: 'belo',
    quantity: 1200,
    unitPrice: 1,
    tradeCurrency: 'USD',
    totalAmount: 1200,
    netAmount: 1200,
    ...overrides,
})

const fxQuotes: FxQuotes = {
    oficial: { bid: 1385, ask: 1435, mid: 1410 },
    mep: { bid: 1452, ask: 1462, mid: 1457 },
    cripto: { bid: 1470, ask: 1495, mid: 1482.5 },
}

describe('USD deposits cost basis', () => {
    it('does not treat the USD amount as an ARS cost when no FX is known', () => {
        const result = computeAverageCost([usdDeposit()])
        expect(result.quantity).toBe(1200)
        expect(result.costBasisUsd).toBe(1200)
        expect(result.costBasisArs).toBe(0)
        expect(result.arsCostUnknown).toBe(true)
    })

    it('uses totalARS as the ARS cost when present', () => {
        const result = computeAverageCost([usdDeposit({ totalARS: 1_620_000, totalUSD: 1200 })])
        expect(result.costBasisArs).toBe(1_620_000)
        expect(result.arsCostUnknown).toBe(false)
    })

    it('derives the ARS cost from the deposit FX snapshot', () => {
        const result = computeAverageCost([usdDeposit({ fx: { kind: 'OFICIAL', rate: 1350, side: 'sell', asOf: '2026-08-01T12:00:00.000Z' } })])
        expect(result.costBasisArs).toBe(1200 * 1350)
        expect(result.arsCostUnknown).toBe(false)
    })

    it('reports no ARS PnL for USD cash with unknown ARS cost', () => {
        const metrics = computeAssetMetrics({
            instrumentId: 'usd-cash',
            symbol: 'USD',
            name: 'Dólares',
            category: 'CASH_USD',
            nativeCurrency: 'USD',
            quantity: 1200,
            avgCostNative: 1,
            costBasisArs: 1200,
            costBasisUsdEq: 1200,
            arsCostUnknown: true,
        }, { currentPrice: 1 }, fxQuotes)

        expect(metrics.pnlArs).toBeNull()
        expect(metrics.pnlUsdEq).toBe(0)
    })
})

describe('computePfValueToday', () => {
    const pf = {
        principalARS: 1_000_000,
        expectedInterestARS: 30_000,
        expectedTotalARS: 1_030_000,
        startTs: '2026-10-01T03:00:00.000Z',
        maturityTs: '2026-10-31T03:00:00.000Z',
    }
    const day = 86_400_000

    it('is the capital on day zero', () => {
        expect(computePfValueToday(pf, Date.parse(pf.startTs))).toBe(1_000_000)
    })

    it('accrues interest per elapsed day', () => {
        expect(computePfValueToday(pf, Date.parse(pf.startTs) + 15 * day + 1000)).toBeCloseTo(1_015_000, 2)
    })

    it('is the full amount once matured', () => {
        expect(computePfValueToday(pf, Date.parse(pf.maturityTs) + day)).toBe(1_030_000)
    })
})
