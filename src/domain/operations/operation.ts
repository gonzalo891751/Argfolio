/**
 * Compound Operation helpers (Fase 3).
 *
 * Contract: every leg of a compound operation carries the same
 * `meta.operationId` (plus `meta.operationKind` / `meta.legRole`).
 * Legacy movements are grouped via fallbacks in priority order:
 *   meta.operationId → meta.transferGroupId → groupId → linkedMovementId.
 *
 * Nothing here mutates data: these are pure read-model helpers used by
 * Movimientos V2 (grouped rendering) and the detail drawer.
 */

import type { Movement, OperationKind, OperationStatus } from '@/domain/types'

/** Missing status is legacy-compatible and means posted. */
export function getMovementStatus(movement: Movement): OperationStatus {
    return movement.meta?.operationStatus ?? 'posted'
}

/** Only posted (or legacy status-less) movements affect normal calculations. */
export function isMovementActive(movement: Movement): boolean {
    return getMovementStatus(movement) === 'posted'
}

/** Shared guard for every portfolio/read-model engine. */
export function filterActiveMovements(movements: Movement[]): Movement[] {
    return movements.filter(isMovementActive)
}

/** Resolve the grouping key for a movement, honoring legacy fields. */
export function getOperationId(m: Movement): string | null {
    return (
        m.meta?.operationId
        ?? m.meta?.transferGroupId
        ?? m.groupId
        ?? m.relatedMovementId
        ?? m.linkedMovementId
        ?? null
    )
}

/** True when this movement is part of a multi-leg operation group. */
export function belongsToOperation(m: Movement, allById?: Map<string, Movement>): boolean {
    if (getOperationId(m)) return true
    // A movement can also be referenced by another leg's linkedMovementId
    if (allById) {
        for (const other of allById.values()) {
            if (other.id !== m.id && (other.linkedMovementId === m.id || other.relatedMovementId === m.id)) {
                return true
            }
        }
    }
    return false
}

export interface OperationGroup {
    operationId: string
    kind: OperationKind | 'unknown'
    /** Legs sorted by datetime ascending */
    legs: Movement[]
    /** Representative datetime (first leg) */
    datetimeISO: string
    status: 'posted' | 'voided' | 'superseded' | 'mixed'
}

interface OperationComponent {
    operationId: string
    legs: Movement[]
}

/**
 * Build connected operation components.
 *
 * Legacy `linkedMovementId` / `relatedMovementId` values are pointers to a
 * movement id, not necessarily group ids. A simple group-by therefore leaves
 * the referenced parent as a singleton. The disjoint-set below joins both
 * directions while preserving the explicit operation/group ids used by newer
 * movements.
 */
function buildOperationComponents(movements: Movement[]): OperationComponent[] {
    const parent = movements.map((_, index) => index)
    const byMovementId = new Map(movements.map((movement, index) => [movement.id, index]))
    const byGroupingKey = new Map<string, number>()

    const find = (index: number): number => {
        let root = index
        while (parent[root] !== root) root = parent[root]
        while (parent[index] !== index) {
            const next = parent[index]
            parent[index] = root
            index = next
        }
        return root
    }
    const union = (left: number, right: number) => {
        const leftRoot = find(left)
        const rightRoot = find(right)
        if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
    }
    const joinGroupingKey = (key: string | undefined, index: number) => {
        if (!key) return
        const existing = byGroupingKey.get(key)
        if (existing == null) byGroupingKey.set(key, index)
        else union(index, existing)
    }

    movements.forEach((movement, index) => {
        joinGroupingKey(movement.meta?.operationId, index)
        joinGroupingKey(movement.meta?.transferGroupId, index)
        joinGroupingKey(movement.groupId, index)

        for (const linkedId of [movement.relatedMovementId, movement.linkedMovementId]) {
            if (!linkedId) continue
            const linkedIndex = byMovementId.get(linkedId)
            if (linkedIndex != null) union(index, linkedIndex)
            else joinGroupingKey(linkedId, index)
        }
    })

    const byRoot = new Map<number, Movement[]>()
    movements.forEach((movement, index) => {
        const root = find(index)
        const legs = byRoot.get(root)
        if (legs) legs.push(movement)
        else byRoot.set(root, [movement])
    })

    return [...byRoot.values()].map(legs => {
        const operationId = legs.find(leg => leg.meta?.operationId)?.meta?.operationId
            ?? legs.find(leg => leg.meta?.transferGroupId)?.meta?.transferGroupId
            ?? legs.find(leg => leg.groupId)?.groupId
            ?? legs.find(leg => leg.relatedMovementId)?.relatedMovementId
            ?? legs.find(leg => leg.linkedMovementId)?.linkedMovementId
            ?? legs[0].id
        return { operationId, legs }
    })
}

export interface GroupedMovements {
    /** Multi-leg operations keyed by operationId */
    groups: OperationGroup[]
    /** Movements that don't belong to any group */
    singles: Movement[]
}

/** Infer the operation kind from explicit meta or legacy movement shapes. */
export function inferOperationKind(legs: Movement[]): OperationKind | 'unknown' {
    // Explicit contract wins
    for (const leg of legs) {
        if (leg.meta?.operationKind) return leg.meta.operationKind
    }

    const types = new Set(legs.map(l => l.type))

    // Legacy wallet transfer: TRANSFER_OUT + TRANSFER_IN pair
    if (types.has('TRANSFER_OUT') || types.has('TRANSFER_IN')) return 'transfer'

    // Legacy crypto sale with auto USDT credit: SELL + BUY in same group
    if (types.has('SELL') && types.has('BUY')) return 'swap'
    if (types.has('BUY') || types.has('SELL')) return 'trade'
    if (types.has('INTEREST') || types.has('DIVIDEND')) return 'income'
    if (types.has('FEE')) return 'fee'

    return 'unknown'
}

/**
 * Group movements by operation. Movements sharing an operation id
 * (new contract or legacy groupId/transferGroupId) with 2+ legs become
 * an OperationGroup; everything else stays as a single row.
 */
export function groupMovementsByOperation(movements: Movement[]): GroupedMovements {
    const singles: Movement[] = []
    const groups: OperationGroup[] = []
    for (const { operationId, legs } of buildOperationComponents(movements)) {
        if (legs.length < 2) {
            // A "group" of one is just a normal movement (e.g. orphan leg)
            singles.push(...legs)
            continue
        }
        const sorted = [...legs].sort(
            (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
        )
        const explicitStatuses = new Set(sorted.map(getMovementStatus))
        const status = explicitStatuses.size > 1
            ? 'mixed'
            : explicitStatuses.values().next().value ?? 'posted'
        groups.push({
            operationId,
            kind: inferOperationKind(sorted),
            legs: sorted,
            datetimeISO: sorted[0].datetimeISO,
            status,
        })
    }

    return { groups, singles }
}

/** Find all sibling legs of a movement (including itself) within a list. */
export function findOperationLegs(m: Movement, movements: Movement[]): Movement[] {
    const component = buildOperationComponents(movements)
        .find(({ legs }) => legs.some(leg => leg.id === m.id))
    return component?.legs ?? [m]
}

/** Generate a new operation id (uuid). */
export function newOperationId(): string {
    return crypto.randomUUID()
}
