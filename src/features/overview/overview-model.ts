/**
 * Overview model — the simple "¿cuánta plata tengo?" view.
 *
 * Splits the portfolio into what is really in pesos (billeteras, frascos,
 * plazos fijos, FCI en pesos) and what is really in dollars (dólares, stablecoins,
 * cripto, CEDEARs, FCI en dólares). Each position carries its value in both
 * currencies, its result, and — for peso yields — interest earned and projected.
 *
 * Pure: derived only from PortfolioV2, so totals always match Mis Activos and
 * the daily snapshots.
 */

import type { ItemKind, ItemV2, PortfolioV2, RubroId } from '@/features/portfolioV2/types'

export type BucketId = 'pesos' | 'dolares'

export type GroupId =
    | 'billeteras'
    | 'frascos'
    | 'plazos'
    | 'fci_ars'
    | 'dolares'
    | 'cripto'
    | 'cedears'
    | 'fci_usd'

export const GROUP_LABELS: Record<GroupId, string> = {
    billeteras: 'Billeteras y bancos',
    frascos: 'Frascos',
    plazos: 'Plazos fijos',
    fci_ars: 'Fondos (FCI)',
    dolares: 'Dólares y stablecoins',
    cripto: 'Cripto',
    cedears: 'CEDEARs',
    fci_usd: 'Fondos en dólares',
}

const GROUP_ORDER: Record<BucketId, GroupId[]> = {
    pesos: ['billeteras', 'frascos', 'plazos', 'fci_ars'],
    dolares: ['dolares', 'cripto', 'cedears', 'fci_usd'],
}

export interface OverviewPfInfo {
    maturityISO: string
    daysRemaining: number
    capitalArs: number
    totalAtMaturityArs: number
}

export interface OverviewPosition {
    id: string
    /** PortfolioV2 item id (key of the detail maps) */
    itemId: string
    groupId: GroupId
    kind: ItemKind
    label: string
    /** Where it is held (account / bank) */
    sublabel: string
    symbol: string
    qty?: number
    accountId: string
    instrumentId?: string
    valueArs: number
    valueUsd: number
    /** No market quote: value is unknown, never a real $0 */
    valueMissing: boolean
    resultArs?: number
    resultUsd?: number
    /** Result over cost, in the position's own currency (USD for dollars, ARS for pesos) */
    resultPct?: number
    tna?: number
    interestTomorrowArs?: number
    interest30dArs?: number
    /** Interest already earned: accumulated for wallets, accrued for plazos fijos */
    interestEarnedArs?: number
    pf?: OverviewPfInfo
    href?: string
}

export interface OverviewGroup {
    id: GroupId
    label: string
    positions: OverviewPosition[]
    totalArs: number
    totalUsd: number
}

export interface OverviewBucket {
    id: BucketId
    /** Everything in this bucket valued in pesos */
    totalArs: number
    /** Everything in this bucket valued in dollars */
    totalUsd: number
    /** Share of the patrimonio (0-100) */
    sharePct: number
    groups: OverviewGroup[]
    /** Sum of results of positions with a known cost */
    resultArs: number
    resultUsd: number
    /** Peso yields: interest earned so far and projected */
    interestEarnedArs: number
    interestTomorrowArs: number
    interest30dArs: number
}

export interface OverviewFx {
    mep: number
    oficial: number
    cripto: number
}

export interface Overview {
    totalArs: number
    totalUsd: number
    pesos: OverviewBucket
    dolares: OverviewBucket
    missingPriceCount: number
    fx: OverviewFx
    hasPositions: boolean
}

const DAY_MS = 86_400_000

function rubroToGroup(rubroId: RubroId, item: ItemV2): GroupId {
    const isUsd = item.kind === 'cash_usd' || item.nativeCurrency === 'USD'
    switch (rubroId) {
        case 'plazos':
            return 'plazos'
        case 'cedears':
            return 'cedears'
        case 'fci':
            return isUsd ? 'fci_usd' : 'fci_ars'
        case 'crypto':
            return item.kind === 'stable' ? 'dolares' : 'cripto'
        case 'frascos':
            return isUsd ? 'dolares' : 'frascos'
        case 'wallets':
        default:
            if (item.kind === 'stable') return 'dolares'
            if (item.kind === 'crypto') return 'cripto'
            return isUsd ? 'dolares' : 'billeteras'
    }
}

export function bucketOfGroup(groupId: GroupId): BucketId {
    return GROUP_ORDER.pesos.includes(groupId) ? 'pesos' : 'dolares'
}

/** Detail page for a position, when one exists. */
export function buildPositionHref(item: ItemV2): string | undefined {
    const account = encodeURIComponent(item.accountId)
    switch (item.kind) {
        case 'crypto':
        case 'stable':
            return `/activos/cripto/${account}/${encodeURIComponent(item.symbol)}`
        case 'cedear':
            return `/activos/cedears/${account}/${encodeURIComponent(item.symbol)}`
        case 'fci':
            return item.instrumentId
                ? `/activos/fondos/${account}/${encodeURIComponent(item.instrumentId)}`
                : undefined
        case 'plazo_fijo':
            return `/activos/plazos-fijos/${encodeURIComponent(item.id)}`
        case 'cash_ars':
        case 'cash_usd':
        case 'wallet_yield':
        case 'frasco':
            return `/activos/billeteras/${account}`
        default:
            return undefined
    }
}

/** Daily-compounded interest for a balance at a given TNA (percent). */
export function projectInterest(balanceArs: number, tnaPct: number, days: number): number {
    if (!Number.isFinite(balanceArs) || balanceArs <= 0 || !Number.isFinite(tnaPct) || tnaPct <= 0 || days <= 0) return 0
    const daily = tnaPct / 100 / 365
    return balanceArs * (Math.pow(1 + daily, days) - 1)
}

function emptyBucket(id: BucketId): OverviewBucket {
    return {
        id,
        totalArs: 0,
        totalUsd: 0,
        sharePct: 0,
        groups: [],
        resultArs: 0,
        resultUsd: 0,
        interestEarnedArs: 0,
        interestTomorrowArs: 0,
        interest30dArs: 0,
    }
}

function finite(value: number | undefined | null): value is number {
    return value != null && Number.isFinite(value)
}

function buildPosition(
    rubroId: RubroId,
    providerName: string,
    item: ItemV2,
    portfolio: PortfolioV2,
    nowMs: number,
): OverviewPosition {
    const groupId = rubroToGroup(rubroId, item)
    const isCash = item.kind === 'cash_ars' || item.kind === 'cash_usd' || item.kind === 'wallet_yield' || item.kind === 'frasco'
    const cleanProvider = providerName.replace(/\s*\(Liquidez\)$/, '')

    let label = item.label || item.symbol
    let sublabel = cleanProvider
    if (isCash) {
        label = cleanProvider
        sublabel = item.kind === 'cash_usd' || item.nativeCurrency === 'USD' ? 'Dólares' : 'Pesos'
    } else if (item.kind === 'cedear') {
        label = item.label && item.label !== item.symbol ? `${item.label}` : item.symbol
        sublabel = `${cleanProvider} · ${item.symbol}`
    } else if (item.kind === 'crypto' || item.kind === 'stable') {
        label = item.label && item.label !== item.symbol ? item.label : item.symbol
        sublabel = `${cleanProvider} · ${item.symbol}`
    } else if (item.kind === 'plazo_fijo') {
        label = item.label || 'Plazo fijo'
        sublabel = cleanProvider
    }

    const position: OverviewPosition = {
        id: `${rubroId}:${item.id}`,
        itemId: item.id,
        groupId,
        kind: item.kind,
        label,
        sublabel,
        symbol: item.symbol,
        qty: item.qty,
        accountId: item.accountId,
        instrumentId: item.instrumentId,
        valueArs: item.valueMissing ? 0 : item.valArs,
        valueUsd: item.valueMissing ? 0 : item.valUsd,
        valueMissing: Boolean(item.valueMissing),
        href: buildPositionHref(item),
    }

    const isPesoPosition = bucketOfGroup(groupId) === 'pesos'

    if (!item.valueMissing) {
        if (item.kind === 'plazo_fijo' && item.pfMeta) {
            const meta = item.pfMeta
            const accrued = item.valArs - meta.capitalArs
            position.interestEarnedArs = Math.max(0, accrued)
            position.resultArs = Math.max(0, accrued)
            position.resultPct = meta.capitalArs > 0 ? accrued / meta.capitalArs : undefined
            position.tna = item.yieldMeta?.tna
            const maturityMs = Date.parse(meta.maturityDateISO)
            const startMs = Date.parse(meta.startDateISO)
            const daysRemaining = Number.isFinite(maturityMs) ? Math.max(0, Math.ceil((maturityMs - nowMs) / DAY_MS)) : 0
            const termDays = Number.isFinite(maturityMs) && Number.isFinite(startMs)
                ? Math.max(1, Math.round((maturityMs - startMs) / DAY_MS))
                : 0
            const dailyInterest = termDays > 0 ? meta.expectedInterestArs / termDays : 0
            position.interestTomorrowArs = daysRemaining > 0 ? dailyInterest : 0
            position.interest30dArs = dailyInterest * Math.min(30, daysRemaining)
            position.pf = {
                maturityISO: meta.maturityDateISO,
                daysRemaining,
                capitalArs: meta.capitalArs,
                totalAtMaturityArs: meta.expectedTotalArs,
            }
        } else if (isPesoPosition && isCash) {
            const tna = item.yieldMeta?.tna
            const wallet = portfolio.walletDetails.get(item.accountId)
            position.tna = tna && tna > 0 ? tna : undefined
            if (position.tna) {
                position.interestTomorrowArs = projectInterest(item.valArs, position.tna, 1)
                position.interest30dArs = projectInterest(item.valArs, position.tna, 30)
            }
            if (wallet?.interestTotalArs && wallet.interestTotalArs > 0) {
                position.interestEarnedArs = wallet.interestTotalArs
                position.resultArs = wallet.interestTotalArs
            }
        } else {
            if (finite(item.pnlArs)) position.resultArs = item.pnlArs
            if (finite(item.pnlUsd)) position.resultUsd = item.pnlUsd
            if (finite(item.pnlPct)) position.resultPct = item.pnlPct
        }
    }

    return position
}

/**
 * Same cash account can show up once per rubro (wallets + frascos never both,
 * but a broker's liquidity appears next to its holdings). Merge positions that
 * point to the same account/currency so the user sees one "Mercado Pago" row.
 */
function mergeCashPositions(positions: OverviewPosition[]): OverviewPosition[] {
    const out: OverviewPosition[] = []
    const byKey = new Map<string, OverviewPosition>()
    for (const p of positions) {
        const isCash = p.kind === 'cash_ars' || p.kind === 'cash_usd' || p.kind === 'wallet_yield' || p.kind === 'frasco'
        if (!isCash) {
            out.push(p)
            continue
        }
        const key = `${p.groupId}:${p.accountId}:${p.sublabel}`
        const existing = byKey.get(key)
        if (!existing) {
            const copy = { ...p }
            byKey.set(key, copy)
            out.push(copy)
            continue
        }
        existing.valueArs += p.valueArs
        existing.valueUsd += p.valueUsd
        existing.interestTomorrowArs = (existing.interestTomorrowArs ?? 0) + (p.interestTomorrowArs ?? 0) || undefined
        existing.interest30dArs = (existing.interest30dArs ?? 0) + (p.interest30dArs ?? 0) || undefined
        existing.tna = existing.tna ?? p.tna
    }
    return out
}

export function buildOverview(portfolio: PortfolioV2 | null, nowMs: number = Date.now()): Overview {
    const pesos = emptyBucket('pesos')
    const dolares = emptyBucket('dolares')
    const fx: OverviewFx = {
        mep: portfolio?.fx.mepSell ?? 0,
        oficial: portfolio?.fx.officialSell ?? 0,
        cripto: portfolio?.fx.cryptoSell ?? 0,
    }

    if (!portfolio) {
        return { totalArs: 0, totalUsd: 0, pesos, dolares, missingPriceCount: 0, fx, hasPositions: false }
    }

    const positions: OverviewPosition[] = []
    let missingPriceCount = 0
    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                if (item.valueMissing) missingPriceCount += 1
                positions.push(buildPosition(rubro.id, provider.name, item, portfolio, nowMs))
            }
        }
    }

    const merged = mergeCashPositions(positions)
    // A wallet's lifetime interest is account-level: count it once per account.
    const interestCounted = new Set<string>()

    for (const bucket of [pesos, dolares]) {
        const groups: OverviewGroup[] = []
        for (const groupId of GROUP_ORDER[bucket.id]) {
            const groupPositions = merged
                .filter(p => p.groupId === groupId)
                .sort((a, b) => b.valueArs - a.valueArs)
            if (groupPositions.length === 0) continue
            const group: OverviewGroup = {
                id: groupId,
                label: GROUP_LABELS[groupId],
                positions: groupPositions,
                totalArs: groupPositions.reduce((s, p) => s + p.valueArs, 0),
                totalUsd: groupPositions.reduce((s, p) => s + p.valueUsd, 0),
            }
            groups.push(group)

            for (const p of groupPositions) {
                bucket.totalArs += p.valueArs
                bucket.totalUsd += p.valueUsd
                bucket.interestTomorrowArs += p.interestTomorrowArs ?? 0
                bucket.interest30dArs += p.interest30dArs ?? 0

                const isWalletInterest = p.kind !== 'plazo_fijo' && p.interestEarnedArs != null
                if (isWalletInterest) {
                    if (interestCounted.has(p.accountId)) {
                        p.interestEarnedArs = undefined
                        p.resultArs = undefined
                    } else {
                        interestCounted.add(p.accountId)
                    }
                }
                bucket.interestEarnedArs += p.interestEarnedArs ?? 0
                bucket.resultArs += p.resultArs ?? 0
                bucket.resultUsd += p.resultUsd ?? 0
            }
        }
        bucket.groups = groups
    }

    const totalArs = pesos.totalArs + dolares.totalArs
    const totalUsd = pesos.totalUsd + dolares.totalUsd
    if (totalArs > 0) {
        pesos.sharePct = (pesos.totalArs / totalArs) * 100
        dolares.sharePct = 100 - pesos.sharePct
    }

    return {
        totalArs,
        totalUsd,
        pesos,
        dolares,
        missingPriceCount,
        fx,
        hasPositions: merged.length > 0,
    }
}
