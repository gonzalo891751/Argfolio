import { db } from '../schema'
import type { Instrument } from '@/domain/types'

export const instrumentsRepo = {
    async list(): Promise<Instrument[]> {
        return db.instruments.toArray()
    },

    async listByCategory(category: string): Promise<Instrument[]> {
        return db.instruments.where('category').equals(category).toArray()
    },

    async get(id: string): Promise<Instrument | undefined> {
        return db.instruments.get(id)
    },

    async getBySymbol(symbol: string): Promise<Instrument | undefined> {
        return db.instruments.where('symbol').equalsIgnoreCase(symbol).first()
    },

    async create(instrument: Instrument): Promise<string> {
        return db.instruments.add(instrument)
    },

    async update(id: string, updates: Partial<Instrument>): Promise<void> {
        await db.instruments.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        await db.instruments.delete(id)
    },
}
