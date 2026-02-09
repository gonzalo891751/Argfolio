import type { Movement, Snapshot } from '@/domain/types'
import type { PortfolioV2, ItemV2 } from '@/features/portfolioV2'
import { computeDrivers, type DriverCategoryDelta } from './snapshot-helpers'
import { buildSnapshotFromPortfolioV2 } from './snapshot-v2'

export type DashboardRange = '1D' | '7D' | '30D' | '90D' | '1Y' | 'TOTAL'

interface DeltaValue {
    deltaArs: number
    deltaUsd: number
    deltaPct: number | null
}

export interface DeltaMetric {
    value: DeltaValue | null
    status: 'ok' | 'missing_history'
    missingHint?: string
    baselineDateLocal?: string
}

export interface NetIncomeMetric {
    range: DashboardRange
    label: string
    status: 'ok' | 'missing_history'
    missingHint?: string
    baselineDateLocal?: string
    netArs: number
    netUsd: number
    interestArs: number
    interestUsd: number
    feesArs: number
    feesUsd: number
    variationArs: number
    variationUsd: number
    interestEstimated: boolean
}

export interface DriverMetricRow extends DriverCategoryDelta {
    resultArs: number
    resultUsd: number
    resultPct: number | null
    interestArs: number
    variationArs: number
    feesArs: number
}

export interface DriversMetric {
    range: DashboardRange
    label: string
    rows: DriverMetricRow[]
    status: 'ok' | 'missing_history' | 'fallback_cost'
    missingHint?: string
}

export interface DashboardMetrics {
    variation24h: DeltaMetric
    mtd: DeltaMetric
    ytd: DeltaMetric
    netIncome: NetIncomeMetric
    drivers: DriversMetric
}

export interface DashboardMetricsInput {
    portfolio: PortfolioV2
    snapshots: Snapshot[]
    movements: Movement[]
    range: DashboardRange
    now?: Date
    timeZone?: string
}

const RANGE_DAYS: Record<Exclude<DashboardRange, 'TOTAL'>, number> = {
    '1D': 1,
    '7D': 7,
    '30D': 30,
    '90D': 90,
    '1Y': 365,
}

const EPSILON = 1e-9
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

function toDateKeyInTimeZone(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)

    const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
    const month = parts.find((part) => part.type === 'month')?.value ?? '01'
    const day = parts.find((part) => part.type === 'day')?.value ?? '01'
    return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
    const [yearRaw, monthRaw, dayRaw] = dateKey.split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    return {
        year: Number.isFinite(year) ? year : 1970,
        month: Number.isFinite(month) ? month : 1,
        day: Number.isFinite(day) ? day : 1,
    }
}

function toUtcDateFromKey(dateKey: string): Date {
    const { year, month, day } = parseDateKey(dateKey)
    return new Date(Date.UTC(year, month - 1, day))
}

function fromUtcDateToKey(date: Date): string {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function shiftDateKey(dateKey: string, days: number): string {
    const date = toUtcDateFromKey(dateKey)
    date.setUTCDate(date.getUTCDate() + days)
    return fromUtcDateToKey(date)
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
    const from = toUtcDateFromKey(fromKey).getTime()
    const to = toUtcDateFromKey(toKey).getTime()
    const days = Math.floor((to - from) / 86400000)
    return Number.isFinite(days) ? days : 0
}

function normalizeSnapshots(snapshots: Snapshot[]): Snapshot[] {
    return [...snapshots]
        .filter((snapshot) => Boolean(snapshot.dateLocal))
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
}

function getSnapshotAtOrBeforeByKey(
    snapshotsAsc: Snapshot[],
    targetKey: string,
    requireBreakdown: boolean
): Snapshot | null {
    let best: Snapshot | null = null
    for (const snapshot of snapshotsAsc) {
        if (snapshot.dateLocal > targetKey) continue
        if (requireBreakdown && !snapshot.breakdownItems) continue
        if (!best || snapshot.dateLocal > best.dateLocal) {
            best = snapshot
        }
    }
    return best
}

function getSnapshotForRange(
    snapshotsAsc: Snapshot[],
    range: DashboardRange,
    todayKey: string,
    requireBreakdown: boolean
): Snapshot | null {
    if (snapshotsAsc.length === 0) return null

    if (range === 'TOTAL') {
        const oldest = snapshotsAsc.find((snapshot) => !requireBreakdown || Boolean(snapshot.breakdownItems))
        return oldest ?? null
    }

    const targetKey = shiftDateKey(todayKey, -RANGE_DAYS[range])
    return getSnapshotAtOrBeforeByKey(snapshotsAsc, targetKey, requireBreakdown)
}

function toDelta(currentArs: number, currentUsd: number, baseline: Snapshot | null): DeltaValue | null {
    if (!baseline) return null
    const deltaArs = currentArs - baseline.totalARS
    const deltaUsd = currentUsd - baseline.totalUSD
    const deltaPct = Math.abs(baseline.totalARS) > EPSILON ? (deltaArs / baseline.totalARS) : null
    return { deltaArs, deltaUsd, deltaPct }
}

function convertMovementAmountToArsUsd(
    movement: Movement,
    amount: number,
    currency: Movement['tradeCurrency'],
    fallbackRate: number
): { ars: number; usd: number } {
    const safeRate = movement.totalUSD && movement.totalUSD > 0 && movement.totalARS && movement.totalARS > 0
        ? movement.totalARS / movement.totalUSD
        : movement.fx?.rate || movement.fxAtTrade || fallbackRate || 1

    if (currency === 'ARS') {
        return {
            ars: amount,
            usd: safeRate > 0 ? amount / safeRate : 0,
        }
    }

    if (currency === 'USD' || currency === 'USDT' || currency === 'USDC') {
        return {
            usd: amount,
            ars: amount * safeRate,
        }
    }

    return {
        ars: amount,
        usd: safeRate > 0 ? amount / safeRate : 0,
    }
}

function computeDriversFromCurrentPnL(portfolio: PortfolioV2): DriverCategoryDelta[] {
    const byRubro = new Map<string, DriverCategoryDelta>()

    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                const assetKey = `${item.kind}:${item.accountId}:${item.symbol || item.id}`
                const deltaArs = item.pnlArs ?? 0
                const deltaUsd = item.pnlUsd ?? 0
                const costArs = item.valArs - deltaArs

                const driverItem = {
                    assetKey,
                    rubroId: rubro.id,
                    currentArs: item.valArs,
                    currentUsd: item.valUsd,
                    deltaArs,
                    deltaUsd,
                    deltaPct: Math.abs(costArs) > EPSILON ? (deltaArs / costArs) : null,
                }

                const current = byRubro.get(rubro.id) ?? {
                    rubroId: rubro.id,
                    currentArs: 0,
                    currentUsd: 0,
                    deltaArs: 0,
                    deltaUsd: 0,
                    deltaPct: null,
                    items: [],
                }

                current.currentArs += driverItem.currentArs
                current.currentUsd += driverItem.currentUsd
                current.deltaArs += driverItem.deltaArs
                current.deltaUsd += driverItem.deltaUsd
                current.items.push(driverItem)

                byRubro.set(rubro.id, current)
            }
        }
    }

    return [...byRubro.values()]
        .map((row) => {
            const estimatedCost = row.currentArs - row.deltaArs
            return {
                ...row,
                deltaPct: Math.abs(estimatedCost) > EPSILON ? (row.deltaArs / estimatedCost) : null,
                items: row.items.sort((a, b) => Math.abs(b.deltaArs) - Math.abs(a.deltaArs)),
            }
        })
        .sort((a, b) => Math.abs(b.deltaArs) - Math.abs(a.deltaArs))
}

function getMovementDateKey(movement: Movement, timeZone: string): string | null {
    const movementDate = new Date(movement.datetimeISO)
    if (!Number.isFinite(movementDate.getTime())) return null
    return toDateKeyInTimeZone(movementDate, timeZone)
}

function estimateWalletInterestForRange(
    item: ItemV2,
    days: number
): { ars: number; usd: number } {
    const tna = item.yieldMeta?.tna ?? 0
    if (days <= 0 || tna <= 0 || item.valArs <= 0) return { ars: 0, usd: 0 }

    const gainFactor = Math.pow(1 + (tna / 100) / 365, days) - 1
    return {
        ars: item.valArs * gainFactor,
        usd: item.valUsd * gainFactor,
    }
}

function estimatePfAccruedInRange(
    portfolio: PortfolioV2,
    itemId: string,
    startKey: string,
    endKey: string,
    timeZone: string
): number {
    const detail = portfolio.fixedDepositDetails.get(itemId)
    if (!detail || detail.termDays <= 0 || detail.expectedInterestArs <= 0) return 0

    const startDateKey = toDateKeyInTimeZone(new Date(detail.startDateISO), timeZone)

    const accruedAt = (targetKey: string): number => {
        const elapsed = Math.max(0, Math.min(detail.termDays, daysBetweenDateKeys(startDateKey, targetKey)))
        return (detail.expectedInterestArs / detail.termDays) * elapsed
    }

    const accruedStart = accruedAt(startKey)
    const accruedEnd = accruedAt(endKey)
    return Math.max(0, accruedEnd - accruedStart)
}

function buildNetIncome(
    portfolio: PortfolioV2,
    snapshotsAsc: Snapshot[],
    movements: Movement[],
    range: DashboardRange,
    todayKey: string,
    timeZone: string
): {
    metric: NetIncomeMetric
    interestByRubroArs: Map<string, number>
    feesByRubroArs: Map<string, number>
    useEstimatedInterest: boolean
} {
    const baseline = getSnapshotForRange(snapshotsAsc, range, todayKey, false)
    const defaultResult: NetIncomeMetric = {
        range,
        label: range === 'TOTAL' ? 'Total' : range,
        status: 'missing_history',
        missingHint: 'Falta historial: genera snapshots para comparar el periodo.',
        netArs: 0,
        netUsd: 0,
        interestArs: 0,
        interestUsd: 0,
        feesArs: 0,
        feesUsd: 0,
        variationArs: 0,
        variationUsd: 0,
        interestEstimated: false,
    }

    if (!baseline) {
        return {
            metric: defaultResult,
            interestByRubroArs: new Map(),
            feesByRubroArs: new Map(),
            useEstimatedInterest: false,
        }
    }

    const rangeLabel = range === 'TOTAL'
        ? 'Total (desde primer snapshot)'
        : `${range} (desde ${baseline.dateLocal})`

    const netArs = portfolio.kpis.totalArs - baseline.totalARS
    const netUsd = portfolio.kpis.totalUsd - baseline.totalUSD
    const rangeStartKey = baseline.dateLocal
    const rangeDays = Math.max(0, daysBetweenDateKeys(rangeStartKey, todayKey))
    const mepRate = portfolio.fx.mepSell || portfolio.fx.officialSell || 1

    const accountToRubro = new Map<string, string>()
    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            if (!accountToRubro.has(provider.id)) {
                accountToRubro.set(provider.id, rubro.id)
            }
        }
    }

    let realizedInterestArs = 0
    let realizedInterestUsd = 0
    let feesOutArs = 0
    let feesOutUsd = 0
    const realizedInterestByRubroArs = new Map<string, number>()
    const feesByRubroArs = new Map<string, number>()

    for (const movement of movements) {
        const movementDateKey = getMovementDateKey(movement, timeZone)
        if (!movementDateKey || movementDateKey <= rangeStartKey || movementDateKey > todayKey) continue

        const rubroId = accountToRubro.get(movement.accountId) ?? 'unknown'

        if (movement.type === 'INTEREST') {
            const converted = convertMovementAmountToArsUsd(
                movement,
                movement.totalAmount || 0,
                movement.tradeCurrency,
                mepRate
            )
            realizedInterestArs += converted.ars
            realizedInterestUsd += converted.usd
            realizedInterestByRubroArs.set(rubroId, (realizedInterestByRubroArs.get(rubroId) ?? 0) + converted.ars)
        }

        if (movement.type === 'FEE') {
            const converted = convertMovementAmountToArsUsd(
                movement,
                Math.abs(movement.totalAmount || 0),
                movement.tradeCurrency,
                mepRate
            )
            feesOutArs += Math.abs(converted.ars)
            feesOutUsd += Math.abs(converted.usd)
            feesByRubroArs.set(rubroId, (feesByRubroArs.get(rubroId) ?? 0) - Math.abs(converted.ars))
        }

        const feeAmount = movement.fee?.amount ?? movement.feeAmount ?? 0
        const feeCurrency = movement.fee?.currency ?? movement.feeCurrency ?? movement.tradeCurrency
        if (feeAmount > 0) {
            const converted = convertMovementAmountToArsUsd(
                movement,
                feeAmount,
                feeCurrency,
                mepRate
            )
            feesOutArs += Math.abs(converted.ars)
            feesOutUsd += Math.abs(converted.usd)
            feesByRubroArs.set(rubroId, (feesByRubroArs.get(rubroId) ?? 0) - Math.abs(converted.ars))
        }
    }

    const estimatedInterestByRubroArs = new Map<string, number>()
    let estimatedInterestArs = 0
    let estimatedInterestUsd = 0

    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                if (item.kind === 'wallet_yield') {
                    const estimate = estimateWalletInterestForRange(item, rangeDays)
                    estimatedInterestArs += estimate.ars
                    estimatedInterestUsd += estimate.usd
                    estimatedInterestByRubroArs.set(
                        rubro.id,
                        (estimatedInterestByRubroArs.get(rubro.id) ?? 0) + estimate.ars
                    )
                }

                if (item.kind === 'plazo_fijo') {
                    const pfAccrued = estimatePfAccruedInRange(portfolio, item.id, rangeStartKey, todayKey, timeZone)
                    if (pfAccrued <= 0) continue
                    estimatedInterestArs += pfAccrued
                    estimatedInterestUsd += mepRate > 0 ? (pfAccrued / mepRate) : 0
                    estimatedInterestByRubroArs.set(
                        rubro.id,
                        (estimatedInterestByRubroArs.get(rubro.id) ?? 0) + pfAccrued
                    )
                }
            }
        }
    }

    const useEstimatedInterest = estimatedInterestArs > (realizedInterestArs + EPSILON)
    const interestArs = useEstimatedInterest ? estimatedInterestArs : realizedInterestArs
    const interestUsd = useEstimatedInterest ? estimatedInterestUsd : realizedInterestUsd

    const feesArs = -feesOutArs
    const feesUsd = -feesOutUsd
    const variationArs = netArs - interestArs - feesArs
    const variationUsd = netUsd - interestUsd - feesUsd

    return {
        metric: {
            range,
            label: rangeLabel,
            status: 'ok',
            baselineDateLocal: baseline.dateLocal,
            netArs,
            netUsd,
            interestArs,
            interestUsd,
            feesArs,
            feesUsd,
            variationArs,
            variationUsd,
            interestEstimated: useEstimatedInterest,
        },
        interestByRubroArs: useEstimatedInterest ? estimatedInterestByRubroArs : realizedInterestByRubroArs,
        feesByRubroArs,
        useEstimatedInterest,
    }
}

function buildDrivers(
    portfolio: PortfolioV2,
    snapshotsAsc: Snapshot[],
    range: DashboardRange,
    todayKey: string,
    interestByRubroArs: Map<string, number>,
    feesByRubroArs: Map<string, number>
): DriversMetric {
    const currentBreakdown = buildSnapshotFromPortfolioV2(portfolio).breakdownItems ?? {}

    if (range === 'TOTAL') {
        const oldestWithBreakdown = getSnapshotForRange(snapshotsAsc, 'TOTAL', todayKey, true)
        if (oldestWithBreakdown?.breakdownItems) {
            const rows = computeDrivers(currentBreakdown, oldestWithBreakdown.breakdownItems)
                .map((row) => {
                    const interestArs = interestByRubroArs.get(row.rubroId) ?? 0
                    const feesArs = feesByRubroArs.get(row.rubroId) ?? 0
                    const variationArs = row.deltaArs - interestArs - feesArs
                    return {
                        ...row,
                        resultArs: row.deltaArs,
                        resultUsd: row.deltaUsd,
                        resultPct: row.deltaPct,
                        interestArs,
                        variationArs,
                        feesArs,
                    }
                })
            return {
                range,
                label: 'Total (desde primer snapshot)',
                rows,
                status: 'ok',
            }
        }

        const fallbackRows = computeDriversFromCurrentPnL(portfolio).map((row) => {
            const interestArs = interestByRubroArs.get(row.rubroId) ?? 0
            const feesArs = feesByRubroArs.get(row.rubroId) ?? 0
            const variationArs = row.deltaArs - interestArs - feesArs
            return {
                ...row,
                resultArs: row.deltaArs,
                resultUsd: row.deltaUsd,
                resultPct: row.deltaPct,
                interestArs,
                variationArs,
                feesArs,
            }
        })

        return {
            range,
            label: 'Total (desde costo)',
            rows: fallbackRows,
            status: 'fallback_cost',
            missingHint: 'Sin snapshots V2 historicos. Mostrando resultado acumulado desde costo.',
        }
    }

    const baseline = getSnapshotForRange(snapshotsAsc, range, todayKey, true)
    if (!baseline?.breakdownItems) {
        return {
            range,
            label: `${range} (falta snapshot base)`,
            rows: [],
            status: 'missing_history',
            missingHint: 'Falta historial V2 para el rango seleccionado.',
        }
    }

    const rows = computeDrivers(currentBreakdown, baseline.breakdownItems)
        .map((row) => {
            const interestArs = interestByRubroArs.get(row.rubroId) ?? 0
            const feesArs = feesByRubroArs.get(row.rubroId) ?? 0
            const variationArs = row.deltaArs - interestArs - feesArs
            return {
                ...row,
                resultArs: row.deltaArs,
                resultUsd: row.deltaUsd,
                resultPct: row.deltaPct,
                interestArs,
                variationArs,
                feesArs,
            }
        })

    return {
        range,
        label: range,
        rows,
        status: 'ok',
    }
}

export function computeDashboardMetrics({
    portfolio,
    snapshots,
    movements,
    range,
    now = new Date(),
    timeZone = DEFAULT_TZ,
}: DashboardMetricsInput): DashboardMetrics {
    const snapshotsAsc = normalizeSnapshots(snapshots)
    const todayKey = toDateKeyInTimeZone(now, timeZone)
    const currentArs = portfolio.kpis.totalArs
    const currentUsd = portfolio.kpis.totalUsd

    const oneDayBaseline = getSnapshotForRange(snapshotsAsc, '1D', todayKey, false)
    const monthStart = (() => {
        const { year, month } = parseDateKey(todayKey)
        return `${year}-${String(month).padStart(2, '0')}-01`
    })()
    const yearStart = (() => {
        const { year } = parseDateKey(todayKey)
        return `${year}-01-01`
    })()

    const mtdBaseline = getSnapshotAtOrBeforeByKey(snapshotsAsc, monthStart, false)
    const ytdBaseline = getSnapshotAtOrBeforeByKey(snapshotsAsc, yearStart, false)

    const variation24hValue = toDelta(currentArs, currentUsd, oneDayBaseline)
    const mtdValue = toDelta(currentArs, currentUsd, mtdBaseline)
    const ytdValue = toDelta(currentArs, currentUsd, ytdBaseline)

    const netIncomeResult = buildNetIncome(
        portfolio,
        snapshotsAsc,
        movements,
        range,
        todayKey,
        timeZone
    )

    return {
        variation24h: {
            value: variation24hValue,
            status: variation24hValue ? 'ok' : 'missing_history',
            missingHint: variation24hValue ? undefined : 'Falta historial: genera al menos 2 snapshots.',
            baselineDateLocal: oneDayBaseline?.dateLocal,
        },
        mtd: {
            value: mtdValue,
            status: mtdValue ? 'ok' : 'missing_history',
            missingHint: mtdValue ? undefined : 'Falta snapshot base del mes actual.',
            baselineDateLocal: mtdBaseline?.dateLocal,
        },
        ytd: {
            value: ytdValue,
            status: ytdValue ? 'ok' : 'missing_history',
            missingHint: ytdValue ? undefined : 'Falta snapshot base del ano actual.',
            baselineDateLocal: ytdBaseline?.dateLocal,
        },
        netIncome: netIncomeResult.metric,
        drivers: buildDrivers(
            portfolio,
            snapshotsAsc,
            range,
            todayKey,
            netIncomeResult.interestByRubroArs,
            netIncomeResult.feesByRubroArs
        ),
    }
}
