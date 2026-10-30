import { db } from '../schema'
import type { Instrument } from '@/domain/types'

/**
 * CEDEARs trade in pesos (BYMA quotes are ARS), but the first demo instruments
 * were stored as USD-native, which valued them as dollar assets. Read them as
 * ARS-native; the stored record is left untouched.
 */
export function normalizeInstrument(instrument: Instrument): Instrument {
    if (instrument.category === 'CEDEAR' && instrument.nativeCurrency !== 'ARS') {
        return { ...instrument, nativeCurrency: 'ARS' }
    }
    return instrument
}

function normalizeOptional(instrument: Instrument | undefined): Instrument | undefined {
    return instrument ? normalizeInstrument(instrument) : undefined
}

export const instrumentsRepo = {
    async list(): Promise<Instrument[]> {
        return (await db.instruments.toArray()).map(normalizeInstrument)
    },

    async listByCategory(category: string): Promise<Instrument[]> {
        return (await db.instruments.where('category').equals(category).toArray()).map(normalizeInstrument)
    },

    async get(id: string): Promise<Instrument | undefined> {
        return normalizeOptional(await db.instruments.get(id))
    },

    async getBySymbol(symbol: string): Promise<Instrument | undefined> {
        return normalizeOptional(await db.instruments.where('symbol').equalsIgnoreCase(symbol).first())
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
