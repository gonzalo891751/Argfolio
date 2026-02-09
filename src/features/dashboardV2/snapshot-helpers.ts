import type { Snapshot } from '@/domain/types'

export type SnapshotPeriod = '1D' | '7D' | '30D' | '90D' | '1Y' | 'MAX' | 'TOTAL'

const PERIOD_TO_DAYS: Record<Exclude<SnapshotPeriod, 'MAX' | 'TOTAL'>, number> = {
    '1D': 1,
    '7D': 7,
    '30D': 30,
    '90D': 90,
    '1Y': 365,
}

const EPSILON = 1e-9

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10)
}

function subtractDays(date: Date, days: number): Date {
    const next = new Date(date)
    next.setDate(next.getDate() - days)
    return next
}

export function getSnapshotAtOrBefore(
    snapshots: Snapshot[],
    targetDate: Date
): Snapshot | null {
    const targetKey = toDateKey(targetDate)
    let best: Snapshot | null = null

    for (const snapshot of snapshots) {
        if (snapshot.dateLocal > targetKey) continue
        if (!best || snapshot.dateLocal > best.dateLocal) {
            best = snapshot
        }
    }

    return best
}

export function getSnapshotForPeriod(
    snapshots: Snapshot[],
    period: SnapshotPeriod,
    now: Date = new Date()
): Snapshot | null {
    if (snapshots.length === 0) return null

    if (period === 'MAX' || period === 'TOTAL') {
        return [...snapshots].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))[0] ?? null
    }

    const targetDate = subtractDays(now, PERIOD_TO_DAYS[period])
    return getSnapshotAtOrBefore(snapshots, targetDate)
}

export function computeReturns(series: number[]): number[] {
    if (series.length < 2) return []

    const returns: number[] = []
    for (let idx = 1; idx < series.length; idx++) {
        const prev = series[idx - 1]
        const curr = series[idx]
        if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= EPSILON) continue
        returns.push((curr / prev) - 1)
    }

    return returns
}

export interface DriverItemDelta {
    assetKey: string
    rubroId: string
    currentArs: number
    currentUsd: number
    deltaArs: number
    deltaUsd: number
    deltaPct: number | null
}

export interface DriverCategoryDelta {
    rubroId: string
    currentArs: number
    currentUsd: number
    deltaArs: number
    deltaUsd: number
    deltaPct: number | null
    items: DriverItemDelta[]
}

type BreakdownItems = Record<string, { rubroId: string; ars: number; usd: number }>

export function computeDrivers(
    currentBreakdown: BreakdownItems = {},
    pastBreakdown: BreakdownItems = {}
): DriverCategoryDelta[] {
    const allAssetKeys = new Set([
        ...Object.keys(currentBreakdown),
        ...Object.keys(pastBreakdown),
    ])

    const byCategory = new Map<string, {
        currentArs: number
        currentUsd: number
        pastArs: number
        pastUsd: number
        deltaArs: number
        deltaUsd: number
        items: DriverItemDelta[]
    }>()

    for (const assetKey of allAssetKeys) {
        const current = currentBreakdown[assetKey]
        const past = pastBreakdown[assetKey]
        const rubroId = current?.rubroId ?? past?.rubroId ?? 'unknown'

        const currentArs = current?.ars ?? 0
        const currentUsd = current?.usd ?? 0
        const pastArs = past?.ars ?? 0
        const pastUsd = past?.usd ?? 0

        const deltaArs = currentArs - pastArs
        const deltaUsd = currentUsd - pastUsd
        const deltaPct = Math.abs(pastArs) > EPSILON ? (deltaArs / pastArs) : null

        const item: DriverItemDelta = {
            assetKey,
            rubroId,
            currentArs,
            currentUsd,
            deltaArs,
            deltaUsd,
            deltaPct,
        }

        const category = byCategory.get(rubroId) ?? {
            currentArs: 0,
            currentUsd: 0,
            pastArs: 0,
            pastUsd: 0,
            deltaArs: 0,
            deltaUsd: 0,
            items: [],
        }

        category.currentArs += currentArs
        category.currentUsd += currentUsd
        category.pastArs += pastArs
        category.pastUsd += pastUsd
        category.deltaArs += deltaArs
        category.deltaUsd += deltaUsd
        category.items.push(item)

        byCategory.set(rubroId, category)
    }

    return [...byCategory.entries()]
        .map(([rubroId, category]): DriverCategoryDelta => ({
            rubroId,
            currentArs: category.currentArs,
            currentUsd: category.currentUsd,
            deltaArs: category.deltaArs,
            deltaUsd: category.deltaUsd,
            deltaPct: Math.abs(category.pastArs) > EPSILON ? (category.deltaArs / category.pastArs) : null,
            items: category.items.sort((a, b) => Math.abs(b.deltaArs) - Math.abs(a.deltaArs)),
        }))
        .sort((a, b) => Math.abs(b.deltaArs) - Math.abs(a.deltaArs))
}

function mean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function computeAnnualizedVolatility(returns: number[]): number | null {
    if (returns.length < 2) return null
    const avg = mean(returns)
    const variance = mean(returns.map((value) => (value - avg) ** 2))
    if (variance <= EPSILON) return 0
    return Math.sqrt(variance) * Math.sqrt(365)
}

export function computeMaxDrawdown(series: number[]): number | null {
    if (series.length < 2) return null

    let peak = series[0]
    let maxDrawdown = 0

    for (const value of series) {
        if (value > peak) peak = value
        if (peak <= EPSILON) continue
        const drawdown = (value / peak) - 1
        if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown
        }
    }

    return maxDrawdown
}

export function computeSharpeRatio(
    returns: number[],
    riskFreeAnnual = 0
): number | null {
    if (returns.length < 20) return null

    const vol = computeAnnualizedVolatility(returns)
    if (vol === null || vol <= EPSILON) return null

    const rfDaily = riskFreeAnnual / 365
    const avgExcessDaily = mean(returns) - rfDaily
    return (avgExcessDaily / (vol / Math.sqrt(365))) * Math.sqrt(365)
}
