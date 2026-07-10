import type { Movement } from '@/domain/types'
import { db } from '@/db/schema'
import { downloadLocalBackup } from '@/domain/sync/local-backup'
import { syncMovementsBatch } from '@/sync/remote-sync'
import { computeRepairMovementFingerprint, type RepairPlan } from './binance-nexo-repair-plan'
import { getOperationId } from './operation'
import {
    reclassifyCryptoBalanceAdjustment,
    type CryptoAdjustmentReason,
} from './crypto-balance-adjustment'

export interface ApplyRepairResult {
    ok: boolean
    backupFileName?: string
    supersededCount: number
    createdCount: number
    operationIds: string[]
    touchedMovementIds: string[]
    errors?: string[]
}

export interface RollbackRepairResult {
    ok: boolean
    backupFileName?: string
    voidedCount: number
    reactivatedCount: number
    touchedMovementIds: string[]
    errors?: string[]
}

export interface RepairMovementStore {
    list(): Promise<Movement[]>
    put(movement: Movement): Promise<unknown>
    transaction<T>(task: () => Promise<T>): Promise<T>
}

export interface ApplyRepairPlanOptions {
    confirmed: boolean
    candidateIdsToSupersede?: string[]
    proposedMovements?: Movement[]
    nowISO?: string
    createBackup: () => Promise<string>
    syncAppliedMovements?: (movements: Movement[]) => Promise<{ ok: boolean; failedCount: number }>
}

export interface RollbackRepairPlanOptions {
    confirmed: boolean
    nowISO?: string
    createBackup: () => Promise<string>
    syncRolledBackMovements?: (movements: Movement[]) => Promise<{ ok: boolean; failedCount: number }>
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function isAllowedAdjustmentReclassification(original: Movement, candidate: Movement): boolean {
    if (!original.meta?.requiresManualReview) return false
    const reason = candidate.meta?.adjustmentReason as CryptoAdjustmentReason | undefined
    if (!reason || reason === 'unknown') return false
    try {
        const expected = reclassifyCryptoBalanceAdjustment(original, reason)
        return candidate.type === expected.type
            && candidate.meta?.operationKind === expected.meta?.operationKind
            && candidate.meta?.legRole === expected.meta?.legRole
            && candidate.meta?.direction === expected.meta?.direction
            && candidate.meta?.costPolicy === expected.meta?.costPolicy
            && candidate.meta?.requiresManualReview === false
    } catch {
        return false
    }
}

export async function applyRepairPlanWithStore(
    plan: RepairPlan,
    store: RepairMovementStore,
    options: ApplyRepairPlanOptions,
): Promise<ApplyRepairResult> {
    const emptyResult: ApplyRepairResult = {
        ok: false,
        supersededCount: 0,
        createdCount: 0,
        operationIds: [],
        touchedMovementIds: [],
    }

    if (plan.mode !== 'dry_run') {
        return { ...emptyResult, errors: ['Sólo se puede aplicar un plan generado en modo dry_run.'] }
    }
    if (!options.confirmed) {
        return { ...emptyResult, errors: ['Falta la confirmación explícita para aplicar el dry-run.'] }
    }

    const allowedCandidateIds = new Set(plan.candidatesToSupersede.map(movement => movement.id))
    const candidateIds = options.candidateIdsToSupersede ?? plan.candidateIdsToSupersede
    if (candidateIds.some(id => !allowedCandidateIds.has(id))) {
        return { ...emptyResult, errors: ['La selección contiene candidatos que no pertenecen al dry-run.'] }
    }

    const allowedProposedIds = new Set(plan.proposedMovements.map(movement => movement.id))
    const allowedProposedById = new Map(plan.proposedMovements.map(movement => [movement.id, movement]))
    const proposedMovements = options.proposedMovements ?? plan.proposedMovements
    if (proposedMovements.some(movement => !allowedProposedIds.has(movement.id))) {
        return { ...emptyResult, errors: ['La selección contiene movimientos no incluidos en el dry-run.'] }
    }
    const alteredFinancialLeg = proposedMovements.find(movement => {
        const original = allowedProposedById.get(movement.id)
        if (!original) return true
        const reclassificationRequested = original.meta?.requiresManualReview === true
            && movement.meta?.adjustmentReason != null
            && movement.meta.adjustmentReason !== 'unknown'
        const validReclassification = reclassificationRequested
            && isAllowedAdjustmentReclassification(original, movement)
        const protectedMetadataChanged = movement.meta?.operationKind !== original.meta?.operationKind
            || movement.meta?.legRole !== original.meta?.legRole
            || movement.meta?.direction !== original.meta?.direction
            || movement.meta?.adjustmentReason !== original.meta?.adjustmentReason
            || movement.meta?.costPolicy !== original.meta?.costPolicy
            || movement.meta?.requiresManualReview !== original.meta?.requiresManualReview
            || movement.meta?.repairPlanId !== original.meta?.repairPlanId
        const typeChangedUnexpectedly = reclassificationRequested
            ? !validReclassification
            : movement.type !== original.type
        const metadataChangedUnexpectedly = reclassificationRequested
            ? !validReclassification
            : protectedMetadataChanged
        return typeChangedUnexpectedly
            || metadataChangedUnexpectedly
            || movement.assetClass !== original.assetClass
            || movement.accountId !== original.accountId
            || movement.instrumentId !== original.instrumentId
            || movement.ticker !== original.ticker
            || movement.quantity !== original.quantity
            || movement.unitPrice !== original.unitPrice
            || movement.totalAmount !== original.totalAmount
            || movement.totalUSD !== original.totalUSD
            || movement.totalARS !== original.totalARS
            || movement.tradeCurrency !== original.tradeCurrency
            || movement.datetimeISO !== original.datetimeISO
            || getOperationId(movement) !== getOperationId(original)
    })
    if (alteredFinancialLeg) {
        return {
            ...emptyResult,
            errors: [`La pata ${alteredFinancialLeg.id} cambió importes o identidad desde el dry-run.`],
        }
    }
    const unclassifiedAdjustment = proposedMovements.find(movement =>
        movement.meta?.requiresManualReview
        || movement.meta?.adjustmentReason === 'unknown'
    )
    if (unclassifiedAdjustment) {
        return {
            ...emptyResult,
            errors: [`El ajuste ${unclassifiedAdjustment.id} todavía requiere una clasificación explícita.`],
        }
    }

    const initialMovements = await store.list()
    if (computeRepairMovementFingerprint(initialMovements) !== plan.sourceMovementFingerprint) {
        return {
            ...emptyResult,
            errors: ['Los movimientos cambiaron desde el dry-run. Generá un plan nuevo antes de aplicar.'],
        }
    }

    let backupFileName: string
    try {
        backupFileName = await options.createBackup()
        if (!backupFileName) throw new Error('La exportación no devolvió un nombre de archivo.')
    } catch (error) {
        return {
            ...emptyResult,
            errors: [`No se aplicó nada porque falló el backup: ${errorMessage(error)}`],
        }
    }

    const nowISO = options.nowISO ?? new Date().toISOString()
    const updated: Movement[] = []
    const created: Movement[] = []

    try {
        await store.transaction(async () => {
            const current = await store.list()
            if (computeRepairMovementFingerprint(current) !== plan.sourceMovementFingerprint) {
                throw new Error('Los movimientos cambiaron durante la confirmación; se canceló la transacción.')
            }

            const currentById = new Map(current.map(movement => [movement.id, movement]))
            for (const id of candidateIds) {
                const movement = currentById.get(id)
                if (!movement) throw new Error(`No existe el candidato ${id}.`)
                const superseded: Movement = {
                    ...movement,
                    meta: {
                        ...movement.meta,
                        operationStatus: 'superseded',
                        supersededByOperationId: plan.id,
                        supersededAtISO: nowISO,
                        supersededReason: 'binance_nexo_repair',
                    },
                }
                await store.put(superseded)
                updated.push(superseded)
            }

            for (const movement of proposedMovements) {
                if (currentById.has(movement.id)) {
                    throw new Error(`El movimiento propuesto ${movement.id} ya existe.`)
                }
                const posted: Movement = {
                    ...movement,
                    meta: {
                        ...movement.meta,
                        operationStatus: 'posted',
                        repairPlanId: plan.id,
                    },
                }
                await store.put(posted)
                created.push(posted)
            }
        })
    } catch (error) {
        return {
            ...emptyResult,
            backupFileName,
            errors: [`La transacción se revirtió: ${errorMessage(error)}`],
        }
    }

    const errors: string[] = []
    if (options.syncAppliedMovements && updated.length + created.length > 0) {
        try {
            const syncResult = await options.syncAppliedMovements([...updated, ...created])
            if (!syncResult.ok) {
                errors.push(
                    `La reparación local se aplicó, pero ${syncResult.failedCount} movimientos no se sincronizaron. `
                    + 'Usá “Forzar reconciliación” antes de editar desde otro dispositivo.',
                )
            }
        } catch (error) {
            errors.push(`La reparación local se aplicó, pero falló el sync: ${errorMessage(error)}`)
        }
    }

    const operationIds = [...new Set(created.map(getOperationId).filter((id): id is string => Boolean(id)))]
    return {
        ok: true,
        backupFileName,
        supersededCount: updated.length,
        createdCount: created.length,
        operationIds,
        touchedMovementIds: [...updated, ...created].map(movement => movement.id),
        errors: errors.length > 0 ? errors : undefined,
    }
}

const dexieRepairStore: RepairMovementStore = {
    list: () => db.movements.toArray(),
    put: movement => db.movements.put(movement),
    transaction: task => db.transaction('rw', db.movements, task),
}

export function applyRepairPlanToDatabase(
    plan: RepairPlan,
    options: Omit<ApplyRepairPlanOptions, 'createBackup' | 'syncAppliedMovements'>,
): Promise<ApplyRepairResult> {
    return applyRepairPlanWithStore(plan, dexieRepairStore, {
        ...options,
        createBackup: () => downloadLocalBackup('argfolio-backup-pre-reparacion-binance-nexo'),
        syncAppliedMovements: syncMovementsBatch,
    })
}

export async function rollbackRepairPlanWithStore(
    plan: RepairPlan,
    store: RepairMovementStore,
    options: RollbackRepairPlanOptions,
): Promise<RollbackRepairResult> {
    const emptyResult: RollbackRepairResult = {
        ok: false,
        voidedCount: 0,
        reactivatedCount: 0,
        touchedMovementIds: [],
    }
    if (!options.confirmed) {
        return { ...emptyResult, errors: ['Falta la confirmación explícita para revertir la reparación.'] }
    }

    const current = await store.list()
    const reactivatableIds = new Set(current
        .filter(movement =>
            movement.meta?.operationStatus === 'superseded'
            && movement.meta?.supersededByOperationId === plan.id
        )
        .map(movement => movement.id))
    const voidableIds = new Set(current
        .filter(movement =>
            movement.meta?.operationStatus === 'posted'
            && movement.meta?.repairPlanId === plan.id
        )
        .map(movement => movement.id))

    if (reactivatableIds.size + voidableIds.size === 0) {
        return { ...emptyResult, errors: ['No se encontraron efectos activos de este plan para revertir.'] }
    }

    let backupFileName: string
    try {
        backupFileName = await options.createBackup()
        if (!backupFileName) throw new Error('La exportación no devolvió un nombre de archivo.')
    } catch (error) {
        return {
            ...emptyResult,
            errors: [`No se revirtió nada porque falló el backup: ${errorMessage(error)}`],
        }
    }

    const nowISO = options.nowISO ?? new Date().toISOString()
    const reactivated: Movement[] = []
    const voided: Movement[] = []

    try {
        await store.transaction(async () => {
            const latestById = new Map((await store.list()).map(movement => [movement.id, movement]))
            for (const id of reactivatableIds) {
                const movement = latestById.get(id)
                if (!movement
                    || movement.meta?.operationStatus !== 'superseded'
                    || movement.meta?.supersededByOperationId !== plan.id) {
                    throw new Error(`El movimiento legacy ${id} cambió antes del rollback.`)
                }
                const posted: Movement = {
                    ...movement,
                    meta: {
                        ...movement.meta,
                        operationStatus: 'posted',
                        reactivatedAtISO: nowISO,
                        rollbackOfRepairPlanId: plan.id,
                    },
                }
                await store.put(posted)
                reactivated.push(posted)
            }

            for (const id of voidableIds) {
                const movement = latestById.get(id)
                if (!movement
                    || movement.meta?.operationStatus !== 'posted'
                    || movement.meta?.repairPlanId !== plan.id) {
                    throw new Error(`La pata nueva ${id} cambió antes del rollback.`)
                }
                const voidedMovement: Movement = {
                    ...movement,
                    meta: {
                        ...movement.meta,
                        operationStatus: 'voided',
                        voidedAtISO: nowISO,
                        voidedReason: 'rollback_binance_nexo_repair',
                        rollbackOfRepairPlanId: plan.id,
                    },
                }
                await store.put(voidedMovement)
                voided.push(voidedMovement)
            }
        })
    } catch (error) {
        return {
            ...emptyResult,
            backupFileName,
            errors: [`La transacción de rollback se revirtió: ${errorMessage(error)}`],
        }
    }

    const errors: string[] = []
    const changed = [...reactivated, ...voided]
    if (options.syncRolledBackMovements && changed.length > 0) {
        try {
            const syncResult = await options.syncRolledBackMovements(changed)
            if (!syncResult.ok) {
                errors.push(`El rollback local se aplicó, pero ${syncResult.failedCount} movimientos no se sincronizaron.`)
            }
        } catch (error) {
            errors.push(`El rollback local se aplicó, pero falló el sync: ${errorMessage(error)}`)
        }
    }

    return {
        ok: true,
        backupFileName,
        voidedCount: voided.length,
        reactivatedCount: reactivated.length,
        touchedMovementIds: changed.map(movement => movement.id),
        errors: errors.length > 0 ? errors : undefined,
    }
}

export function rollbackRepairPlanFromDatabase(
    plan: RepairPlan,
    options: Omit<RollbackRepairPlanOptions, 'createBackup' | 'syncRolledBackMovements'>,
): Promise<RollbackRepairResult> {
    return rollbackRepairPlanWithStore(plan, dexieRepairStore, {
        ...options,
        createBackup: () => downloadLocalBackup('argfolio-backup-pre-rollback-binance-nexo'),
        syncRolledBackMovements: syncMovementsBatch,
    })
}
