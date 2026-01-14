import { db } from '../schema'
import type { Account } from '@/domain/types'

export const accountsRepo = {
    async list(): Promise<Account[]> {
        return db.accounts.toArray()
    },

    async get(id: string): Promise<Account | undefined> {
        return db.accounts.get(id)
    },

    async create(account: Account): Promise<string> {
        return db.accounts.add(account)
    },

    async update(id: string, updates: Partial<Account>): Promise<void> {
        await db.accounts.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        await db.accounts.delete(id)
    },
}
