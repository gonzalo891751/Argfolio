/**
 * useAssetsResults — maps ResultsCardModel data to per-row lookup maps
 * for the /mis-activos-v2 page.
 *
 * Reuses computeResultsCardModel (same source as Dashboard) so numbers
 * are guaranteed to match.
 */

import { useMemo } from 'react'
import type { Movement, Snapshot } from '@/domain/types'
import type { PortfolioV2 } from '@/features/portfolioV2'
import {
    computeResultsCardModel,
    type ComputeResultsInput,
} from '@/features/dashboardV2/results-service'
import { buildSnapshotAssetKey } from '@/features/dashboardV2/snapshot-v2'
import type {
    Money,
    ResultsMeta,
    ResultsPeriodKey,
} from '@/features/dashboardV2/results-types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AssetsResultsMap {
    /** PnL per rubro (keyed by RubroId, e.g. 'wallets', 'cedears') */
    byRubroId: Record<string, Money>
    /** PnL per provider (keyed by provider.id / accountId) */
    byProviderId: Record<string, Money>
    /** PnL per item (keyed by portfolio item.id) */
    byItemId: Record<string, Money>
    /** Portfolio-wide total PnL */
    total: Money
    /** Snapshot status & metadata */
    meta: ResultsMeta
    /** Active period */
    periodKey: ResultsPeriodKey
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssetsResults(
    portfolio: PortfolioV2 | null | undefined,
    snapshots: Snapshot[],
    movements: Movement[],
    periodKey: ResultsPeriodKey,
): AssetsResultsMap | null {
    // Build reverse-lookup maps from portfolio hierarchy (stable across period changes)
    const { assetKeyToItemId, itemIdToProviderId } = useMemo(() => {
        const ak2item = new Map<string, string>()
        const item2prov = new Map<string, string>()

        if (!portfolio) return { assetKeyToItemId: ak2item, itemIdToProviderId: item2prov }

        for (const rubro of portfolio.rubros) {
            for (const provider of rubro.providers) {
                for (const item of provider.items) {
                    const assetKey = buildSnapshotAssetKey(item)
                    ak2item.set(assetKey, item.id)
                    item2prov.set(item.id, provider.id)
                }
            }
        }

        return { assetKeyToItemId: ak2item, itemIdToProviderId: item2prov }
    }, [portfolio])

    return useMemo(() => {
        if (!portfolio) return null

        const model = computeResultsCardModel({
            portfolio,
            snapshots,
            movements,
            periodKey,
        } satisfies ComputeResultsInput)

        const byRubroId: Record<string, Money> = {}
        const byProviderId: Record<string, Money> = {}
        const byItemId: Record<string, Money> = {}

        for (const cat of model.categories) {
            // Rubro-level
            byRubroId[cat.rubroId] = cat.pnl

            // Item-level + provider aggregation
            for (const resultItem of cat.items) {
                const pnlArs = resultItem.pnl.ars ?? 0
                const pnlUsd = resultItem.pnl.usd ?? 0

                // Resolve portfolio item.id
                // TOTAL + wallet/PF period items use item.id directly.
                // Time-period default rubros use assetKey format (contains ':').
                const isAssetKey = resultItem.id.includes(':')
                const portfolioItemId = isAssetKey
                    ? (assetKeyToItemId.get(resultItem.id) ?? resultItem.id)
                    : resultItem.id

                byItemId[portfolioItemId] = resultItem.pnl

                // Aggregate into provider bucket
                const providerId = itemIdToProviderId.get(portfolioItemId)
                if (providerId) {
                    const existing = byProviderId[providerId]
                    if (existing) {
                        byProviderId[providerId] = {
                            ars: (existing.ars ?? 0) + pnlArs,
                            usd: (existing.usd ?? 0) + pnlUsd,
                        }
                    } else {
                        byProviderId[providerId] = { ars: pnlArs, usd: pnlUsd }
                    }
                }
            }
        }

        return {
            byRubroId,
            byProviderId,
            byItemId,
            total: model.totals.pnl,
            meta: model.meta,
            periodKey,
        }
    }, [portfolio, snapshots, movements, periodKey, assetKeyToItemId, itemIdToProviderId])
}
