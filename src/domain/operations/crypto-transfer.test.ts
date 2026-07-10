/**
 * Fase 4 — Transferencia cripto entre cuentas propias.
 *
 * Invariantes:
 *  - La transferencia NO es una venta: PnL realizado = 0.
 *  - El costo consolidado del activo no cambia al mover entre cuentas.
 *  - El destino hereda el costo promedio del origen (carry-over PPP).
 *  - Con fee en especie, la diferencia queda visible y el costo se
 *    capitaliza en el destino (base consolidada constante).
 *  - No genera saldos de caja fantasma.
 */

import { describe, it, expect } from 'vitest'
import { buildCryptoTransferMovements, CryptoTransferError } from './crypto-transfer'
import { getOperationId, groupMovementsByOperation } from './operation'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { computeRealizedPnL } from '@/domain/portfolio/computePnL'
import { buildFifoLots } from '@/domain/portfolio/fifo'
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

/** BUY 0.02 BTC @ 70.000 USD en Binance */
function buyBtcBinance(): Movement {
    return {
        id: 'buy-1',
        datetimeISO: '2026-01-10T10:00:00.000Z',
        type: 'BUY',
        assetClass: 'crypto',
        accountId: 'binance',
        instrumentId: 'btc',
        ticker: 'BTC',
        quantity: 0.02,
        unitPrice: 70000,
        tradeCurrency: 'USD',
        totalAmount: 1400,
        totalUSD: 1400,
        fxAtTrade: 1500,
    }
}

describe('buildCryptoTransferMovements — validaciones', () => {
    const base = {
        instrumentId: 'btc',
        symbol: 'BTC',
        fromAccountId: 'binance',
        toAccountId: 'nexo',
        sentQty: 0.01,
        avgCostUsd: 70000,
    }

    it('rechaza cuenta origen = destino', () => {
        expect(() => buildCryptoTransferMovements({ ...base, toAccountId: 'binance' }))
            .toThrowError(CryptoTransferError)
    })

    it('rechaza cantidad <= 0', () => {
        expect(() => buildCryptoTransferMovements({ ...base, sentQty: 0 }))
            .toThrowError(/mayor a cero/)
    })

    it('rechaza recibir más de lo enviado', () => {
        expect(() => buildCryptoTransferMovements({ ...base, receivedQty: 0.02 }))
            .toThrowError(/no puede superar/)
    })

    it('rechaza transferir más que el saldo disponible', () => {
        expect(() => buildCryptoTransferMovements({ ...base, sentQty: 0.05, availableQty: 0.02 }))
            .toThrowError(/Saldo insuficiente/)
    })

    it('permite overdraft sólo con override explícito', () => {
        const result = buildCryptoTransferMovements({
            ...base, sentQty: 0.05, availableQty: 0.02, allowOverdraft: true,
        })
        expect(result.out.quantity).toBe(0.05)
    })
})

describe('Caso 1 — BUY 0.02 BTC @70k, TRANSFER 0.01 Binance → Nexo', () => {
    const buy = buyBtcBinance()
    const transfer = buildCryptoTransferMovements({
        instrumentId: 'btc',
        symbol: 'BTC',
        fromAccountId: 'binance',
        toAccountId: 'nexo',
        sentQty: 0.01,
        avgCostUsd: 70000, // PPP del origen al momento de transferir
        availableQty: 0.02,
        datetimeISO: '2026-02-01T10:00:00.000Z',
        fxRate: 1535,
    })
    const allMovements: Movement[] = [buy, transfer.out, transfer.in]

    it('Binance queda con 0.01 BTC y base 700 USD', () => {
        const binanceMovs = allMovements.filter(m => m.accountId === 'binance')
        const pos = computeAverageCost(binanceMovs)
        expect(pos.quantity).toBeCloseTo(0.01, 9)
        expect(pos.costBasisUsd).toBeCloseTo(700, 6)
    })

    it('Nexo queda con 0.01 BTC y base 700 USD (costo heredado)', () => {
        const nexoMovs = allMovements.filter(m => m.accountId === 'nexo')
        const pos = computeAverageCost(nexoMovs)
        expect(pos.quantity).toBeCloseTo(0.01, 9)
        expect(pos.costBasisUsd).toBeCloseTo(700, 6)
        expect(pos.avgCostUsd).toBeCloseTo(70000, 6)
    })

    it('el total consolidado sigue siendo 0.02 BTC con costo 1400 USD', () => {
        const binance = computeAverageCost(allMovements.filter(m => m.accountId === 'binance'))
        const nexo = computeAverageCost(allMovements.filter(m => m.accountId === 'nexo'))
        expect(binance.quantity + nexo.quantity).toBeCloseTo(0.02, 9)
        expect(binance.costBasisUsd + nexo.costBasisUsd).toBeCloseTo(1400, 6)
    })

    it('la transferencia NO genera PnL realizado', () => {
        const pnl = computeRealizedPnL(allMovements, fxRates)
        expect(pnl.realizedUsd).toBe(0)
        expect(pnl.realizedArs).toBe(0)
    })

    it('las dos patas comparten operationId y se agrupan', () => {
        expect(getOperationId(transfer.out)).toBe(transfer.operationId)
        expect(getOperationId(transfer.in)).toBe(transfer.operationId)

        const grouped = groupMovementsByOperation(allMovements)
        expect(grouped.groups).toHaveLength(1)
        expect(grouped.groups[0].kind).toBe('transfer')
        expect(grouped.groups[0].legs).toHaveLength(2)
        expect(grouped.singles).toHaveLength(1) // el BUY original
    })

    it('no genera movimientos de caja fantasma', () => {
        const ledger = computeCashLedger(allMovements)
        // El BUY debita 1400 USD de caja Binance (comportamiento existente),
        // pero la transferencia en especie no debe tocar caja.
        const binanceUsd = ledger.balances.get('binance')?.get('USD') ?? 0
        const nexoUsd = ledger.balances.get('nexo')?.get('USD') ?? 0
        expect(nexoUsd).toBe(0)
        // Con el saldo inicial inferido el neto de Binance es el débito del BUY
        // más el opening: el punto clave es que la transferencia no acredita
        // ni debita USD adicionales en ninguna cuenta.
        const binanceOpening = ledger.openingBalances.get('binance')?.get('USD') ?? 0
        expect(binanceUsd - binanceOpening).toBeCloseTo(-1400, 6)
    })

    it('FIFO: el destino nace con un lote al costo transferido', () => {
        const nexoFifo = buildFifoLots(allMovements.filter(m => m.accountId === 'nexo'))
        expect(nexoFifo.lots).toHaveLength(1)
        expect(nexoFifo.lots[0].quantity).toBeCloseTo(0.01, 9)
        expect(nexoFifo.lots[0].unitCostUsd).toBeCloseTo(70000, 6)
        expect(nexoFifo.totalCostUsd).toBeCloseTo(700, 6)
    })
})

describe('Caso 2 — TRANSFER 0.01 BTC, recibe 0.0099, fee 0.0001', () => {
    const buy = buyBtcBinance()
    const transfer = buildCryptoTransferMovements({
        instrumentId: 'btc',
        symbol: 'BTC',
        fromAccountId: 'binance',
        toAccountId: 'nexo',
        sentQty: 0.01,
        receivedQty: 0.0099,
        avgCostUsd: 70000,
        availableQty: 0.02,
        datetimeISO: '2026-02-01T10:00:00.000Z',
    })
    const allMovements: Movement[] = [buy, transfer.out, transfer.in, ...(transfer.fee ? [transfer.fee] : [])]

    it('la diferencia queda registrada como fee explícito', () => {
        expect(transfer.feeQty).toBeCloseTo(0.0001, 9)
        expect(transfer.fee).toBeDefined()
        expect(transfer.fee!.type).toBe('FEE')
        expect(transfer.fee!.quantity).toBeCloseTo(0.0001, 9)
        expect(transfer.fee!.meta?.legRole).toBe('fee')
        expect(getOperationId(transfer.fee!)).toBe(transfer.operationId)
    })

    it('el destino recibe 0.0099 BTC con el costo total capitalizado (700 USD)', () => {
        const nexo = computeAverageCost(allMovements.filter(m => m.accountId === 'nexo'))
        expect(nexo.quantity).toBeCloseTo(0.0099, 9)
        // Costo total transferido se conserva: fee capitalizado en el promedio
        expect(nexo.costBasisUsd).toBeCloseTo(700, 6)
        expect(nexo.avgCostUsd).toBeCloseTo(700 / 0.0099, 4)
    })

    it('el costo consolidado no cambia (1400 USD) aunque la cantidad baja por el fee', () => {
        const binance = computeAverageCost(allMovements.filter(m => m.accountId === 'binance'))
        const nexo = computeAverageCost(allMovements.filter(m => m.accountId === 'nexo'))
        expect(binance.costBasisUsd + nexo.costBasisUsd).toBeCloseTo(1400, 6)
        expect(binance.quantity + nexo.quantity).toBeCloseTo(0.0199, 9)
    })

    it('no hay venta ficticia ni PnL realizado', () => {
        const pnl = computeRealizedPnL(allMovements, fxRates)
        expect(pnl.realizedUsd).toBe(0)
        expect(pnl.realizedArs).toBe(0)
    })

    it('las tres patas (out/in/fee) se agrupan como una operación', () => {
        const grouped = groupMovementsByOperation(allMovements)
        expect(grouped.groups).toHaveLength(1)
        expect(grouped.groups[0].legs).toHaveLength(3)
        expect(grouped.groups[0].kind).toBe('transfer')
    })
})
