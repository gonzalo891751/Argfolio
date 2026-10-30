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
