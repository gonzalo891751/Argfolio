import type { FxType, Snapshot } from '@/domain/types'
import type { PortfolioV2, ItemV2, RubroV2 } from '@/features/portfolioV2'

export const SNAPSHOT_SOURCE_V2: Snapshot['source'] = 'v2'
export const SNAPSHOT_AUTO_STORAGE_KEY = 'argfolio.snapshots.auto.v2'
/** Marks a snapshot saved while some positions had no quote. */
export const SNAPSHOT_PARTIAL_NOTE = 'precios-incompletos'

export function isPartialSnapshot(snapshot: Pick<Snapshot, 'meta'>): boolean {
    return snapshot.meta?.notes === SNAPSHOT_PARTIAL_NOTE
}

/**
 * Whether today's stored snapshot should be replaced by a fresher capture.
 * The day keeps its latest value (closing value), but a complete capture is
 * never overwritten by one with missing quotes.
 */
export function shouldReplaceDaySnapshot(
    existing: Pick<Snapshot, 'totalARS' | 'totalUSD' | 'meta' | 'createdAtISO'> | undefined,
    next: Pick<Snapshot, 'totalARS' | 'totalUSD' | 'meta' | 'createdAtISO'>,
    minIntervalMs = 10 * 60 * 1000,
): boolean {
    if (!existing) return true
    if (existing.totalARS === 0 && next.totalARS > 0) return true
    if (!isPartialSnapshot(existing) && isPartialSnapshot(next)) return false
    if (isPartialSnapshot(existing) && !isPartialSnapshot(next)) return true

    const sameTotals = Math.abs(existing.totalARS - next.totalARS) < 0.5
        && Math.abs(existing.totalUSD - next.totalUSD) < 0.01
    if (sameTotals) return false

    const elapsed = Date.parse(next.createdAtISO) - Date.parse(existing.createdAtISO)
    return !Number.isFinite(elapsed) || elapsed >= minIntervalMs
}

function sanitizeSegment(raw: string): string {
    return raw
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

/**
 * Calendar day of the snapshot in the user's local time zone.
 * (Using toISOString() here filed every capture after 21:00 in Argentina
 * under the next day.)
 */
export function toSnapshotDateKey(date: Date = new Date()): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function normalizeAccountId(accountId: string): string {
    return sanitizeSegment(accountId.toLowerCase())
}

function normalizeSymbol(symbol: string): string {
    return sanitizeSegment(symbol.toUpperCase())
}

function normalizeInstrumentId(instrumentId: string): string {
    return sanitizeSegment(instrumentId.toLowerCase())
}

function getAssetKindPrefix(kind: ItemV2['kind']): string {
    switch (kind) {
        case 'cedear':
            return 'cedear'
        case 'crypto':
        case 'stable':
            return 'crypto'
        case 'fci':
            return 'fci'
        case 'plazo_fijo':
            return 'pf'
        case 'wallet_yield':
        case 'cash_ars':
        case 'cash_usd':
            return 'wallet'
        default:
            return 'asset'
    }
}

export function buildSnapshotAssetKey(item: ItemV2): string {
    const prefix = getAssetKindPrefix(item.kind)
    const account = normalizeAccountId(item.accountId)

    if (item.kind === 'fci' && item.instrumentId) {
        return `${prefix}:${account}:${normalizeInstrumentId(item.instrumentId)}`
    }

    if (item.kind === 'plazo_fijo') {
        return `${prefix}:${account}:${normalizeInstrumentId(item.id)}`
    }

    const symbolOrId = item.symbol || item.instrumentId || item.id
    return `${prefix}:${account}:${normalizeSymbol(symbolOrId)}`
}

function buildRubroBreakdown(rubros: RubroV2[]): Record<string, { ars: number; usd: number }> {
    const breakdown: Record<string, { ars: number; usd: number }> = {}
    for (const rubro of rubros) {
        breakdown[rubro.id] = {
            ars: rubro.totals.ars,
            usd: rubro.totals.usd,
        }
    }
    return breakdown
}

function buildItemBreakdown(rubros: RubroV2[]): Record<string, { rubroId: string; ars: number; usd: number }> {
    const breakdown: Record<string, { rubroId: string; ars: number; usd: number }> = {}

    for (const rubro of rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                const assetKey = buildSnapshotAssetKey(item)
                const existing = breakdown[assetKey]
                if (!existing) {
                    breakdown[assetKey] = {
                        rubroId: rubro.id,
                        ars: item.valArs,
                        usd: item.valUsd,
                    }
                    continue
                }

                breakdown[assetKey] = {
                    rubroId: existing.rubroId || rubro.id,
                    ars: existing.ars + item.valArs,
                    usd: existing.usd + item.valUsd,
                }
            }
        }
    }

    return breakdown
}

function resolveFxUsed(portfolio: PortfolioV2, baseFx: FxType): number {
    switch (baseFx) {
        case 'OFICIAL':
            return portfolio.fx.officialSell || portfolio.fx.officialBuy || 0
        case 'CCL':
            return portfolio.fx.cclSell || portfolio.fx.cclBuy || 0
        case 'CRIPTO':
            return portfolio.fx.cryptoSell || portfolio.fx.cryptoBuy || 0
        case 'MEP':
        default:
            return portfolio.fx.mepSell || portfolio.fx.mepBuy || 0
    }
}

export function buildSnapshotFromPortfolioV2(
    portfolio: PortfolioV2,
    baseFx: FxType = 'MEP',
    now: Date = new Date()
): Snapshot {
    const dateLocal = toSnapshotDateKey(now)
    const rubroBreakdown = buildRubroBreakdown(portfolio.rubros)
    const itemBreakdown = buildItemBreakdown(portfolio.rubros)

    return {
        id: `snapshot-v2-${dateLocal}`,
        dateLocal,
        totalARS: portfolio.kpis.totalArs,
        totalUSD: portfolio.kpis.totalUsd,
        fxUsed: {
            usdArs: resolveFxUsed(portfolio, baseFx),
            type: baseFx,
        },
        source: SNAPSHOT_SOURCE_V2,
        breakdownRubros: rubroBreakdown,
        breakdownItems: itemBreakdown,
        meta: {
            fxRef: `MEP:${portfolio.fx.mepSell.toFixed(2)}|OFI:${portfolio.fx.officialSell.toFixed(2)}|CR:${portfolio.fx.cryptoSell.toFixed(2)}`,
            ...(countMissingPriceItems(portfolio) > 0 ? { notes: SNAPSHOT_PARTIAL_NOTE } : {}),
        },
        createdAtISO: now.toISOString(),
    }
}

// ---------------------------------------------------------------------------
// Portfolio readiness guard - prevents saving snapshots with $0 totals
// when the portfolio data has not fully loaded yet.
// ---------------------------------------------------------------------------

export type SnapshotSkipReason =
    | 'LOADING'
    | 'NO_FX'
    | 'TOTAL_ZERO_WITH_ASSETS'
    | 'MISSING_PRICES'
    | null

export interface SnapshotReadinessResult {
    ready: boolean
    reason: SnapshotSkipReason
}

export interface SnapshotEvidence {
    accountsCount?: number
    movementsCount?: number
    instrumentsCount?: number
}

export interface SnapshotReadinessOptions {
    /**
     * Accept a portfolio where some positions have no quote. Used only after
     * waiting for prices, so a coin that never gets quoted cannot block the
     * daily history forever.
     */
    allowMissingPrices?: boolean
}

/** Positions held (qty > 0) whose market price is missing, so their value is unknown. */
export function countMissingPriceItems(portfolio: PortfolioV2): number {
    let count = 0
    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                if (item.valueMissing) count += 1
            }
        }
    }
    return count
}

function hasYieldEvidence(portfolio: PortfolioV2): boolean {
    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            for (const item of provider.items) {
                if (item.kind === 'wallet_yield') return true
                if (item.kind === 'cash_ars' && item.yieldMeta != null) return true
            }
        }
    }
    return false
}

/**
 * Determines whether the portfolio data is trustworthy enough to persist as a
 * snapshot. A truly empty portfolio (no items and no evidence) is a valid
 * 0-total snapshot, but 0 totals with evidence usually indicate a race.
 */
export function isPortfolioReadyForSnapshot(
    portfolio: PortfolioV2 | null,
    evidence?: SnapshotEvidence,
    options: SnapshotReadinessOptions = {},
): SnapshotReadinessResult {
    if (!portfolio) {
        return { ready: false, reason: 'LOADING' }
    }

    if (portfolio.isLoading) {
        return { ready: false, reason: 'LOADING' }
    }

    if (portfolio.fx.mepSell === 0 && portfolio.fx.officialSell === 0) {
        return { ready: false, reason: 'NO_FX' }
    }

    let itemCount = 0
    for (const rubro of portfolio.rubros) {
        for (const provider of rubro.providers) {
            itemCount += provider.items.length
        }
    }

    const hasZeroTotals = portfolio.kpis.totalArs === 0 && portfolio.kpis.totalUsd === 0
    const hasExternalEvidence = (evidence?.accountsCount ?? 0) > 0
        || (evidence?.movementsCount ?? 0) > 0
        || (evidence?.instrumentsCount ?? 0) > 0
        || hasYieldEvidence(portfolio)

    if ((itemCount > 0 || hasExternalEvidence) && hasZeroTotals) {
        return { ready: false, reason: 'TOTAL_ZERO_WITH_ASSETS' }
    }

    // A position without quote is valued at 0: saving now would record a fake drop.
    if (!options.allowMissingPrices && countMissingPriceItems(portfolio) > 0) {
        return { ready: false, reason: 'MISSING_PRICES' }
    }

    return { ready: true, reason: null }
}

export function readAutoSnapshotsEnabled(): boolean {
    const stored = localStorage.getItem(SNAPSHOT_AUTO_STORAGE_KEY)
    if (stored === null) return true
    return stored === 'true'
}

export function writeAutoSnapshotsEnabled(enabled: boolean): void {
    localStorage.setItem(SNAPSHOT_AUTO_STORAGE_KEY, String(enabled))
}
