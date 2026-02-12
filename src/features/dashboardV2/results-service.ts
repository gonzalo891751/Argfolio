/**
 * Results Service
 *
 * Computes the ResultsCardModel consumed by the ResultsCard component.
 *
 * - TOTAL period: uses live portfolio PnL (value - cost) per item,
 *   with Wallets showing accrued interest (NOT balance variation)
 *   and Plazos Fijos showing accrued interest (linear interpolation).
 * - Time periods (1D/7D/30D/90D/1Y): uses snapshot deltas for default
 *   rubros, with PF and Wallet overrides using interest calculations.
 */

import type { Movement, Snapshot } from '@/domain/types'
import type { PortfolioV2, ItemV2 } from '@/features/portfolioV2'
import { buildSnapshotFromPortfolioV2 } from './snapshot-v2'
import {
    computeNetFlowsByRubro,
    convertMovementAmountToArsUsdEq,
    type ResultsFlowFxContext,
} from './results-flows'
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

function normalizeSnapshots(snapshots: Snapshot[]): Snapshot[] {
    return [...snapshots]
        .filter((s) => Boolean(s.dateLocal))
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
}

function money(ars: number | null, usd: number | null): Money {
    return { ars, usd }
}

function buildFlowFxContext(portfolio: PortfolioV2): ResultsFlowFxContext {
    return {
        officialSell: portfolio.fx.officialSell || 0,
        mepSell: portfolio.fx.mepSell || 0,
        cryptoSell: portfolio.fx.cryptoSell || 0,
    }
}

function movementDateKey(datetimeISO: string): string | null {
    if (!datetimeISO) return null
    const date = new Date(datetimeISO)
    if (!Number.isFinite(date.getTime())) return null
    return date.toISOString().slice(0, 10)
}

function isMovementInRange(datetimeISO: string, startISO: string, endISO: string): boolean {
    const dateKey = movementDateKey(datetimeISO)
    if (!dateKey) return false
    return dateKey > startISO && dateKey <= endISO
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
 * Returns null if dates are invalid or data produces NaN.
 */
function computePfAccrued(
    pfMeta: NonNullable<ItemV2['pfMeta']>,
    asOfISO: string,
    oficialSell: number,
): AccruedResult | null {
    const principal = pfMeta.capitalArs
    const interestTotal = pfMeta.expectedInterestArs

    if (!pfMeta.startDateISO || !pfMeta.maturityDateISO) return null
    if (!Number.isFinite(principal) || !Number.isFinite(interestTotal)) return null

    const startStr = pfMeta.startDateISO.includes('T') ? pfMeta.startDateISO : pfMeta.startDateISO + 'T00:00:00Z'
    const endStr = pfMeta.maturityDateISO.includes('T') ? pfMeta.maturityDateISO : pfMeta.maturityDateISO + 'T00:00:00Z'

    const startMs = new Date(startStr).getTime()
    const endMs = new Date(endStr).getTime()
    const asOfMs = new Date(asOfISO + 'T00:00:00Z').getTime()

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(asOfMs)) return null

    const totalDays = Math.max(1, (endMs - startMs) / 86_400_000)
    const elapsedDays = Math.max(0, Math.min(totalDays, (asOfMs - startMs) / 86_400_000))

    const accrued = interestTotal * (elapsedDays / totalDays)
    if (!Number.isFinite(accrued)) return null

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
                if (accrued) {
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
                    // pfMeta present but dates invalid — show null PnL
                    items.push({
                        id: item.id,
                        title: item.label || item.symbol,
                        subtitle: `${provider.name} — Faltan fechas`,
                        invested: money(item.pfMeta.capitalArs, null),
                        value: money(null, null),
                        pnl: money(null, null),
                    })
                }
            } else {
                // PF item without pfMeta — data not yet loaded
                items.push({
                    id: item.id,
                    title: item.label || item.symbol,
                    subtitle: `${provider.name} — Sin datos`,
                    invested: money(null, null),
                    value: money(null, null),
                    pnl: money(null, null),
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

                if (accruedEnd && accruedStart) {
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
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))
    return { items, catPnlArs, catPnlUsd }
}

// ---------------------------------------------------------------------------
// Wallets — interest / yield (NOT balance variation)
// ---------------------------------------------------------------------------

const WALLET_TABLE_LABELS = { col1: 'Saldo', col2: 'TNA', col3: 'Intereses' }

/** Check if an item is a yield-bearing wallet (wallet_yield OR cash_ars with yieldMeta). */
function isYieldBearingWallet(item: { kind: string; yieldMeta?: unknown }): boolean {
    return item.kind === 'wallet_yield' || (item.kind === 'cash_ars' && item.yieldMeta != null)
}

/**
 * Estimate wallet interest for a given number of days using TNA compound formula.
 * Reuses the same math as projected-earnings.ts estimateWalletProjectedGainArs.
 */
function estimateWalletInterestArs(balanceArs: number, tna: number, days: number): number {
    if (!Number.isFinite(balanceArs) || balanceArs <= 0) return 0
    if (!Number.isFinite(tna) || tna <= 0) return 0
    if (days <= 0) return 0
    const dailyRate = (tna / 100) / 365
    return balanceArs * (Math.pow(1 + dailyRate, days) - 1)
}

/**
 * Build wallet items for the TOTAL period using accrued interest
 * from walletDetails (sum of INTEREST movements).
 * NON-yield wallets show result = 0 (they don't generate interest).
 */
function buildWalletItemsTotal(
    portfolio: PortfolioV2,
): {
    items: ResultsCategoryItem[]
    catPnlArs: number
    catPnlUsd: number
    walletEmptyStateHint: boolean
} | null {
    const rubro = portfolio.rubros.find((r) => r.id === 'wallets')
    if (!rubro) return null

    const fx = portfolio.fx.officialSell > 0 ? portfolio.fx.officialSell : 1
    const items: ResultsCategoryItem[] = []
    let catPnlArs = 0
    let catPnlUsd = 0

    // Track which accounts we've already counted interest for
    // (an account may have multiple items: cash_ars + wallet_yield + cash_usd)
    const accountInterestClaimed = new Set<string>()

    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            let interestArs = 0
            let tnaLabel: string | undefined

            if (isYieldBearingWallet(item)) {
                // Yield-bearing wallet: get accumulated interest from walletDetails
                const detail = portfolio.walletDetails.get(item.accountId)
                if (detail && detail.interestTotalArs != null && !accountInterestClaimed.has(item.accountId)) {
                    interestArs = detail.interestTotalArs
                    accountInterestClaimed.add(item.accountId)
                    tnaLabel = detail.tna ? `TNA ${detail.tna}%` : undefined
                } else if (detail?.tna && detail.tna > 0) {
                    // walletDetails exists but no INTEREST movements yet — use null
                    tnaLabel = `TNA ${detail.tna}%`
                }
            }
            // non-yield cash_ars / cash_usd: interestArs stays 0

            const interestUsd = interestArs / fx

            items.push({
                id: item.id,
                title: item.label || item.symbol,
                subtitle: tnaLabel ?? (isYieldBearingWallet(item) ? 'Sin TNA' : provider.name),
                invested: money(item.valArs, item.valUsd),
                value: money(item.valArs, item.valUsd),
                pnl: money(interestArs, interestUsd),
            })

            catPnlArs += interestArs
            catPnlUsd += interestUsd
        }
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))

    // Detect empty-state: TOTAL=0 but yield accounts with TNA+balance exist
    let walletEmptyStateHint = false
    if (catPnlArs === 0) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                if (isYieldBearingWallet(item) && item.valArs > 0 && item.yieldMeta?.tna && item.yieldMeta.tna > 0) {
                    walletEmptyStateHint = true
                    break
                }
            }
            if (walletEmptyStateHint) break
        }
    }

    return { items, catPnlArs, catPnlUsd, walletEmptyStateHint }
}

/**
 * Build wallet items for a time period using TNA-based interest estimation.
 * Uses the compound interest formula over the period days.
 * NON-yield wallets show result = 0.
 */
function buildWalletItemsPeriod(
    portfolio: PortfolioV2,
    periodDays: number,
    startISO: string,
    endISO: string,
    movements: Movement[],
    fxContext: ResultsFlowFxContext,
): {
    items: ResultsCategoryItem[]
    catPnlArs: number
    catPnlUsd: number
    isEstimated: boolean
} | null {
    const rubro = portfolio.rubros.find((r) => r.id === 'wallets')
    if (!rubro) return null

    const fx = portfolio.fx.officialSell > 0 ? portfolio.fx.officialSell : (portfolio.fx.mepSell > 0 ? portfolio.fx.mepSell : 1)
    const items: ResultsCategoryItem[] = []
    let catPnlArs = 0
    let catPnlUsd = 0
    let isEstimated = false

    const interestByAccount = new Map<string, { ars: number; usd: number }>()
    for (const movement of movements) {
        if (movement.type !== 'INTEREST') continue
        if (!isMovementInRange(movement.datetimeISO, startISO, endISO)) continue

        const converted = convertMovementAmountToArsUsdEq(movement, fxContext)
        const current = interestByAccount.get(movement.accountId) ?? { ars: 0, usd: 0 }
        current.ars += converted.ars
        current.usd += converted.usdEq
        interestByAccount.set(movement.accountId, current)
    }

    const accountInterestClaimed = new Set<string>()

    for (const provider of rubro.providers) {
        for (const item of provider.items) {
            let interestArs = 0
            let interestUsd = 0
            let tnaLabel: string | undefined

            if (isYieldBearingWallet(item) && !accountInterestClaimed.has(item.accountId)) {
                const realInterest = interestByAccount.get(item.accountId)
                const hasRealInterest = interestByAccount.has(item.accountId)

                if (hasRealInterest) {
                    interestArs = realInterest?.ars ?? 0
                    interestUsd = realInterest?.usd ?? 0
                    tnaLabel = 'Interés real'
                } else if (item.yieldMeta?.tna && item.yieldMeta.tna > 0) {
                    interestArs = estimateWalletInterestArs(item.valArs, item.yieldMeta.tna, periodDays)
                    interestUsd = interestArs / fx
                    tnaLabel = `TNA ${item.yieldMeta.tna}% (Estimado)`
                    isEstimated = true
                } else {
                    tnaLabel = 'Sin TNA'
                }

                accountInterestClaimed.add(item.accountId)
            }

            items.push({
                id: item.id,
                title: item.label || item.symbol,
                subtitle: tnaLabel ?? provider.name,
                invested: money(item.valArs, item.valUsd),
                value: money(item.valArs, item.valUsd),
                pnl: money(interestArs, interestUsd),
            })

            catPnlArs += interestArs
            catPnlUsd += interestUsd
        }
    }

    items.sort((a, b) => Math.abs(b.pnl.ars ?? 0) - Math.abs(a.pnl.ars ?? 0))
    return { items, catPnlArs, catPnlUsd, isEstimated }
}

// ---------------------------------------------------------------------------
// TOTAL period — live PnL with wallet & PF overrides
// ---------------------------------------------------------------------------

function buildTotalFromPortfolio(
    portfolio: PortfolioV2,
    _snapshots: Snapshot[],
    now: Date,
): ResultsCardModel {
    const todayKey = toDateKey(now)

    const categories: ResultsCategoryRow[] = []
    let totalPnlArs = 0
    let totalPnlUsd = 0

    for (const cfg of RESULTS_CATEGORY_CONFIG) {
        // ── WALLETS special handling (interest, NOT balance variation) ──
        if (cfg.key === 'wallets') {
            const walletResult = buildWalletItemsTotal(portfolio)
            if (!walletResult) continue

            const { items, catPnlArs, catPnlUsd, walletEmptyStateHint } = walletResult

            categories.push({
                key: cfg.key,
                rubroId: cfg.rubroId,
                title: cfg.label,
                subtitle: `${items.length} ${cfg.sub}`,
                pnl: money(catPnlArs, catPnlUsd),
                items,
                tableLabels: WALLET_TABLE_LABELS,
                walletEmptyStateHint,
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

    const note = 'Total desde costo. Billeteras: intereses acumulados. PF: devengado.'

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
    movements: Movement[],
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
    const fxContext = buildFlowFxContext(portfolio)
    const netFlowsByRubro = computeNetFlowsByRubro(movements, fxContext, baseline.dateLocal, todayKey)

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

        // ── WALLETS: override with TNA-based interest estimation ──
        if (cfg.key === 'wallets') {
            const walletResult = buildWalletItemsPeriod(
                portfolio,
                PERIOD_DAYS[periodKey],
                baseline.dateLocal,
                todayKey,
                movements,
                fxContext,
            )
            if (walletResult && walletResult.items.length > 0) {
                categories.push({
                    key: cfg.key,
                    rubroId: cfg.rubroId,
                    title: cfg.label,
                    subtitle: `${walletResult.items.length} ${cfg.sub}`,
                    pnl: money(walletResult.catPnlArs, walletResult.catPnlUsd),
                    items: walletResult.items,
                    tableLabels: WALLET_TABLE_LABELS,
                    isEstimated: walletResult.isEstimated,
                })
                totalPnlArs += walletResult.catPnlArs
                totalPnlUsd += walletResult.catPnlUsd
                continue
            }
            // Fall through to default if no wallet items
        }

        // ── Default handling (CEDEARs, Crypto, FCI) ──
        const currentRubro = currentRubros[rubroId]
        const pastRubro = pastRubros[rubroId]
        const deltaArs = (currentRubro?.ars ?? 0) - (pastRubro?.ars ?? 0)
        const deltaUsd = (currentRubro?.usd ?? 0) - (pastRubro?.usd ?? 0)
        const netFlow = netFlowsByRubro.get(rubroId as 'wallets' | 'plazos' | 'cedears' | 'crypto' | 'fci')
        const catPnlArs = deltaArs - (netFlow?.ars ?? 0)
        const catPnlUsd = deltaUsd - (netFlow?.usdEq ?? 0)

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
        })

        totalPnlArs += catPnlArs
        totalPnlUsd += catPnlUsd
    }

    const meta: ResultsMeta = {
        snapshotStatus: 'ok',
        startISO: baseline.dateLocal,
        endISO: todayKey,
        asOfISO: portfolio.asOfISO,
        note: 'Resultado neto = Variación de valuación - Flujos netos del período.',
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
    movements?: Movement[]
    periodKey: ResultsPeriodKey
    now?: Date
}

export function computeResultsCardModel({
    portfolio,
    snapshots,
    movements = [],
    periodKey,
    now = new Date(),
}: ComputeResultsInput): ResultsCardModel {
    if (periodKey === 'TOTAL') {
        return buildTotalFromPortfolio(portfolio, snapshots, now)
    }

    return buildPeriodFromSnapshots(portfolio, snapshots, movements, periodKey, now)
}
