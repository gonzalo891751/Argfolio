import { db } from '@/db/schema'
import type { ManualPrice } from '@/domain/types'

export const manualPricesRepo = {
    async list(): Promise<ManualPrice[]> {
        return await db.manualPrices.toArray()
    },

    async get(instrumentId: string): Promise<ManualPrice | undefined> {
        return await db.manualPrices.get(instrumentId)
    },

    async set(price: ManualPrice): Promise<string> {
        return await db.manualPrices.put(price)
    },

    async delete(instrumentId: string): Promise<void> {
        return await db.manualPrices.delete(instrumentId)
    }
}
