import { describe, expect, it } from 'vitest'
import type { Movement } from '@/domain/types'
import {
    applyRepairPlanWithStore,
    rollbackRepairPlanWithStore,
    type RepairMovementStore,
} from './apply-repair-plan'
import { buildBinanceNexoRepairPlan } from './binance-nexo-repair-plan'
import { reconcileCryptoBalances } from './crypto-reconciliation'
import { reclassifyCryptoBalanceAdjustment } from './crypto-balance-adjustment'
import { buildRepairFixtureMovements, repairAccounts, repairInstruments, repairTargets } from './repair-test-fixtures'

class MemoryRepairStore implements RepairMovementStore {
    private data: Map<string, Movement>
    private putCount = 0

    constructor(movements: Movement[], private readonly failOnPut?: number) {
        this.data = new Map(movements.map(movement => [movement.id, structuredClone(movement)]))
    }

    list(): Promise<Movement[]> {
        return Promise.resolve([...this.data.values()].map(movement => structuredClone(movement)))
    }

    put(movement: Movement): Promise<unknown> {
        this.putCount += 1
        if (this.failOnPut === this.putCount) throw new Error('injected failure')
        this.data.set(movement.id, structuredClone(movement))
        return Promise.resolve(movement.id)
    }

    async transaction<T>(task: () => Promise<T>): Promise<T> {
        const snapshot = new Map([...this.data].map(([id, movement]) => [id, structuredClone(movement)]))
        try {
            return await task()
        } catch (error) {
            this.data = snapshot
            throw error
        }
    }
}

function fixturePlan() {
    const movements = buildRepairFixtureMovements()
    return {
        movements,
        plan: buildBinanceNexoRepairPlan({
            movements,
            accounts: repairAccounts,
            instruments: repairInstruments,
            targets: repairTargets,
            occurredAtISO: '2026-07-09T12:00:00.000Z',
        }),
    }
}

function classifiedProposed(plan: ReturnType<typeof buildBinanceNexoRepairPlan>): Movement[] {
    return plan.proposedMovements.map(movement => movement.meta?.requiresManualReview
        ? reclassifyCryptoBalanceAdjustment(movement, 'manual_correction')
        : movement
    )
}

describe('apply repair plan', () => {
    it('backs up, supersedes without deleting, inserts proposed movements and reaches targets', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        let backupCalls = 0
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: classifiedProposed(plan),
            createBackup: async () => {
                backupCalls += 1
                return 'backup.json'
            },
        })

        expect(result.ok).toBe(true)
        expect(backupCalls).toBe(1)
        expect(result.supersededCount).toBe(3)
        expect(result.createdCount).toBe(plan.proposedMovements.length)

        const stored = await store.list()
        expect(stored).toHaveLength(movements.length + plan.proposedMovements.length)
        expect(stored.filter(movement => movement.meta?.operationStatus === 'superseded')).toHaveLength(3)
        expect(movements.every(original => stored.some(current => current.id === original.id))).toBe(true)

        const rows = reconcileCryptoBalances({
            movements: stored,
            accounts: repairAccounts,
            instruments: repairInstruments,
            targets: repairTargets,
        })
        expect(rows.every(row => row.status === 'ok')).toBe(true)
    })

    it('rolls the entire transaction back after an intermediate write failure', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements, 2)
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: classifiedProposed(plan),
            createBackup: async () => 'backup.json',
        })

        expect(result.ok).toBe(false)
        expect(result.errors?.[0]).toContain('se revirtió')
        expect(await store.list()).toEqual(movements)
    })

    it('refuses to write anything when backup creation fails', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: classifiedProposed(plan),
            createBackup: async () => { throw new Error('download blocked') },
        })
        expect(result.ok).toBe(false)
        expect(result.errors?.[0]).toContain('falló el backup')
        expect(await store.list()).toEqual(movements)
    })

    it('rejects a stale plan when any movement metadata changed after the dry-run', async () => {
        const { movements, plan } = fixturePlan()
        const changed = movements.map((movement, index) => index === 0
            ? { ...movement, notes: 'edited after dry-run' }
            : movement
        )
        const store = new MemoryRepairStore(changed)
        let backupCalls = 0
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: classifiedProposed(plan),
            createBackup: async () => {
                backupCalls += 1
                return 'backup.json'
            },
        })

        expect(result.ok).toBe(false)
        expect(result.errors?.[0]).toContain('cambiaron desde el dry-run')
        expect(backupCalls).toBe(0)
        expect(await store.list()).toEqual(changed)
    })

    it('requires confirmation and rejects unclassified adjustments before backup', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        let backupCalls = 0
        const backup = async () => {
            backupCalls += 1
            return 'backup.json'
        }

        const unconfirmed = await applyRepairPlanWithStore(plan, store, {
            confirmed: false,
            proposedMovements: classifiedProposed(plan),
            createBackup: backup,
        })
        expect(unconfirmed.errors?.[0]).toContain('confirmación explícita')

        const unclassified = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            createBackup: backup,
        })
        expect(unclassified.errors?.[0]).toContain('clasificación explícita')
        expect(backupCalls).toBe(0)
        expect(await store.list()).toEqual(movements)
    })

    it('accepts the exact reward reclassification and persists it with zero cost', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        const proposed = plan.proposedMovements.map(movement => movement.meta?.requiresManualReview
            ? reclassifyCryptoBalanceAdjustment(
                movement,
                movement.ticker === 'NEXO' ? 'reward' : 'manual_correction',
            )
            : movement
        )
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: proposed,
            createBackup: async () => 'backup.json',
        })

        expect(result.ok).toBe(true)
        const reward = (await store.list()).find(movement =>
            movement.meta?.repairPlanId === plan.id
            && movement.ticker === 'NEXO'
            && movement.meta?.adjustmentReason === 'reward'
        )
        expect(reward).toMatchObject({
            type: 'INTEREST',
            unitPrice: 0,
            totalAmount: 0,
            totalUSD: 0,
            meta: { operationKind: 'income', costPolicy: 'zero_cost', requiresManualReview: false },
        })
    })

    it('rejects financial or protected metadata tampering after the dry-run', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        const proposed = classifiedProposed(plan)
        proposed[0] = {
            ...proposed[0],
            type: 'SELL',
            meta: { ...proposed[0].meta, operationKind: 'trade' },
        }
        let backupCalls = 0
        const result = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: proposed,
            createBackup: async () => {
                backupCalls += 1
                return 'backup.json'
            },
        })

        expect(result.ok).toBe(false)
        expect(result.errors?.[0]).toContain('cambió importes o identidad')
        expect(backupCalls).toBe(0)
        expect(await store.list()).toEqual(movements)
    })

    it('rolls back without deleting: voids new legs and reactivates superseded legacy rows', async () => {
        const { movements, plan } = fixturePlan()
        const store = new MemoryRepairStore(movements)
        const applyResult = await applyRepairPlanWithStore(plan, store, {
            confirmed: true,
            proposedMovements: classifiedProposed(plan),
            createBackup: async () => 'before-apply.json',
        })
        expect(applyResult.ok).toBe(true)

        const rollbackResult = await rollbackRepairPlanWithStore(plan, store, {
            confirmed: true,
            createBackup: async () => 'before-rollback.json',
        })
        expect(rollbackResult.ok).toBe(true)
        expect(rollbackResult.reactivatedCount).toBe(3)
        expect(rollbackResult.voidedCount).toBe(plan.proposedMovements.length)

        const stored = await store.list()
        expect(stored).toHaveLength(movements.length + plan.proposedMovements.length)
        expect(stored
            .filter(movement => movement.meta?.repairPlanId === plan.id)
            .every(movement => movement.meta?.operationStatus === 'voided')).toBe(true)
        expect(stored
            .filter(movement => movement.meta?.supersededByOperationId === plan.id)
            .every(movement => movement.meta?.operationStatus === 'posted')).toBe(true)
    })
})
