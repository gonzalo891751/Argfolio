/**
 * Results Service
 *
 * Computes the ResultsCardModel consumed by the ResultsCard component.
 *
 * - TOTAL period: uses live portfolio PnL (value - cost) per item,
 *   with special handling for Wallets (balance variation) and
 *   Plazos Fijos (accrued interest).
 * - Time periods (1D/7D/30D/90D/1Y): uses snapshot deltas (current breakdown
 *   vs past breakdown), with PF override using accrued interest calculation.
 */

import type { Snapshot } from '@/domain/types'
import type { PortfolioV2, ItemV2 } from '@/features/portfolioV2'
import { buildSnapshotFromPortfolioV2 } from './snapshot-v2'
import {
    RESULTS_CATEGORY_CONFIG,
    type Money,
    type ResultsCardModel,
    type ResultsCategoryItem,
    type ResultsCategoryRow,
    type ResultsMeta,
    type ResultsPeriodKey,
} from './results-types'

const PERIOD_DAYS: Record<Exclude<ResultsPeriodKey, 'TOTAL'>, number> = {
    '1D': 1,
    '7D': 7,
    '30D': 30,
    '90D': 90,
    '1Y': 365,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10)
}

function shiftDateKey(dateKey: string, days: number): string {
    const date = new Date(dateKey + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() + days)
    return toDateKey(date)
}

function getSnapshotAtOrBefore(
    snapshotsAsc: Snapshot[],
    targetKey: string,
    requireBreakdown: boolean,
): Snapshot | null {
    let best: Snapshot | null = null
    for (const s of snapshotsAsc) {
        if (s.dateLocal > targetKey) continue
        if (requireBreakdown && !s.breakdownRubros) continue
        if (!best || s.dateLocal > best.dateLocal) best = s
    }
    return best
}

/** Get earliest snapshot with breakdown */
function getEarliestSnapshot(snapshotsAsc: Snapshot[]): Snapshot | null {
    for (const s of snapshotsAsc) {
        if (s.breakdownRubros) return s
    }
    return null
}

function normalizeSnapshots(snapshots: Snapshot[]): Snapshot[] {
    return [...snapshots]
        .filter((s) => Boolean(s.dateLocal))
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
}

function money(ars: number | null, usd: number | null): Money {
    return { ars, usd }
}

// ---------------------------------------------------------------------------
// Plazo Fijo — accrued interest calculation
// ---------------------------------------------------------------------------

interface AccruedResult {
    invested: Money
    value: Money
    pnl: Money
}

/**
 * Compute accrued interest for a plazo fijo as of a given date.
 * Uses linear interpolation: accruedInterest = totalInterest * (elapsed / total).
 */
function computePfAccrued(
    pfMeta: NonNullable<ItemV2['pfMeta']>,
    asOfISO: string,
    oficialSell: number,
): AccruedResult {
    const principal = pfMeta.capitalArs
    const interestTotal = pfMeta.expectedInterestArs

    const startMs = new Date(pfMeta.startDateISO + 'T00:00:00Z').getTime()
    const endMs = new Date(pfMeta.maturityDateISO + 'T00:00:00Z').getTime()
    const asOfMs = new Date(asOfISO + 'T00:00:00Z').getTime()

    const totalDays = Math.max(1, (endMs - startMs) / 86_400_000)
    const elapsedDays = Math.max(0, Math.min(totalDays, (asOfMs - startMs) / 86_400_000))

    const accrued = interestTotal * (elapsedDays / totalDays)
    const valueNow = principal + accrued
    const fx = oficialSell > 0 ? oficialSell : 1

    return {
        invested: money(principal, principal / fx),
        value: money(valueNow, valueNow / fx),
        pnl: money(accrued, accrued / fx),
    }
}

/**
 * Build PF items for the TOTAL period using accrued interest.
 * Returns { items, catPnl } or null if rubro not found.
 */
function buildPfItemsTotal(
    portfolio: PortfolioV2,
    todayKey: string,
): { items: ResultsCategoryItem[]; catPnlArs: number; catPnlUsd: number } | null {
    const rubro = portfolio.rubros.find((r) => r.id === 'plazos')
    if (!rubro) return null

    const oficialSell = portfolio.fx.officialSell || 1
    const items: ResultsCategoryItem[] = []
    let catPnlArs = 0
    let catPnlUsd = 0

    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            if (item.pfMeta) {
                const accrued = computePfAccrued(item.pfMeta, todayKey, oficialSell)
                items.push({
                    id: item.id,
                    title: item.label || item.symbol,
                    subtitle: provider.name,
                    invested: accrued.invested,
                    value: accrued.value,
                    pnl: accrued.pnl,
                })
                catPnlArs += accrued.pnl.ars ?? 0
                catPnlUsd += accrued.pnl.usd ?? 0
            } else {
                // Fallback for PF items without pfMeta (shouldn't happen)
                items.push({
                    id: item.id,
                    title: item.label || item.symbol,
                    subtitle: provider.name,
                    invested: money(item.valArs, item.valUsd),
                    value: money(item.valArs, item.valUsd),
                    pnl: money(0, 0),
                })
            }
        }
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))
    return { items, catPnlArs, catPnlUsd }
}

/**
 * Build PF items for a time period using accrued interest deltas.
 */
function buildPfItemsPeriod(
    portfolio: PortfolioV2,
    startISO: string,
    endISO: string,
): { items: ResultsCategoryItem[]; catPnlArs: number; catPnlUsd: number } | null {
    const rubro = portfolio.rubros.find((r) => r.id === 'plazos')
    if (!rubro) return null

    const oficialSell = portfolio.fx.officialSell || 1
    const items: ResultsCategoryItem[] = []
    let catPnlArs = 0
    let catPnlUsd = 0

    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            if (item.pfMeta) {
                const accruedEnd = computePfAccrued(item.pfMeta, endISO, oficialSell)
                const accruedStart = computePfAccrued(item.pfMeta, startISO, oficialSell)

                const pnlArs = (accruedEnd.pnl.ars ?? 0) - (accruedStart.pnl.ars ?? 0)
                const pnlUsd = (accruedEnd.pnl.usd ?? 0) - (accruedStart.pnl.usd ?? 0)

                items.push({
                    id: item.id,
                    title: item.label || item.symbol,
                    subtitle: provider.name,
                    invested: accruedStart.value,
                    value: accruedEnd.value,
                    pnl: money(pnlArs, pnlUsd),
                })
                catPnlArs += pnlArs
                catPnlUsd += pnlUsd
            }
        }
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))
    return { items, catPnlArs, catPnlUsd }
}

// ---------------------------------------------------------------------------
// Wallets — balance variation
// ---------------------------------------------------------------------------

const WALLET_TABLE_LABELS = { col1: 'Inicial', col2: 'Actual', col3: 'Variación' }

/**
 * Build wallet items for the TOTAL period using earliest snapshot as baseline.
 * If no snapshot is available, shows current balances with null PnL.
 */
function buildWalletItemsTotal(
    portfolio: PortfolioV2,
    snapshotsAsc: Snapshot[],
): {
    items: ResultsCategoryItem[]
    catPnlArs: number
    catPnlUsd: number
    baselineDate: string | null
} | null {
    const rubro = portfolio.rubros.find((r) => r.id === 'wallets')
    if (!rubro) return null

    // Gather current wallet values per item
    const currentByKey = new Map<string, { ars: number; usd: number; title: string; subtitle: string }>()
    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            currentByKey.set(item.id, {
                ars: item.valArs,
                usd: item.valUsd,
                title: item.label || item.symbol,
                subtitle: provider.name,
            })
        }
    }

    // Try to find earliest snapshot with wallet breakdown
    const baseline = getEarliestSnapshot(snapshotsAsc)
    const pastItems = baseline?.breakdownItems ?? {}
    const pastRubros = baseline?.breakdownRubros ?? {}

    if (!baseline?.breakdownRubros) {
        // No baseline: show current balances, P&L unknown
        const items: ResultsCategoryItem[] = []
        let catArs = 0
        let catUsd = 0
        for (const [id, cur] of currentByKey) {
            items.push({
                id,
                title: cur.title,
                subtitle: cur.subtitle,
                invested: money(null, null),
                value: money(cur.ars, cur.usd),
                pnl: money(null, null),
            })
            catArs += cur.ars
            catUsd += cur.usd
        }
        return { items, catPnlArs: 0, catPnlUsd: 0, baselineDate: null }
    }

    // Snapshot-based baseline for wallets
    const currentWalletArs = rubro.totals.ars
    const currentWalletUsd = rubro.totals.usd
    const pastWalletArs = pastRubros['wallets']?.ars ?? 0
    const pastWalletUsd = pastRubros['wallets']?.usd ?? 0

    const catPnlArs = currentWalletArs - pastWalletArs
    const catPnlUsd = currentWalletUsd - pastWalletUsd

    // Per-item detail: match by snapshot assetKey
    const items: ResultsCategoryItem[] = []

    // Build a map from item.id to its snapshot key (for matching)
    // Snapshot keys look like "wallet:<account>:<symbol>"
    // We need to match current items to past items
    const walletPastKeys = Object.keys(pastItems).filter(
        (k) => pastItems[k]?.rubroId === 'wallets',
    )
    const walletCurrentKeys = new Set<string>()

    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            // Build the same key pattern the snapshot uses
            const assetKey = buildWalletSnapshotKey(item)
            walletCurrentKeys.add(assetKey)

            const pastVal = pastItems[assetKey]
            const startArs = pastVal?.ars ?? 0
            const startUsd = pastVal?.usd ?? 0
            const pnlArs = item.valArs - startArs
            const pnlUsd = item.valUsd - startUsd

            items.push({
                id: item.id,
                title: item.label || item.symbol,
                subtitle: provider.name,
                invested: money(startArs, startUsd),
                value: money(item.valArs, item.valUsd),
                pnl: money(pnlArs, pnlUsd),
            })
        }
    }

    // Include items that existed in the past but not anymore (closed wallets)
    for (const pastKey of walletPastKeys) {
        if (walletCurrentKeys.has(pastKey)) continue
        const past = pastItems[pastKey]
        if (!past) continue
        const label = pastKey.split(':').pop() ?? pastKey
        items.push({
            id: pastKey,
            title: label,
            invested: money(past.ars, past.usd),
            value: money(0, 0),
            pnl: money(-past.ars, -past.usd),
        })
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))

    return { items, catPnlArs: catPnlArs, catPnlUsd: catPnlUsd, baselineDate: baseline.dateLocal }
}

/**
 * Build a snapshot-compatible key for a wallet item.
 * Mirrors the logic in snapshot-v2.ts buildSnapshotAssetKey.
 */
function buildWalletSnapshotKey(item: ItemV2): string {
    const account = item.accountId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    const symbolOrId = item.symbol || item.instrumentId || item.id
    const symbol = symbolOrId
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    return `wallet:${account}:${symbol}`
}

// ---------------------------------------------------------------------------
// TOTAL period — live PnL with wallet & PF overrides
// ---------------------------------------------------------------------------

function buildTotalFromPortfolio(
    portfolio: PortfolioV2,
    snapshots: Snapshot[],
    now: Date,
): ResultsCardModel {
    const snapshotsAsc = normalizeSnapshots(snapshots)
    const todayKey = toDateKey(now)

    const categories: ResultsCategoryRow[] = []
    let totalPnlArs = 0
    let totalPnlUsd = 0
    let walletBaselineNote: string | undefined

    for (const cfg of RESULTS_CATEGORY_CONFIG) {
        // ── WALLETS special handling ──
        if (cfg.key === 'wallets') {
            const walletResult = buildWalletItemsTotal(portfolio, snapshotsAsc)
            if (!walletResult) continue

            const { items, catPnlArs, catPnlUsd, baselineDate } = walletResult

            if (baselineDate) {
                walletBaselineNote = `Billeteras: variación desde ${baselineDate}`
            }

            categories.push({
                key: cfg.key,
                rubroId: cfg.rubroId,
                title: cfg.label,
                subtitle: `${items.length} ${cfg.sub}`,
                pnl: money(catPnlArs, catPnlUsd),
                items,
                tableLabels: WALLET_TABLE_LABELS,
            })

            totalPnlArs += catPnlArs
            totalPnlUsd += catPnlUsd
            continue
        }

        // ── PLAZOS FIJOS special handling ──
        if (cfg.key === 'plazos') {
            const pfResult = buildPfItemsTotal(portfolio, todayKey)
            if (!pfResult) continue

            const { items, catPnlArs, catPnlUsd } = pfResult

            categories.push({
                key: cfg.key,
                rubroId: cfg.rubroId,
                title: cfg.label,
                subtitle: `${items.length} ${cfg.sub}`,
                pnl: money(catPnlArs, catPnlUsd),
                items,
            })

            totalPnlArs += catPnlArs
            totalPnlUsd += catPnlUsd
            continue
        }

        // ── Default handling (CEDEARs, Crypto, FCI) ──
        const rubro = portfolio.rubros.find((r) => r.id === cfg.rubroId)
        if (!rubro) continue

        const items: ResultsCategoryItem[] = []
        let catPnlArs = 0
        let catPnlUsd = 0

        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                const pnlArs = item.pnlArs ?? 0
                const pnlUsd = item.pnlUsd ?? 0
                const investedArs = item.valArs - pnlArs
                const investedUsd = item.valUsd - pnlUsd

                items.push({
                    id: item.id,
                    title: item.symbol || item.label,
                    subtitle: provider.name,
                    invested: money(investedArs, investedUsd),
                    value: money(item.valArs, item.valUsd),
                    pnl: money(pnlArs, pnlUsd),
                })

                catPnlArs += pnlArs
                catPnlUsd += pnlUsd
            }
        }

        items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))

        categories.push({
            key: cfg.key,
            rubroId: cfg.rubroId,
            title: cfg.label,
            subtitle: `${items.length} ${cfg.sub}`,
            pnl: money(catPnlArs, catPnlUsd),
            items,
        })

        totalPnlArs += catPnlArs
        totalPnlUsd += catPnlUsd
    }

    const note = walletBaselineNote
        ? `Total desde costo (PnL acumulado). ${walletBaselineNote}.`
        : 'Total desde costo (PnL acumulado).'

    return {
        periodKey: 'TOTAL',
        totals: { pnl: money(totalPnlArs, totalPnlUsd) },
        categories,
        meta: {
            snapshotStatus: 'ok',
            asOfISO: portfolio.asOfISO,
            note,
        },
    }
}

// ---------------------------------------------------------------------------
// Time-period — snapshot deltas with PF override
// ---------------------------------------------------------------------------

function buildPeriodFromSnapshots(
    portfolio: PortfolioV2,
    snapshots: Snapshot[],
    periodKey: Exclude<ResultsPeriodKey, 'TOTAL'>,
    now: Date = new Date(),
): ResultsCardModel {
    const snapshotsAsc = normalizeSnapshots(snapshots)
    const todayKey = toDateKey(now)
    const targetKey = shiftDateKey(todayKey, -PERIOD_DAYS[periodKey])

    const baseline = getSnapshotAtOrBefore(snapshotsAsc, targetKey, true)

    if (!baseline?.breakdownRubros) {
        // Insufficient data — return empty model
        return {
            periodKey,
            totals: { pnl: money(null, null) },
            categories: RESULTS_CATEGORY_CONFIG.map((cfg) => ({
                key: cfg.key,
                rubroId: cfg.rubroId,
                title: cfg.label,
                subtitle: undefined,
                pnl: money(null, null),
                items: [],
            })),
            meta: {
                snapshotStatus: 'insufficient',
                note: `Faltan snapshots para el periodo ${periodKey}. Se necesita al menos un snapshot antes del ${targetKey}.`,
            },
        }
    }

    // Build current snapshot from live portfolio
    const currentSnapshot = buildSnapshotFromPortfolioV2(portfolio, 'MEP', now)
    const currentRubros = currentSnapshot.breakdownRubros ?? {}
    const pastRubros = baseline.breakdownRubros ?? {}
    const currentItems = currentSnapshot.breakdownItems ?? {}
    const pastItems = baseline.breakdownItems ?? {}

    // Build per-category data
    const categories: ResultsCategoryRow[] = []
    let totalPnlArs = 0
    let totalPnlUsd = 0

    for (const cfg of RESULTS_CATEGORY_CONFIG) {
        const rubroId = cfg.rubroId

        // ── PLAZOS FIJOS: override with accrued interest deltas ──
        if (cfg.key === 'plazos') {
            const pfResult = buildPfItemsPeriod(portfolio, baseline.dateLocal, todayKey)
            if (pfResult && pfResult.items.length > 0) {
                categories.push({
                    key: cfg.key,
                    rubroId: cfg.rubroId,
                    title: cfg.label,
                    subtitle: `${pfResult.items.length} ${cfg.sub}`,
                    pnl: money(pfResult.catPnlArs, pfResult.catPnlUsd),
                    items: pfResult.items,
                })
                totalPnlArs += pfResult.catPnlArs
                totalPnlUsd += pfResult.catPnlUsd
                continue
            }
            // Fall through to default snapshot delta if no PF items in portfolio
        }

        // ── WALLETS: add custom table labels ──
        const isWallets = cfg.key === 'wallets'

        const currentRubro = currentRubros[rubroId]
        const pastRubro = pastRubros[rubroId]
        const catPnlArs = (currentRubro?.ars ?? 0) - (pastRubro?.ars ?? 0)
        const catPnlUsd = (currentRubro?.usd ?? 0) - (pastRubro?.usd ?? 0)

        // Build items from breakdownItems that belong to this rubro
        const items: ResultsCategoryItem[] = []
        const allAssetKeys = new Set([
            ...Object.keys(currentItems).filter((k) => currentItems[k]?.rubroId === rubroId),
            ...Object.keys(pastItems).filter((k) => pastItems[k]?.rubroId === rubroId),
        ])

        for (const assetKey of allAssetKeys) {
            const current = currentItems[assetKey]
            const past = pastItems[assetKey]
            const itemPnlArs = (current?.ars ?? 0) - (past?.ars ?? 0)
            const itemPnlUsd = (current?.usd ?? 0) - (past?.usd ?? 0)

            // Try to resolve a label from the live portfolio
            const label = resolveItemLabel(portfolio, assetKey, rubroId)

            items.push({
                id: assetKey,
                title: label,
                invested: money(past?.ars ?? 0, past?.usd ?? 0),
                value: money(current?.ars ?? 0, current?.usd ?? 0),
                pnl: money(itemPnlArs, itemPnlUsd),
            })
        }

        items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))

        categories.push({
            key: cfg.key,
            rubroId: cfg.rubroId,
            title: cfg.label,
            subtitle: items.length > 0 ? `${items.length} ${cfg.sub}` : undefined,
            pnl: money(catPnlArs, catPnlUsd),
            items,
            ...(isWallets ? { tableLabels: WALLET_TABLE_LABELS } : {}),
        })

        totalPnlArs += catPnlArs
        totalPnlUsd += catPnlUsd
    }

    const meta: ResultsMeta = {
        snapshotStatus: 'ok',
        startISO: baseline.dateLocal,
        endISO: todayKey,
        asOfISO: portfolio.asOfISO,
    }

    return {
        periodKey,
        totals: { pnl: money(totalPnlArs, totalPnlUsd) },
        categories,
        meta,
    }
}

// Resolve a human-readable label from a snapshot assetKey like "cedear:broker:SPY"
function resolveItemLabel(portfolio: PortfolioV2, assetKey: string, rubroId: string): string {
    // Parse the key: prefix:account:symbol
    const parts = assetKey.split(':')
    const symbol = parts[parts.length - 1] ?? assetKey

    // Try to find the live item for a better label
    for (const rubro of portfolio.rubros) {
        if (rubro.id !== rubroId) continue
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                const itemSymbol = (item.symbol || item.id).toUpperCase().replace(/[^A-Z0-9_-]/g, '-')
                if (itemSymbol === symbol.toUpperCase()) {
                    return item.symbol || item.label
                }
            }
        }
    }

    return symbol
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComputeResultsInput {
    portfolio: PortfolioV2
    snapshots: Snapshot[]
    periodKey: ResultsPeriodKey
    now?: Date
}

export function computeResultsCardModel({
    portfolio,
    snapshots,
    periodKey,
    now = new Date(),
}: ComputeResultsInput): ResultsCardModel {
    if (periodKey === 'TOTAL') {
        return buildTotalFromPortfolio(portfolio, snapshots, now)
    }

    return buildPeriodFromSnapshots(portfolio, snapshots, periodKey, now)
}
