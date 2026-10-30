import { describe, it, expect } from 'vitest'
import { buildDailySeries, buildMonthlySummary, buildRubroSeries, computePeriodChange, findSuspiciousDays } from './history-model'
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

describe('buildMonthlySummary', () => {
    const deposit = (dateISO: string, amount: number): Movement => ({
        id: `dep-${dateISO}`, datetimeISO: dateISO, type: 'DEPOSIT', assetClass: 'wallet', instrumentId: 'ars-cash',
        accountId: 'mp', tradeCurrency: 'ARS', quantity: amount, totalAmount: amount, netAmount: amount,
    })
    const snapshots = [
        snap('2026-08-31', 1_000_000, 700),
        snap('2026-09-10', 1_050_000, 730),
        snap('2026-09-30', 1_250_000, 860),
        snap('2026-10-15', 1_300_000, 880),
    ]

    it('starts each month at the last day of the previous one and nets deposits', () => {
        const months = buildMonthlySummary(snapshots, [deposit('2026-09-20T12:00:00.000Z', 100_000)], fxContext, { ars: 1_320_000, usd: 900, fxMep: 1466 }, now)
        expect(months.map(m => m.monthKey)).toEqual(['2026-10', '2026-09', '2026-08'])
        expect(months[2].comparable).toBe(false)
        const sep = months[1]
        expect(sep.startDateKey).toBe('2026-08-31')
        expect(sep.endDateKey).toBe('2026-09-30')
        expect(sep.deltaArs).toBe(250_000)
        expect(sep.netFlowsArs).toBe(100_000)
        expect(sep.gainArs).toBe(150_000)
        expect(sep.daysRecorded).toBe(2)
        const oct = months[0]
        expect(oct.isCurrent).toBe(true)
        expect(oct.startDateKey).toBe('2026-09-30')
        expect(oct.endArs).toBe(1_320_000)
        expect(oct.gainArs).toBe(70_000)
    })
})

describe('buildMonthlySummary edge cases', () => {
    it('keeps a first month with a single day so it can be opened and deleted', () => {
        const months = buildMonthlySummary([snap('2026-08-10', 1_000_000, 700), snap('2026-09-05', 1_100_000, 760)], [], fxContext, null, now)
        expect(months.map(m => m.monthKey)).toEqual(['2026-09', '2026-08'])
        expect(months[1].comparable).toBe(false)
        expect(months[1].daysRecorded).toBe(1)
        expect(months[0].comparable).toBe(true)
        expect(months[0].startDateKey).toBe('2026-08-10')
    })
})

describe('buildRubroSeries', () => {
    it('groups wallets and frascos as pesos', () => {
        const s = { ...snap('2026-10-01', 300, 0.2), breakdownRubros: { wallets: { ars: 100, usd: 0.07 }, frascos: { ars: 50, usd: 0.03 }, cedears: { ars: 150, usd: 0.1 } } }
        const [point] = buildRubroSeries([s])
        expect(point.values.pesos.ars).toBe(150)
        expect(point.values.cedears.ars).toBe(150)
        expect(point.values.crypto.ars).toBe(0)
    })
})

describe('findSuspiciousDays', () => {
    it('flags a spike that the next day undoes, not a jump that stays', () => {
        const days = [snap('2026-10-01', 1, 1000), snap('2026-10-02', 1, 1600), snap('2026-10-03', 1, 1010), snap('2026-10-04', 1, 1500), snap('2026-10-05', 1, 1510)]
        expect([...findSuspiciousDays(days)]).toEqual(['2026-10-02'])
    })
})
