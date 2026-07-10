/**
 * Fase 5 — Swap/conversión cripto.
 *
 * Invariantes:
 *  - La fuente no-stable realiza PnL sobre la cantidad convertida.
 *  - La fuente stable (USD 1) realiza PnL ≈ 0.
 *  - El destino nace con costo = valor entregado (verificable), aunque no
 *    tenga precio de mercado (caso NEXO).
 *  - Todas las patas comparten operationId y se agrupan como 'swap'.
 *  - Cash-neutral: SELL acredita y BUY debita el mismo total.
 */

import { describe, it, expect } from 'vitest'
import { buildCryptoSwapMovements, CryptoSwapError } from './crypto-swap'
import { groupMovementsByOperation } from './operation'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { computeRealizedPnL } from '@/domain/portfolio/computePnL'
import { computeCashLedger } from '@/domain/portfolio/cash-ledger'
import type { Movement, FxRates } from '@/domain/types'

const fxRates: FxRates = {
    oficial: { buy: 1060, sell: 1080 },
    blue: { buy: 1500, sell: 1520 },
    mep: { buy: 1470, sell: 1485 },
    ccl: { buy: 1475, sell: 1490 },
    cripto: { buy: 1520, sell: 1535 },
    updatedAtISO: '2026-07-09T12:00:00.000Z',
    source: 'test',
}

function buyBtc(accountId: string, qty: number, priceUsd: number, dateISO: string): Movement {
    return {
        id: crypto.randomUUID(),
        datetimeISO: dateISO,
        type: 'BUY',
        assetClass: 'crypto',
        accountId,
        instrumentId: 'btc',
        ticker: 'BTC',
        quantity: qty,
        unitPrice: priceUsd,
        tradeCurrency: 'USD',
        totalAmount: qty * priceUsd,
        totalUSD: qty * priceUsd,
    }
}

function buyUsdt(accountId: string, qty: number, dateISO: string): Movement {
    return {
        id: crypto.randomUUID(),
        datetimeISO: dateISO,
        type: 'BUY',
        assetClass: 'crypto',
        accountId,
        instrumentId: 'usdt',
        ticker: 'USDT',
        quantity: qty,
        unitPrice: 1,
        tradeCurrency: 'USD',
        totalAmount: qty,
        totalUSD: qty,
    }
}

describe('buildCryptoSwapMovements — validaciones', () => {
    it('rechaza swap sin fuentes', () => {
        expect(() => buildCryptoSwapMovements({
            accountId: 'nexo',
            sources: [],
            destination: { instrumentId: 'nexo-token', symbol: 'NEXO', qty: 100 },
        })).toThrowError(CryptoSwapError)
    })

    it('rechaza saldo insuficiente sin override', () => {
        expect(() => buildCryptoSwapMovements({
            accountId: 'nexo',
            sources: [{ instrumentId: 'btc', symbol: 'BTC', qty: 0.5, priceUsd: 63000, availableQty: 0.02 }],
            destination: { instrumentId: 'nexo-token', symbol: 'NEXO', qty: 100 },
        })).toThrowError(/Saldo insuficiente/)
    })

    it('rechaza origen = destino', () => {
        expect(() => buildCryptoSwapMovements({
            accountId: 'nexo',
            sources: [{ instrumentId: 'nexo-token', symbol: 'NEXO', qty: 1, priceUsd: 1 }],
            destination: { instrumentId: 'nexo-token', symbol: 'NEXO', qty: 100 },
        })).toThrowError(/mismo/)
    })
})

describe('Caso 1 — SWAP 0.001 BTC → NEXO con BTC comprado a 70k y valuado a 63k', () => {
    const buy = buyBtc('nexo', 0.02, 70000, '2026-01-10T10:00:00.000Z')
    const swap = buildCryptoSwapMovements({
        accountId: 'nexo',
        sources: [{ instrumentId: 'btc', symbol: 'BTC', qty: 0.001, priceUsd: 63000, availableQty: 0.02 }],
        destination: { instrumentId: 'nexo-token', symbol: 'NEXO', assetName: 'Nexo Token', qty: 50 },
        datetimeISO: '2026-02-01T10:00:00.000Z',
    })
    const allMovements: Movement[] = [buy, ...swap.sourceMovements, swap.destinationMovement]

    it('BTC baja 0.001 y NEXO sube 50', () => {
        const byInstrument = (id: string) =>
            computeAverageCost(allMovements.filter(m => m.instrumentId === id))
        expect(byInstrument('btc').quantity).toBeCloseTo(0.019, 9)
        expect(byInstrument('nexo-token').quantity).toBeCloseTo(50, 9)
    })

    it('realiza la pérdida sobre 0.001 BTC: (63000 - 70000) × 0.001 = -7 USD', () => {
        const pnl = computeRealizedPnL(allMovements, fxRates)
        expect(pnl.realizedUsd).toBeCloseTo(-7, 6)
    })

    it('NEXO nace con costo 63 USD (0.001 × 63000)', () => {
        const nexoPos = computeAverageCost(allMovements.filter(m => m.instrumentId === 'nexo-token'))
        expect(nexoPos.costBasisUsd).toBeCloseTo(63, 6)
        expect(swap.totalValueUsd).toBeCloseTo(63, 6)
        expect(swap.destinationUnitCostUsd).toBeCloseTo(1.26, 6)
    })

    it('la operación queda agrupada como swap', () => {
        const grouped = groupMovementsByOperation(allMovements)
        expect(grouped.groups).toHaveLength(1)
        expect(grouped.groups[0].kind).toBe('swap')
        expect(grouped.groups[0].legs).toHaveLength(2)
    })

    it('es cash-neutral (no crea ni destruye USD de caja)', () => {
        const swapOnly: Movement[] = [...swap.sourceMovements, swap.destinationMovement]
        const ledger = computeCashLedger(swapOnly)
        expect(ledger.balances.get('nexo')?.get('USD') ?? 0).toBe(0)
        expect(ledger.openingBalances.get('nexo')?.get('USD') ?? 0).toBe(0)
    })
})

describe('Caso 2 — SWAP 80 USDT → NEXO', () => {
    const buy = buyUsdt('nexo', 100, '2026-01-10T10:00:00.000Z')
    const swap = buildCryptoSwapMovements({
        accountId: 'nexo',
        sources: [{ instrumentId: 'usdt', symbol: 'USDT', qty: 80, priceUsd: 1, availableQty: 100 }],
        destination: { instrumentId: 'nexo-token', symbol: 'NEXO', qty: 64 },
        datetimeISO: '2026-02-01T10:00:00.000Z',
    })
    const allMovements: Movement[] = [buy, ...swap.sourceMovements, swap.destinationMovement]

    it('USDT baja 80 y NEXO sube 64', () => {
        const usdt = computeAverageCost(allMovements.filter(m => m.instrumentId === 'usdt'))
        const nexo = computeAverageCost(allMovements.filter(m => m.instrumentId === 'nexo-token'))
        expect(usdt.quantity).toBeCloseTo(20, 9)
        expect(nexo.quantity).toBeCloseTo(64, 9)
    })

    it('el costo de NEXO es 80 USD y el PnL de USDT es 0', () => {
        const nexo = computeAverageCost(allMovements.filter(m => m.instrumentId === 'nexo-token'))
        expect(nexo.costBasisUsd).toBeCloseTo(80, 6)

        const pnl = computeRealizedPnL(allMovements, fxRates)
        expect(pnl.realizedUsd).toBeCloseTo(0, 6)
    })

    it('no crea caja USD aunque las patas sean SELL/BUY', () => {
        const ledger = computeCashLedger([...swap.sourceMovements, swap.destinationMovement])
        expect(ledger.balances.get('nexo')?.get('USD') ?? 0).toBe(0)
        expect(ledger.openingBalances.get('nexo')?.get('USD') ?? 0).toBe(0)
    })
})

describe('Caso 3 — SWAP multi-origen BTC + USDT → NEXO (caso real Nexo)', () => {
    // Réplica de la operación real: 0.0016077 BTC + 40.735376 USDT → 162.22502272 NEXO
    const buyBtcMov = buyBtc('nexo', 0.0172965 + 0.0016077, 70000, '2026-01-10T10:00:00.000Z')
    const buyUsdtMov = buyUsdt('nexo', 60, '2026-01-11T10:00:00.000Z')

    const btcPriceAtSwap = 63000
    const swap = buildCryptoSwapMovements({
        accountId: 'nexo',
        sources: [
            { instrumentId: 'btc', symbol: 'BTC', qty: 0.0016077, priceUsd: btcPriceAtSwap, availableQty: 0.0189042 },
            { instrumentId: 'usdt', symbol: 'USDT', qty: 40.735376, priceUsd: 1, availableQty: 60 },
        ],
        destination: { instrumentId: 'nexo-token', symbol: 'NEXO', assetName: 'Nexo Token', qty: 162.22502272 },
        datetimeISO: '2026-02-01T10:00:00.000Z',
    })
    const allMovements: Movement[] = [buyBtcMov, buyUsdtMov, ...swap.sourceMovements, swap.destinationMovement]

    it('ambas fuentes bajan y NEXO sube con la cantidad exacta', () => {
        const btc = computeAverageCost(allMovements.filter(m => m.instrumentId === 'btc'))
        const usdt = computeAverageCost(allMovements.filter(m => m.instrumentId === 'usdt'))
        const nexo = computeAverageCost(allMovements.filter(m => m.instrumentId === 'nexo-token'))

        expect(btc.quantity).toBeCloseTo(0.0172965, 7)
        expect(usdt.quantity).toBeCloseTo(60 - 40.735376, 6)
        expect(nexo.quantity).toBeCloseTo(162.22502272, 6)
    })

    it('NEXO nace con costo = valor BTC + valor USDT', () => {
        const expectedCost = 0.0016077 * btcPriceAtSwap + 40.735376
        const nexo = computeAverageCost(allMovements.filter(m => m.instrumentId === 'nexo-token'))
        expect(nexo.costBasisUsd).toBeCloseTo(expectedCost, 4)
        expect(swap.totalValueUsd).toBeCloseTo(expectedCost, 6)
    })

    it('el PnL realizado sólo proviene del BTC (fuente con costo variable)', () => {
        const pnl = computeRealizedPnL(allMovements, fxRates)
        const expectedBtcPnl = 0.0016077 * (btcPriceAtSwap - 70000)
        expect(pnl.realizedUsd).toBeCloseTo(expectedBtcPnl, 4)
    })

    it('las tres patas comparten grupo único', () => {
        const grouped = groupMovementsByOperation(allMovements)
        expect(grouped.groups).toHaveLength(1)
        expect(grouped.groups[0].kind).toBe('swap')
        expect(grouped.groups[0].legs).toHaveLength(3)
        expect(grouped.singles).toHaveLength(2) // los dos BUY previos
    })

    it('funciona sin precio de mercado de NEXO: cantidad y costo quedan registrados', () => {
        // El destino no necesita cotización: sólo cantidad y costo.
        expect(swap.destinationMovement.quantity).toBeCloseTo(162.22502272, 8)
        expect(swap.destinationMovement.totalUSD).toBeGreaterThan(0)
        expect(swap.destinationMovement.unitPrice).toBeGreaterThan(0)
    })

    it('es cash-neutral exacto y no depende de cancelación flotante', () => {
        const legs = [...swap.sourceMovements, swap.destinationMovement]
        legs[legs.length - 1] = { ...legs[legs.length - 1], totalAmount: swap.totalValueUsd + 0.00000031 }
        const ledger = computeCashLedger(legs)
        expect(ledger.balances.get('nexo')?.get('USD') ?? 0).toBe(0)
        expect(ledger.openingBalances.get('nexo')?.get('USD') ?? 0).toBe(0)
    })
})
