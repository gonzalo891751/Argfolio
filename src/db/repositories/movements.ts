import { db } from '../schema'
import type { Movement } from '@/domain/types'
import {
    isRemoteSyncEnabled,
    syncRemoteMovementCreate,
    syncRemoteMovementDelete,
    syncRemoteMovementUpdate,
} from '@/sync/remote-sync'

export const movementsRepo = {
    async list(): Promise<Movement[]> {
        return db.movements.orderBy('datetimeISO').reverse().toArray()
    },

    async listByDateRange(from: string, to: string): Promise<Movement[]> {
        return db.movements
            .where('datetimeISO')
            .between(from, to, true, true)
            .reverse()
            .toArray()
    },

    async listByInstrument(instrumentId: string): Promise<Movement[]> {
        return db.movements
            .where('instrumentId')
            .equals(instrumentId)
            .reverse()
            .toArray()
    },

    async listByAccount(accountId: string): Promise<Movement[]> {
        return db.movements
            .where('accountId')
            .equals(accountId)
            .reverse()
            .toArray()
    },

    async get(id: string): Promise<Movement | undefined> {
        return db.movements.get(id)
    },

    async create(movement: Movement): Promise<string> {
        if (isRemoteSyncEnabled()) {
            try {
                await syncRemoteMovementCreate(movement)
            } catch {
                // Fallback local-only when offline/read-only.
            }
        }
        return db.movements.put(movement)
    },

    async update(id: string, updates: Partial<Movement>): Promise<void> {
        const existing = await db.movements.get(id)
        if (isRemoteSyncEnabled() && existing) {
            try {
                await syncRemoteMovementUpdate({ ...existing, ...updates, id })
            } catch {
                // Fallback local-only when offline/read-only.
            }
        }
        await db.movements.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        // Cascade Delete for Plazos Fijos
        const m = await db.movements.get(id)
        const idsToDelete: string[] = [id]
        if (m && m.pf?.kind === 'constitute') {
            // Find orphans
            const related = await db.movements.filter(x => x.pf?.kind === 'redeem' && x.pf?.pfId === id).toArray()
            const relatedIds = related.map(r => r.id)
            if (relatedIds.length > 0) {
                idsToDelete.push(...relatedIds)
            }
        }

        if (isRemoteSyncEnabled()) {
            await Promise.allSettled(
                idsToDelete.map(async (movementId) => {
                    try {
                        await syncRemoteMovementDelete(movementId)
                    } catch {
                        // Fallback local-only when offline/read-only.
                    }
                })
            )
        }

        await db.movements.bulkDelete(idsToDelete)
    },

    async deleteAll(): Promise<void> {
        await db.movements.clear()
    },
}
