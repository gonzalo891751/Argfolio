import { db } from '../schema'
import type { Snapshot } from '@/domain/types'

export const snapshotsRepo = {
    async list(): Promise<Snapshot[]> {
        return db.snapshots.orderBy('dateLocal').reverse().toArray()
    },

    async get(id: string): Promise<Snapshot | undefined> {
        return db.snapshots.get(id)
    },

    async getByDate(dateLocal: string): Promise<Snapshot | undefined> {
        return db.snapshots.where('dateLocal').equals(dateLocal).first()
    },

    async create(snapshot: Snapshot): Promise<string> {
        return db.snapshots.add(snapshot)
    },

    async delete(id: string): Promise<void> {
        await db.snapshots.delete(id)
    },

    async getLatest(limit = 30): Promise<Snapshot[]> {
        return db.snapshots.orderBy('dateLocal').reverse().limit(limit).toArray()
    },
}
