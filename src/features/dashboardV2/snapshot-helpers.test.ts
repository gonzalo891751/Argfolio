import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@/domain/types'
import {
    computeDrivers,
    getSnapshotAtOrBefore,
    getSnapshotForPeriod,
    type SnapshotPeriod,
} from './snapshot-helpers'

function makeSnapshot(dateLocal: string, totalARS: number): Snapshot {
    return {
        id: `snapshot-${dateLocal}`,
        dateLocal,
        totalARS,
        totalUSD: totalARS / 1000,
        fxUsed: { usdArs: 1000, type: 'MEP' },
        source: 'v2',
        createdAtISO: `${dateLocal}T12:00:00.000Z`,
    }
}

describe('getSnapshotAtOrBefore', () => {
    const snapshots = [
        makeSnapshot('2026-02-01', 1000),
        makeSnapshot('2026-02-03', 1100),
        makeSnapshot('2026-02-06', 1200),
    ]

    it('returns nearest snapshot at or before a target date with holes', () => {
        const snapshot = getSnapshotAtOrBefore(snapshots, new Date('2026-02-05T10:00:00.000Z'))
        expect(snapshot?.dateLocal).toBe('2026-02-03')
    })

    it('returns null when no snapshot exists before target', () => {
        const snapshot = getSnapshotAtOrBefore(snapshots, new Date('2026-01-15T10:00:00.000Z'))
        expect(snapshot).toBeNull()
    })
})

describe('getSnapshotForPeriod', () => {
    const snapshots = [
        makeSnapshot('2026-01-01', 1000),
        makeSnapshot('2026-01-15', 1200),
        makeSnapshot('2026-02-05', 1400),
    ]

    it('returns oldest snapshot for TOTAL and MAX', () => {
        const now = new Date('2026-02-09T00:00:00.000Z')
        const total = getSnapshotForPeriod(snapshots, 'TOTAL', now)
        const max = getSnapshotForPeriod(snapshots, 'MAX', now)
        expect(total?.dateLocal).toBe('2026-01-01')
        expect(max?.dateLocal).toBe('2026-01-01')
    })

    it('returns period baseline for day-based ranges', () => {
        const now = new Date('2026-02-09T00:00:00.000Z')
        const periods: SnapshotPeriod[] = ['1D', '7D', '30D', '90D', '1Y']
        const results = periods.map((period) => getSnapshotForPeriod(snapshots, period, now))
        expect(results[0]?.dateLocal).toBe('2026-02-05')
        expect(results[1]?.dateLocal).toBe('2026-01-15')
    })
})

describe('computeDrivers', () => {
    it('handles positive-only deltas', () => {
        const drivers = computeDrivers(
            {
                'cedear:iol:SPY': { rubroId: 'cedears', ars: 120, usd: 0.12 },
            },
            {
                'cedear:iol:SPY': { rubroId: 'cedears', ars: 100, usd: 0.1 },
            }
        )

        expect(drivers).toHaveLength(1)
        expect(drivers[0].deltaArs).toBe(20)
        expect(drivers[0].items[0].deltaArs).toBe(20)
    })

    it('handles negative-only deltas', () => {
        const drivers = computeDrivers(
            {
                'crypto:binance:BTC': { rubroId: 'crypto', ars: 80, usd: 0.08 },
            },
            {
                'crypto:binance:BTC': { rubroId: 'crypto', ars: 100, usd: 0.1 },
            }
        )

        expect(drivers).toHaveLength(1)
        expect(drivers[0].deltaArs).toBe(-20)
        expect(drivers[0].items[0].deltaArs).toBe(-20)
    })

    it('handles mixed deltas and groups by rubro', () => {
        const drivers = computeDrivers(
            {
                'cedear:iol:SPY': { rubroId: 'cedears', ars: 140, usd: 0.14 },
                'cedear:iol:AAPL': { rubroId: 'cedears', ars: 90, usd: 0.09 },
                'wallet:carrefour:ARS': { rubroId: 'wallets', ars: 50, usd: 0.05 },
            },
            {
                'cedear:iol:SPY': { rubroId: 'cedears', ars: 100, usd: 0.1 },
                'cedear:iol:AAPL': { rubroId: 'cedears', ars: 110, usd: 0.11 },
                'wallet:carrefour:ARS': { rubroId: 'wallets', ars: 80, usd: 0.08 },
            }
        )

        const cedears = drivers.find((row) => row.rubroId === 'cedears')
        const wallets = drivers.find((row) => row.rubroId === 'wallets')

        expect(cedears?.deltaArs).toBe(20)
        expect(cedears?.items).toHaveLength(2)
        expect(wallets?.deltaArs).toBe(-30)
    })
})
