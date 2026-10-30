/**
 * History model — daily evolution of the patrimonio from snapshots.
 *
 * Snapshots exist only for days the app was opened, so the series is
 * forward-filled for the chart, and period comparisons use the closest
 * snapshot on or before the target day (and say which day that was).
 * Deposits and withdrawals in the period are reported apart, so new money is
 * not mistaken for a gain.
 */

import type { Movement, Snapshot } from '@/domain/types'
import { computeNetFlowsByRubro, type ResultsFlowFxContext } from '@/features/dashboardV2/results-flows'
import { isPartialSnapshot, toSnapshotDateKey } from '@/features/dashboardV2/snapshot-v2'

export interface HistoryPoint {
    dateKey: string
    ars: number
    usd: number
    /** Dollar (MEP) of that day, when known */
    fxMep?: number
    /** No snapshot that day: value carried from the previous day */
    filled: boolean
}

export interface PeriodChange {
    /** Day of the snapshot used as the starting point */
    fromDateKey: string
    days: number
    startArs: number
    startUsd: number
    deltaArs: number
    deltaUsd: number
    /** Deposits minus withdrawals in the period */
    netFlowsArs: number
    netFlowsUsd: number
    /** Change without the money you added or took out */
    gainArs: number
    gainUsd: number
    gainPctArs: number | null
    gainPctUsd: number | null
    fxStart?: number
    fxEnd?: number
    /** Variation of the dollar (MEP) in the period, e.g. 0.044 = +4,4% */
    fxChangePct: number | null
}

function parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
}

/** One usable snapshot per day; partial captures only when nothing better exists. */
export function usableSnapshots(snapshots: Snapshot[]): Snapshot[] {
    return [...snapshots]
        .filter(s => Number.isFinite(s.totalARS) && s.totalARS > 0)
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
}

export function snapshotFxMep(snapshot: Snapshot): number | undefined {
    const ref = snapshot.meta?.fxRef
    const match = ref?.match(/MEP:([\d.]+)/)
    if (match) {
        const value = Number(match[1])
        if (Number.isFinite(value) && value > 0) return value
    }
    if (snapshot.fxUsed?.type === 'MEP' && snapshot.fxUsed.usdArs > 0) return snapshot.fxUsed.usdArs
    return undefined
}

/**
 * Daily series from `fromKey` to today, ending with the live value.
 * Days without a snapshot repeat the last known value (flagged `filled`).
 */
export function buildDailySeries(
    snapshots: Snapshot[],
    current: { ars: number; usd: number; fxMep?: number } | null,
    days: number | 'all',
    now: Date = new Date(),
): HistoryPoint[] {
    const usable = usableSnapshots(snapshots)
    const todayKey = toSnapshotDateKey(now)
    const byDay = new Map(usable.map(s => [s.dateLocal, s]))

    const firstKey = usable[0]?.dateLocal
    let startKey: string
    if (days === 'all') {
        startKey = firstKey ?? todayKey
    } else {
        startKey = toSnapshotDateKey(addDays(now, -days))
        if (firstKey && firstKey > startKey) startKey = firstKey
    }

    // Seed with the last snapshot before the window so the line starts filled.
    let last: HistoryPoint | null = null
    for (const s of usable) {
        if (s.dateLocal >= startKey) break
        last = { dateKey: s.dateLocal, ars: s.totalARS, usd: s.totalUSD, fxMep: snapshotFxMep(s), filled: true }
    }

    const points: HistoryPoint[] = []
    for (let d = parseDateKey(startKey); toSnapshotDateKey(d) <= todayKey; d = addDays(d, 1)) {
        const key = toSnapshotDateKey(d)
        if (key === todayKey && current && current.ars > 0) {
            points.push({ dateKey: key, ars: current.ars, usd: current.usd, fxMep: current.fxMep, filled: false })
            continue
        }
        const snap = byDay.get(key)
        if (snap) {
            last = { dateKey: key, ars: snap.totalARS, usd: snap.totalUSD, fxMep: snapshotFxMep(snap), filled: false }
            points.push(last)
        } else if (last) {
            points.push({ ...last, dateKey: key, filled: true })
        }
    }
    return points
}

/**
 * How the patrimonio changed in the last `days` days, net of deposits and
 * withdrawals. Null when there is no snapshot old enough.
 */
export function computePeriodChange(
    snapshots: Snapshot[],
    movements: Movement[],
    current: { ars: number; usd: number; fxMep?: number },
    days: number,
    fxContext: ResultsFlowFxContext,
    now: Date = new Date(),
): PeriodChange | null {
    const usable = usableSnapshots(snapshots)
    if (usable.length === 0 || !(current.ars > 0)) return null

    const targetKey = toSnapshotDateKey(addDays(now, -days))
    const todayKey = toSnapshotDateKey(now)
    let base: Snapshot | null = null
    for (const s of usable) {
        if (s.dateLocal > targetKey) break
        base = s
    }
    // Not enough history: fall back to the oldest snapshot before today.
    if (!base) {
        const oldest = usable[0]
        if (!oldest || oldest.dateLocal >= todayKey) return null
        base = oldest
    }

    const flows = computeNetFlowsByRubro(movements, fxContext, base.dateLocal, todayKey)
    let netFlowsArs = 0
    let netFlowsUsd = 0
    for (const value of flows.values()) {
        netFlowsArs += value.ars
        netFlowsUsd += value.usdEq
    }

    const deltaArs = current.ars - base.totalARS
    const deltaUsd = current.usd - base.totalUSD
    const gainArs = deltaArs - netFlowsArs
    const gainUsd = deltaUsd - netFlowsUsd
    // Return over the money that was there at the start plus what came in.
    const investedArs = base.totalARS + Math.max(0, netFlowsArs)
    const investedUsd = base.totalUSD + Math.max(0, netFlowsUsd)

    const fxStart = snapshotFxMep(base)
    const fxEnd = current.fxMep
    const actualDays = Math.max(1, Math.round((parseDateKey(todayKey).getTime() - parseDateKey(base.dateLocal).getTime()) / 86_400_000))

    return {
        fromDateKey: base.dateLocal,
        days: actualDays,
        startArs: base.totalARS,
        startUsd: base.totalUSD,
        deltaArs,
        deltaUsd,
        netFlowsArs,
        netFlowsUsd,
        gainArs,
        gainUsd,
        gainPctArs: investedArs > 0 ? gainArs / investedArs : null,
        gainPctUsd: investedUsd > 0 ? gainUsd / investedUsd : null,
        fxStart,
        fxEnd,
        fxChangePct: fxStart && fxEnd ? fxEnd / fxStart - 1 : null,
    }
}

export { isPartialSnapshot }

// ---------------------------------------------------------------------------
// Month by month
// ---------------------------------------------------------------------------

export interface MonthSummary {
    /** 'YYYY-MM' */
    monthKey: string
    /** Last day of the previous month when recorded, else the first day of this one */
    startDateKey: string
    endDateKey: string
    startArs: number
    startUsd: number
    endArs: number
    endUsd: number
    deltaArs: number
    deltaUsd: number
    netFlowsArs: number
    netFlowsUsd: number
    gainArs: number
    gainUsd: number
    gainPctArs: number | null
    gainPctUsd: number | null
    fxStart?: number
    fxEnd?: number
    daysRecorded: number
    /** Current month ends with the live value */
    isCurrent: boolean
}

/**
 * One row per month with snapshots, newest first: how the patrimonio moved in
 * the month, net of the money you added or took out.
 */
export function buildMonthlySummary(
    snapshots: Snapshot[],
    movements: Movement[],
    fxContext: ResultsFlowFxContext,
    current: { ars: number; usd: number; fxMep?: number } | null,
    now: Date = new Date(),
): MonthSummary[] {
    const usable = usableSnapshots(snapshots)
    const todayKey = toSnapshotDateKey(now)
    const currentMonth = todayKey.slice(0, 7)

    const byMonth = new Map<string, Snapshot[]>()
    for (const s of usable) {
        const key = s.dateLocal.slice(0, 7)
        const list = byMonth.get(key) ?? []
        list.push(s)
        byMonth.set(key, list)
    }
    if (current && current.ars > 0 && !byMonth.has(currentMonth) && usable.length > 0) byMonth.set(currentMonth, [])

    const months = [...byMonth.keys()].sort()
    const out: MonthSummary[] = []
    let previousLast: Snapshot | null = null

    for (const monthKey of months) {
        const days = byMonth.get(monthKey) ?? []
        const isCurrent = monthKey === currentMonth && Boolean(current && current.ars > 0)
        const start = previousLast ?? days[0]
        const last = days[days.length - 1]
        if (days.length > 0) previousLast = last
        if (!start) continue

        const end = isCurrent
            ? { dateKey: todayKey, ars: current!.ars, usd: current!.usd, fxMep: current!.fxMep }
            : { dateKey: last.dateLocal, ars: last.totalARS, usd: last.totalUSD, fxMep: snapshotFxMep(last) }
        if (end.dateKey <= start.dateLocal) {
            // A single recorded day and nothing after it: no movement to show yet
            if (!isCurrent) continue
        }

        const flows = computeNetFlowsByRubro(movements, fxContext, start.dateLocal, end.dateKey)
        let netFlowsArs = 0
        let netFlowsUsd = 0
        for (const value of flows.values()) {
            netFlowsArs += value.ars
            netFlowsUsd += value.usdEq
        }
        const deltaArs = end.ars - start.totalARS
        const deltaUsd = end.usd - start.totalUSD
        const gainArs = deltaArs - netFlowsArs
        const gainUsd = deltaUsd - netFlowsUsd
        const investedArs = start.totalARS + Math.max(0, netFlowsArs)
        const investedUsd = start.totalUSD + Math.max(0, netFlowsUsd)

        out.push({
            monthKey,
            startDateKey: start.dateLocal,
            endDateKey: end.dateKey,
            startArs: start.totalARS,
            startUsd: start.totalUSD,
            endArs: end.ars,
            endUsd: end.usd,
            deltaArs,
            deltaUsd,
            netFlowsArs,
            netFlowsUsd,
            gainArs,
            gainUsd,
            gainPctArs: investedArs > 0 ? gainArs / investedArs : null,
            gainPctUsd: investedUsd > 0 ? gainUsd / investedUsd : null,
            fxStart: snapshotFxMep(start),
            fxEnd: end.fxMep,
            daysRecorded: days.length,
            isCurrent,
        })
    }
    return out.reverse()
}

// ---------------------------------------------------------------------------
// By type of investment
// ---------------------------------------------------------------------------

export type HistoryRubro = 'pesos' | 'plazos' | 'fci' | 'cedears' | 'crypto'

export const HISTORY_RUBRO_LABELS: Record<HistoryRubro, string> = {
    pesos: 'Billeteras y frascos',
    plazos: 'Plazos fijos',
    fci: 'Fondos (FCI)',
    cedears: 'CEDEARs',
    crypto: 'Cripto y dólares',
}

const RUBRO_TO_HISTORY: Record<string, HistoryRubro> = {
    wallets: 'pesos',
    frascos: 'pesos',
    plazos: 'plazos',
    fci: 'fci',
    cedears: 'cedears',
    crypto: 'crypto',
}

export interface RubroPoint {
    dateKey: string
    values: Record<HistoryRubro, { ars: number; usd: number }>
}

/** Recorded days (not filled) with their value per type of investment. */
export function buildRubroSeries(snapshots: Snapshot[], fromKey?: string): RubroPoint[] {
    return usableSnapshots(snapshots)
        .filter(s => s.breakdownRubros && (!fromKey || s.dateLocal >= fromKey))
        .map(s => {
            const values = Object.fromEntries(
                (Object.keys(HISTORY_RUBRO_LABELS) as HistoryRubro[]).map(k => [k, { ars: 0, usd: 0 }]),
            ) as RubroPoint['values']
            for (const [rubro, value] of Object.entries(s.breakdownRubros ?? {})) {
                const target = values[RUBRO_TO_HISTORY[rubro] ?? 'pesos']
                target.ars += Number.isFinite(value.ars) ? value.ars : 0
                target.usd += Number.isFinite(value.usd) ? value.usd : 0
            }
            return { dateKey: s.dateLocal, values }
        })
}

/**
 * Recorded days that look like a bad capture: the total (in dollars) is more
 * than `threshold` away from both neighbours while the neighbours agree with
 * each other. A jump that stays (a deposit, a correction) is left alone.
 */
export function findSuspiciousDays(snapshots: Snapshot[], threshold = 0.15): Set<string> {
    const usable = usableSnapshots(snapshots).filter(s => s.totalUSD > 0)
    const out = new Set<string>()
    let prev = usable[0]
    for (let i = 1; i < usable.length - 1; i++) {
        const day = usable[i]
        const next = usable[i + 1]
        const vsPrev = day.totalUSD / prev.totalUSD - 1
        const vsNext = day.totalUSD / next.totalUSD - 1
        const neighbours = next.totalUSD / prev.totalUSD - 1
        if (Math.abs(vsPrev) > threshold && Math.abs(vsNext) > threshold
            && Math.sign(vsPrev) === Math.sign(vsNext) && Math.abs(neighbours) < threshold / 2) {
            out.add(day.dateLocal)
            continue // judge the next day against the last good one
        }
        prev = day
    }
    return out
}
