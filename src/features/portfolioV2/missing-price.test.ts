/**
 * Fase 1 — "Sin precio" seguro en Portfolio V2.
 *
 * Un activo cripto sin cotización (ej: NEXO no mapeado o proveedor caído):
 *  - conserva cantidad y costo;
 *  - NO se valúa en US$ 0;
 *  - NO muestra pérdida -100% (pnl = undefined, no -costo);
 *  - no suma valor fantasma a los totales del provider/rubro.
 */

import { describe, it, expect } from 'vitest'
import { buildRubros } from './builder'
import type { FxRatesSnapshot } from './types'
import type { Account } from '@/domain/types'
import type { AssetRowMetrics } from '@/domain/assets/types'

const fxSnapshot: FxRatesSnapshot = {
    officialSell: 1080,
    officialBuy: 1060,
    mepSell: 1485,
    mepBuy: 1470,
    cclSell: 1490,
    cclBuy: 1475,
    cryptoSell: 1535,
    cryptoBuy: 1520,
    updatedAtISO: '2026-07-09T12:00:00.000Z',
}

const nexoAccount: Account = {
    id: 'nexo',
    name: 'Nexo',
    kind: 'EXCHANGE',
    defaultCurrency: 'USD',
}

function baseMetrics(partial: Partial<AssetRowMetrics>): AssetRowMetrics {
    return {
        instrumentId: 'x',
        symbol: 'X',
        name: 'X',
        category: 'CRYPTO',
        quantity: 0,
        valArs: null,
        valUsdEq: null,
        costArs: null,
        costUsdEq: null,
        pnlArs: null,
        pnlPct: null,
        pnlUsdEq: null,
        roiPct: null,
        fxKeyUsed: 'cripto',
        fxUsedLabel: 'Cripto',
        fxRate: 1535,
        currentPrice: null,
        avgCost: null,
        investedArs: null,
        nativeCurrency: 'USD',
        accountId: 'nexo',
        accountName: 'Nexo',
        ...partial,
    }
}

describe('buildRubros — activo cripto sin precio', () => {
    const nexoNoPrice = baseMetrics({
        instrumentId: 'nexo-token',
        symbol: 'NEXO',
        name: 'Nexo Token',
        quantity: 162.22502272,
        costArs: 250000,
        costUsdEq: 180,
        priceResult: { price: null, status: 'missing', source: 'missing', asOf: null },
    })

    const btcWithPrice = baseMetrics({
        instrumentId: 'btc',
        symbol: 'BTC',
        name: 'Bitcoin',
        quantity: 0.01,
        valArs: 700 * 1535,
        valUsdEq: 700,
        costArs: 650 * 1535,
        costUsdEq: 650,
        currentPrice: 70000,
        priceResult: { price: 70000, status: 'ok', source: 'coingecko', asOf: null },
    })

    const groupedRows = {
        nexo: {
            accountName: 'Nexo',
            metrics: [nexoNoPrice, btcWithPrice],
            totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
        },
    }

    it('conserva la fila con cantidad, marca valueMissing y no genera pérdida falsa', () => {
        const rubros = buildRubros(groupedRows, [nexoAccount], undefined, fxSnapshot)
        const crypto = rubros.find(r => r.id === 'crypto')
        expect(crypto).toBeDefined()

        const provider = crypto!.providers.find(p => p.id === 'nexo')
        expect(provider).toBeDefined()

        const nexoItem = provider!.items.find(it => it.symbol === 'NEXO')
        expect(nexoItem).toBeDefined()

        // Cantidad y estado de precio conservados
        expect(nexoItem!.qty).toBeCloseTo(162.22502272, 6)
        expect(nexoItem!.valueMissing).toBe(true)
        expect(nexoItem!.priceResult?.status).toBe('missing')

        // Sin pérdida falsa: pnl indefinido, no -costo / -100%
        expect(nexoItem!.pnlArs).toBeUndefined()
        expect(nexoItem!.pnlUsd).toBeUndefined()
        expect(nexoItem!.pnlPct).toBeUndefined()

        // Valor neutro (no se suma como si fuera una valuación real)
        expect(nexoItem!.valUsd).toBe(0)
        expect(nexoItem!.valArs).toBe(0)
    })

    it('no contamina los totales del provider con pérdidas fantasma', () => {
        const rubros = buildRubros(groupedRows, [nexoAccount], undefined, fxSnapshot)
        const provider = rubros.find(r => r.id === 'crypto')!.providers.find(p => p.id === 'nexo')!

        // Los totales reflejan solo BTC (el único valuado)
        expect(provider.totals.usd).toBeCloseTo(700, 0)
        // El PnL del provider es el de BTC (+50 USD), NO -180 (falso -100% de NEXO)
        expect(provider.pnl.usd).toBeCloseTo(50, 0)
    })

    it('un activo con precio manual (estimated) sí se valúa y conserva la fuente', () => {
        const nexoManual = baseMetrics({
            instrumentId: 'nexo-token',
            symbol: 'NEXO',
            name: 'Nexo Token',
            quantity: 100,
            valArs: 131 * 1535,
            valUsdEq: 131,
            costArs: 100 * 1535,
            costUsdEq: 100,
            currentPrice: 1.31,
            priceResult: {
                price: 1.31,
                status: 'estimated',
                source: 'manual',
                asOf: '2026-07-01T12:00:00.000Z',
                confidence: 'medium',
            },
        })

        const rows = {
            nexo: {
                accountName: 'Nexo',
                metrics: [nexoManual],
                totals: { valArs: 0, valUsd: 0, pnlArs: 0, pnlUsd: 0 },
            },
        }

        const rubros = buildRubros(rows, [nexoAccount], undefined, fxSnapshot)
        const item = rubros.find(r => r.id === 'crypto')!.providers[0].items[0]

        expect(item.valueMissing).toBeUndefined()
        expect(item.valUsd).toBeCloseTo(131, 0)
        expect(item.pnlUsd).toBeCloseTo(31, 0)
        expect(item.priceResult?.source).toBe('manual')
        expect(item.priceResult?.status).toBe('estimated')
    })
})
