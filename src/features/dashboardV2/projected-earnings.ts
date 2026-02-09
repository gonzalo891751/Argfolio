import type { ItemV2, PortfolioV2, RubroId } from '@/features/portfolioV2'
import { computeYieldMetrics } from '@/domain/yield/accrual'
import { buildSnapshotAssetKey } from './snapshot-v2'

export type HorizonKey = 'HOY' | 'MAN' | '7D' | '30D' | '90D' | '1A'

type RowStatus = 'ok' | 'missing_data'

export interface ProjectedEarningsItemRow {
    assetKey: string
    itemId: string
    symbol: string
    label: string
    kind: ItemV2['kind']
    tenenciaArs: number
    tenenciaUsd: number
    projectedGainArs: number
    projectedGainUsd: number
    pnlNowArs: number
    pnlNowUsd: number
    notes: string[]
    status: RowStatus
}

export interface ProjectedEarningsByRubroRow {
    rubroId: RubroId
    label: string
    tenenciaArs: number
    tenenciaUsd: number
    projectedGainArs: number
    projectedGainUsd: number
    pnlNowArs: number
    pnlNowUsd: number
    notes: string[]
    status: RowStatus
    items: ProjectedEarningsItemRow[]
}

export interface ProjectedEarningsTotals {
    tenenciaArs: number
    tenenciaUsd: number
    projectedGainArs: number
    projectedGainUsd: number
    pnlNowArs: number
    pnlNowUsd: number
}

export interface ProjectedEarningsByRubroResult {
    rows: ProjectedEarningsByRubroRow[]
    totals: ProjectedEarningsTotals
    horizon: HorizonKey
    horizonDays: number
    fxRef: number | null
}

export interface ProjectedEarningsByRubroInput {
    portfolio: PortfolioV2
    now?: Date
    horizon: HorizonKey
}

const RUBRO_LABELS: Record<RubroId, string> = {
    wallets: 'Billeteras',
    frascos: 'Frascos',
    plazos: 'Plazos Fijos',
    cedears: 'CEDEARs',
    crypto: 'Cripto',
    fci: 'Fondos (FCI)',
}

const RUBRO_ORDER: RubroId[] = ['wallets', 'frascos', 'plazos', 'cedears', 'crypto', 'fci']

const HORIZON_DAYS: Record<HorizonKey, number> = {
    HOY: 1,
    MAN: 1,
    '7D': 7,
    '30D': 30,
    '90D': 90,
    '1A': 365,
}

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires'

function toFinite(value: number | null | undefined): number {
    return Number.isFinite(value) ? Number(value) : 0
}

function clampNonNegative(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0
}

function uniqueNotes(notes: string[]): string[] {
    return [...new Set(notes.filter((note) => note.trim().length > 0))]
}

function resolveFxRef(portfolio: PortfolioV2): number | null {
    const fx =
        portfolio.fx.mepSell ||
        portfolio.fx.officialSell ||
        portfolio.fx.mepBuy ||
        portfolio.fx.officialBuy ||
        0
    return fx > 0 ? fx : null
}

function toUsdFromArs(arsAmount: number, fxRef: number | null): number | null {
    if (!Number.isFinite(arsAmount)) return 0
    if (fxRef === null || fxRef <= 0) return null
    return arsAmount / fxRef
}

function resolvePnlNowUsd(item: ItemV2, fxRef: number | null): number {
    const direct = item.pnlUsd
    if (Number.isFinite(direct)) return toFinite(direct)
    const converted = toUsdFromArs(toFinite(item.pnlArs), fxRef)
    return converted === null ? 0 : converted
}

function resolveTenenciaUsd(item: ItemV2, fxRef: number | null): number {
    if (Number.isFinite(item.valUsd)) return toFinite(item.valUsd)
    const converted = toUsdFromArs(toFinite(item.valArs), fxRef)
    return converted === null ? 0 : converted
}

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

function parseDateKey(dateKey: string): Date {
    const [yearRaw, monthRaw, dayRaw] = dateKey.split('-')
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    return new Date(
        Date.UTC(
            Number.isFinite(year) ? year : 1970,
            (Number.isFinite(month) ? month : 1) - 1,
            Number.isFinite(day) ? day : 1
        )
    )
}

function daysBetweenDateKeys(fromKey: string, toKey: string): number {
    const from = parseDateKey(fromKey).getTime()
    const to = parseDateKey(toKey).getTime()
    const raw = Math.floor((to - from) / 86400000)
    return Number.isFinite(raw) ? raw : 0
}

function resolveDaysRemainingFromDetail(
    detail: PortfolioV2['fixedDepositDetails'] extends Map<string, infer D> ? D : never,
    now: Date,
    timeZone: string
): number {
    if (Number.isFinite(detail.daysRemaining) && detail.daysRemaining > 0) {
        return Math.floor(detail.daysRemaining)
    }
    const todayKey = toDateKeyInTimeZone(now, timeZone)
    const maturityKey = toDateKeyInTimeZone(new Date(detail.maturityDateISO), timeZone)
    return clampNonNegative(daysBetweenDateKeys(todayKey, maturityKey))
}

function estimateWalletProjectedGainArs(balanceArs: number, tna: number, horizonDays: number): number {
    const safeBalance = toFinite(balanceArs)
    const safeTna = toFinite(tna)
    if (safeBalance <= 0 || safeTna <= 0 || horizonDays <= 0) return 0

    const metrics = computeYieldMetrics(safeBalance, safeTna)
    if (horizonDays === 1) return clampNonNegative(metrics.interestTomorrow)
    if (horizonDays === 30) return clampNonNegative(metrics.proj30d)
    if (horizonDays === 365) return clampNonNegative(metrics.proj1y)
    return clampNonNegative(safeBalance * (Math.pow(1 + metrics.dailyRate, horizonDays) - 1))
}

function estimatePfProjectedGainArs(
    detail: PortfolioV2['fixedDepositDetails'] extends Map<string, infer D> ? D : never,
    horizonDays: number,
    now: Date,
    timeZone: string
): number {
    if (detail.status !== 'active') return 0

    const expectedInterestArs = toFinite(detail.expectedInterestArs)
    const termDays = Math.floor(toFinite(detail.termDays))
    const daysRemaining = resolveDaysRemainingFromDetail(detail, now, timeZone)
    if (expectedInterestArs <= 0 || termDays <= 0 || daysRemaining <= 0) return 0

    const accruedDays = Math.min(horizonDays, daysRemaining)
    return clampNonNegative(expectedInterestArs * (accruedDays / termDays))
}

function buildProjectedItem(
    portfolio: PortfolioV2,
    rubroId: RubroId,
    item: ItemV2,
    horizonDays: number,
    fxRef: number | null,
    now: Date,
    timeZone: string
): ProjectedEarningsItemRow {
    const notes: string[] = []
    let status: RowStatus = 'ok'

    const tenenciaArs = toFinite(item.valArs)
    const tenenciaUsd = resolveTenenciaUsd(item, fxRef)
    const pnlNowArs = toFinite(item.pnlArs)
    const pnlNowUsd = resolvePnlNowUsd(item, fxRef)

    let projectedGainArs = 0

    if (rubroId === 'wallets' && item.kind === 'wallet_yield') {
        const tna = toFinite(item.yieldMeta?.tna)
        if (tna <= 0) {
            status = 'missing_data'
            notes.push('sin TNA')
        } else {
            projectedGainArs = estimateWalletProjectedGainArs(tenenciaArs, tna, horizonDays)
        }
    } else if (rubroId === 'plazos' && item.kind === 'plazo_fijo') {
        const detail = portfolio.fixedDepositDetails.get(item.id)
        if (!detail) {
            status = 'missing_data'
            notes.push('faltan datos de plazo fijo')
        } else {
            projectedGainArs = estimatePfProjectedGainArs(detail, horizonDays, now, timeZone)
            if (detail.status !== 'active') {
                notes.push('plazo fijo sin devengado futuro')
            } else if (projectedGainArs <= 0) {
                notes.push('sin devengado proyectable')
            }
        }
    } else if (rubroId === 'cedears' || rubroId === 'crypto' || rubroId === 'fci') {
        notes.push('precio constante (incremental=0)')
        projectedGainArs = 0
    } else {
        status = 'missing_data'
        notes.push('sin modelo de rendimiento')
        projectedGainArs = 0
    }

    const projectedGainUsdRaw = toUsdFromArs(projectedGainArs, fxRef)
    if (projectedGainArs !== 0 && projectedGainUsdRaw === null) {
        status = 'missing_data'
        notes.push('falta FX de referencia para USD')
    }
    const projectedGainUsd = projectedGainUsdRaw === null ? 0 : projectedGainUsdRaw

    return {
        assetKey: buildSnapshotAssetKey(item),
        itemId: item.id,
        symbol: item.symbol || item.id,
        label: item.label || item.symbol || item.id,
        kind: item.kind,
        tenenciaArs,
        tenenciaUsd,
        projectedGainArs: clampNonNegative(projectedGainArs),
        projectedGainUsd: clampNonNegative(projectedGainUsd),
        pnlNowArs,
        pnlNowUsd,
        notes: uniqueNotes(notes),
        status,
    }
}

function computeTotals(rows: ProjectedEarningsByRubroRow[]): ProjectedEarningsTotals {
    return rows.reduce<ProjectedEarningsTotals>((acc, row) => {
        acc.tenenciaArs += row.tenenciaArs
        acc.tenenciaUsd += row.tenenciaUsd
        acc.projectedGainArs += row.projectedGainArs
        acc.projectedGainUsd += row.projectedGainUsd
        acc.pnlNowArs += row.pnlNowArs
        acc.pnlNowUsd += row.pnlNowUsd
        return acc
    }, {
        tenenciaArs: 0,
        tenenciaUsd: 0,
        projectedGainArs: 0,
        projectedGainUsd: 0,
        pnlNowArs: 0,
        pnlNowUsd: 0,
    })
}

export function computeProjectedEarningsByRubro({
    portfolio,
    now = new Date(),
    horizon,
}: ProjectedEarningsByRubroInput): ProjectedEarningsByRubroResult {
    const horizonDays = HORIZON_DAYS[horizon]
    const fxRef = resolveFxRef(portfolio)
    const timeZone = DEFAULT_TIMEZONE

    const rows: ProjectedEarningsByRubroRow[] = portfolio.rubros.map((rubro) => {
        const items = rubro.providers.flatMap((provider) =>
            provider.items.map((item) =>
                buildProjectedItem(portfolio, rubro.id, item, horizonDays, fxRef, now, timeZone)
            )
        )

        const tenenciaArs = items.reduce((sum, item) => sum + item.tenenciaArs, 0)
        const tenenciaUsd = items.reduce((sum, item) => sum + item.tenenciaUsd, 0)
        const projectedGainArs = items.reduce((sum, item) => sum + item.projectedGainArs, 0)
        const projectedGainUsd = items.reduce((sum, item) => sum + item.projectedGainUsd, 0)
        const pnlNowArs = items.reduce((sum, item) => sum + item.pnlNowArs, 0)
        const pnlNowUsd = items.reduce((sum, item) => sum + item.pnlNowUsd, 0)

        const missingItems = items.filter((item) => item.status === 'missing_data').length
        const status: RowStatus = missingItems > 0 ? 'missing_data' : 'ok'
        const notes = uniqueNotes(items.flatMap((item) => item.notes))

        return {
            rubroId: rubro.id,
            label: RUBRO_LABELS[rubro.id] ?? rubro.name,
            tenenciaArs,
            tenenciaUsd,
            projectedGainArs,
            projectedGainUsd,
            pnlNowArs,
            pnlNowUsd,
            notes,
            status,
            items: items.sort((a, b) => Math.abs(b.projectedGainArs) - Math.abs(a.projectedGainArs)),
        }
    })

    const orderMap = new Map<RubroId, number>(RUBRO_ORDER.map((id, index) => [id, index]))
    rows.sort((a, b) => (orderMap.get(a.rubroId) ?? 999) - (orderMap.get(b.rubroId) ?? 999))

    return {
        rows,
        totals: computeTotals(rows),
        horizon,
        horizonDays,
        fxRef,
    }
}
