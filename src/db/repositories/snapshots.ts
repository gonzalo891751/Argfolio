import { db } from '../schema'
import type { Snapshot } from '@/domain/types'
import { normalizeSnapshot } from './snapshot-utils'

export const snapshotsRepo = {
    async list(): Promise<Snapshot[]> {
        const snapshots = await db.snapshots.orderBy('dateLocal').reverse().toArray()
        return snapshots.map(normalizeSnapshot)
    },

    async get(id: string): Promise<Snapshot | undefined> {
        const snapshot = await db.snapshots.get(id)
        return snapshot ? normalizeSnapshot(snapshot) : undefined
    },

    async getByDate(dateLocal: string): Promise<Snapshot | undefined> {
        const snapshot = await db.snapshots.where('dateLocal').equals(dateLocal).first()
        return snapshot ? normalizeSnapshot(snapshot) : undefined
    },

    async create(snapshot: Snapshot): Promise<string> {
        return db.snapshots.add(normalizeSnapshot(snapshot))
    },

    async upsertByDate(snapshot: Snapshot): Promise<Snapshot> {
        const normalized = normalizeSnapshot(snapshot)
        const existing = await db.snapshots.where('dateLocal').equals(normalized.dateLocal).first()

        if (existing) {
            const merged: Snapshot = normalizeSnapshot({
                ...existing,
                ...normalized,
                id: existing.id,
            })
            await db.snapshots.put(merged)
            return merged
        }

        await db.snapshots.put(normalized)
        return normalized
    },

    async delete(id: string): Promise<void> {
        await db.snapshots.delete(id)
    },

    async getLatest(limit = 30): Promise<Snapshot[]> {
        const snapshots = await db.snapshots.orderBy('dateLocal').reverse().limit(limit).toArray()
        return snapshots.map(normalizeSnapshot)
    },

    async clearAll(): Promise<void> {
        await db.snapshots.clear()
    },
}
