import { db } from '../schema'
import type { Account } from '@/domain/types'
import {
    isRemoteSyncEnabled,
    syncRemoteAccountCreate,
    syncRemoteAccountDelete,
    syncRemoteAccountUpdate,
} from '@/sync/remote-sync'

export const accountsRepo = {
    async list(): Promise<Account[]> {
        return db.accounts.toArray()
    },

    async get(id: string): Promise<Account | undefined> {
        return db.accounts.get(id)
    },

    async create(account: Account): Promise<string> {
        if (isRemoteSyncEnabled()) {
            try {
                await syncRemoteAccountCreate(account)
            } catch (error) {
                console.warn('[accountsRepo] D1 sync failed for create:', account.id, error)
            }
        }
        return db.accounts.put(account)
    },

    async update(id: string, updates: Partial<Account>): Promise<void> {
        const existing = await db.accounts.get(id)
        if (isRemoteSyncEnabled() && existing) {
            try {
                await syncRemoteAccountUpdate({ ...existing, ...updates, id })
            } catch (error) {
                console.warn('[accountsRepo] D1 sync failed for update:', id, error)
            }
        }
        await db.accounts.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        if (isRemoteSyncEnabled()) {
            try {
                await syncRemoteAccountDelete(id)
            } catch (error) {
                console.warn('[accountsRepo] D1 sync failed for delete:', id, error)
            }
        }
        await db.accounts.delete(id)
    },
}
