import { describe, it, expect } from 'vitest'
import { buildDailySeries, computePeriodChange } from './history-model'
import { shouldReplaceDaySnapshot, toSnapshotDateKey, SNAPSHOT_PARTIAL_NOTE } from '@/features/dashboardV2/snapshot-v2'
import type { Movement, Snapshot } from '@/domain/types'

const snap = (dateLocal: string, totalARS: number, totalUSD: number, mep = 1400): Snapshot => ({
    id: `snapshot-v2-${dateLocal}`,
    dateLocal,
    totalARS,
    totalUSD,
    fxUsed: { usdArs: mep, type: 'MEP' },
    source: 'v2',
    meta: { fxRef: `MEP:${mep.toFixed(2)}|OFI:1400.00|CR:1450.00` },
    createdAtISO: `${dateLocal}T15:00:00.000Z`,
})

const fxContext = { officialSell: 1435, mepSell: 1462, cryptoSell: 1495 }
const now = new Date(2026, 9, 30, 12, 0, 0) // 30 oct 2026, local

describe('toSnapshotDateKey', () => {
    it('uses the local calendar day', () => {
        expect(toSnapshotDateKey(new Date(2026, 9, 30, 23, 30))).toBe('2026-10-30')
        expect(toSnapshotDateKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
    })
})

describe('shouldReplaceDaySnapshot', () => {
    const base = { totalARS: 1000, totalUSD: 1, createdAtISO: '2026-10-30T10:00:00.000Z' }

    it('saves when there is nothing for the day', () => {
        expect(shouldReplaceDaySnapshot(undefined, base)).toBe(true)
    })

    it('keeps the latest value of the day, throttled', () => {
        expect(shouldReplaceDaySnapshot(base, { ...base, totalARS: 1200, createdAtISO: '2026-10-30T10:05:00.000Z' })).toBe(false)
        expect(shouldReplaceDaySnapshot(base, { ...base, totalARS: 1200, createdAtISO: '2026-10-30T10:20:00.000Z' })).toBe(true)
        expect(shouldReplaceDaySnapshot(base, { ...base, createdAtISO: '2026-10-30T12:00:00.000Z' })).toBe(false)
    })

    it('never replaces a complete capture with a partial one', () => {
        const partial = { ...base, totalARS: 500, meta: { notes: SNAPSHOT_PARTIAL_NOTE }, createdAtISO: '2026-10-30T13:00:00.000Z' }
        expect(shouldReplaceDaySnapshot(base, partial)).toBe(false)
        expect(shouldReplaceDaySnapshot(partial, { ...base, createdAtISO: '2026-10-30T13:01:00.000Z' })).toBe(true)
    })
})

describe('buildDailySeries', () => {
    it('forward-fills days without snapshot and ends with the live value', () => {
        const series = buildDailySeries(
            [snap('2026-10-26', 1000, 1), snap('2026-10-28', 1100, 1.1)],
            { ars: 1200, usd: 1.2 },
            7,
            now,
        )
        expect(series.map(p => p.dateKey)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
        expect(series.map(p => p.ars)).toEqual([1000, 1000, 1100, 1100, 1200])
        expect(series.map(p => p.filled)).toEqual([false, true, false, true, false])
    })

    it('ignores zero-valued snapshots', () => {
        const series = buildDailySeries([snap('2026-10-29', 0, 0)], { ars: 50, usd: 0.05 }, 7, now)
        expect(series).toEqual([{ dateKey: '2026-10-30', ars: 50, usd: 0.05, fxMep: undefined, filled: false }])
    })
})

describe('computePeriodChange', () => {
    const deposit: Movement = {
        id: 'd1',
        datetimeISO: '2026-10-20T15:00:00.000Z',
        type: 'DEPOSIT',
        assetClass: 'wallet',
        instrumentId: 'ars-cash',
        accountId: 'mp',
        quantity: 100_000,
        unitPrice: 1,
        tradeCurrency: 'ARS',
        totalAmount: 100_000,
        netAmount: 100_000,
        fx: { kind: 'OFICIAL', rate: 1000, side: 'sell', asOf: '2026-10-20T15:00:00.000Z' },
    }

    it('separates new money from the gain', () => {
        const change = computePeriodChange(
            [snap('2026-09-30', 1_000_000, 1000, 1400), snap('2026-10-15', 1_020_000, 1010)],
            [deposit],
            { ars: 1_150_000, usd: 1100, fxMep: 1470 },
            30,
            fxContext,
            now,
        )!
        expect(change.fromDateKey).toBe('2026-09-30')
        expect(change.deltaArs).toBe(150_000)
        expect(change.netFlowsArs).toBe(100_000)
        expect(change.gainArs).toBe(50_000)
        expect(change.gainPctArs).toBeCloseTo(50_000 / 1_100_000, 8)
        expect(change.fxChangePct).toBeCloseTo(1470 / 1400 - 1, 8)
    })

    it('falls back to the oldest snapshot when history is shorter', () => {
        const change = computePeriodChange([snap('2026-10-25', 900, 1)], [], { ars: 1000, usd: 1 }, 30, fxContext, now)!
        expect(change.fromDateKey).toBe('2026-10-25')
        expect(change.days).toBe(5)
    })

    it('returns null without previous history', () => {
        expect(computePeriodChange([], [], { ars: 1000, usd: 1 }, 30, fxContext, now)).toBeNull()
        expect(computePeriodChange([snap('2026-10-30', 900, 1)], [], { ars: 1000, usd: 1 }, 30, fxContext, now)).toBeNull()
    })
})
