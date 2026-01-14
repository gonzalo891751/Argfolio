import { db } from '../schema'
import type { Movement } from '@/domain/types'

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
        return db.movements.add(movement)
    },

    async update(id: string, updates: Partial<Movement>): Promise<void> {
        await db.movements.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        await db.movements.delete(id)
    },

    async deleteAll(): Promise<void> {
        await db.movements.clear()
    },
}
