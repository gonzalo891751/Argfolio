import { describe, expect, it } from 'vitest'
import type { FxRates, Movement } from '@/domain/types'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { computeRealizedPnL } from '@/domain/portfolio/computePnL'
import { computeCashLedger } from '@/domain/portfolio/cash-ledger'
import { buildCryptoBalanceAdjustmentMovement, reclassifyCryptoBalanceAdjustment } from './crypto-balance-adjustment'

const fxRates: FxRates = {
    mep: { buy: 1000, sell: 1000 },
    ccl: { buy: 1000, sell: 1000 },
    oficial: { buy: 1000, sell: 1000 },
    blue: { buy: 1000, sell: 1000 },
    cripto: { buy: 1000, sell: 1000 },
    updatedAtISO: '2026-07-09T00:00:00.000Z',
    source: 'test',
}

describe('crypto balance adjustments', () => {
    it('builds the NEXO +0.11173359 adjustment with auditable metadata', () => {
        const adjustment = buildCryptoBalanceAdjustmentMovement({
            accountId: 'nexo',
            instrumentId: 'nexo-token',
            symbol: 'NEXO',
            diffQty: 0.11173359,
            reason: 'reward',
            costPolicy: 'zero_cost',
        })
        expect(adjustment.type).toBe('INTEREST')
        expect(adjustment.quantity).toBe(0.11173359)
        expect(adjustment.meta).toMatchObject({ operationKind: 'income', adjustmentReason: 'reward', legRole: 'asset' })
        expect(computeAverageCost([adjustment]).quantity).toBeCloseTo(0.11173359, 10)
    })

    it('switches an unknown positive adjustment to zero-cost income when classified as reward', () => {
        const unknown = buildCryptoBalanceAdjustmentMovement({
            accountId: 'nexo', instrumentId: 'nexo-token', symbol: 'NEXO', diffQty: 0.11173359,
            reason: 'unknown', costPolicy: 'preserve_average', unitCostUsd: 0.74,
            datetimeISO: '2026-07-09T00:00:00.000Z',
        })
        const reward = reclassifyCryptoBalanceAdjustment(unknown, 'reward')
        const sale: Movement = {
            id: 'reward-sale', datetimeISO: '2026-07-10T00:00:00.000Z', type: 'SELL', assetClass: 'crypto',
            accountId: 'nexo', instrumentId: 'nexo-token', ticker: 'NEXO', quantity: 0.11173359, unitPrice: 1,
            tradeCurrency: 'USD', totalAmount: 0.11173359, totalUSD: 0.11173359,
        }
        expect(reward.type).toBe('INTEREST')
        expect(reward.unitPrice).toBe(0)
        expect(reward.totalAmount).toBe(0)
        expect(reward.totalUSD).toBe(0)
        expect(reward.meta).toMatchObject({
            operationKind: 'income', adjustmentReason: 'reward', costPolicy: 'zero_cost', requiresManualReview: false,
        })
        expect(computeRealizedPnL([reward, sale], fxRates).realizedUsd).toBeCloseTo(0.11173359, 10)
    })

    it('represents a small negative BTC fee without a fake SELL or realized PnL', () => {
        const buy: Movement = {
            id: 'buy', datetimeISO: '2026-07-01T00:00:00.000Z', type: 'BUY', assetClass: 'crypto',
            accountId: 'nexo', instrumentId: 'btc', ticker: 'BTC', quantity: 0.02, unitPrice: 60000,
            tradeCurrency: 'USD', totalAmount: 1200,
        }
        const fee = buildCryptoBalanceAdjustmentMovement({
            accountId: 'nexo', instrumentId: 'btc', symbol: 'BTC', diffQty: -0.00000781,
            reason: 'fee', costPolicy: 'preserve_average', unitCostUsd: 60000,
        })
        expect(fee.type).toBe('WITHDRAW')
        expect(fee.meta?.operationKind).toBe('fee')
        expect(computeAverageCost([buy, fee]).quantity).toBeCloseTo(0.01999219, 10)
        expect(computeRealizedPnL([buy, fee], fxRates).realizedUsd).toBe(0)
        expect(computeCashLedger([fee]).balances.get('nexo')?.get('USD') ?? 0).toBe(0)
    })

    it('reduces USDT through an adjustment without cash or sale PnL', () => {
        const adjustment = buildCryptoBalanceAdjustmentMovement({
            accountId: 'binance', instrumentId: 'usdt', symbol: 'USDT', diffQty: -0.08,
            reason: 'rounding', costPolicy: 'preserve_average', unitCostUsd: 1,
        })
        expect(adjustment.type).toBe('WITHDRAW')
        expect(adjustment.meta?.operationKind).toBe('balance_adjustment')
        expect(computeCashLedger([adjustment]).balances.get('binance')?.get('USD') ?? 0).toBe(0)
        expect(computeRealizedPnL([adjustment], fxRates).realizedUsd).toBe(0)
    })

    it('rejects sign-incompatible reward and fee classifications', () => {
        expect(() => buildCryptoBalanceAdjustmentMovement({
            accountId: 'nexo', instrumentId: 'nexo-token', symbol: 'NEXO', diffQty: 0.1,
            reason: 'fee', costPolicy: 'zero_cost',
        })).toThrow('fee debe disminuir')
        expect(() => buildCryptoBalanceAdjustmentMovement({
            accountId: 'nexo', instrumentId: 'nexo-token', symbol: 'NEXO', diffQty: -0.1,
            reason: 'reward', costPolicy: 'zero_cost',
        })).toThrow('reward debe aumentar')
    })
})
