import { db } from '../schema'
import type { Debt } from '@/domain/types'

export const debtsRepo = {
    async list(): Promise<Debt[]> {
        return db.debts.toArray()
    },

    async listActive(): Promise<Debt[]> {
        return db.debts.where('status').equals('ACTIVE').toArray()
    },

    async get(id: string): Promise<Debt | undefined> {
        return db.debts.get(id)
    },

    async create(debt: Debt): Promise<string> {
        return db.debts.add(debt)
    },

    async update(id: string, updates: Partial<Debt>): Promise<void> {
        await db.debts.update(id, updates)
    },

    async delete(id: string): Promise<void> {
        await db.debts.delete(id)
    },

    async applyPayment(id: string, amount: number): Promise<void> {
        const debt = await db.debts.get(id)
        if (!debt) throw new Error('Debt not found')

        const newBalance = Math.max(0, debt.currentBalance - amount)
        const newStatus = newBalance === 0 ? 'PAID' : debt.status

        await db.debts.update(id, {
            currentBalance: newBalance,
            status: newStatus,
        })
    },

    async getNextDue(): Promise<Debt | undefined> {
        const today = new Date().toISOString().split('T')[0]
        const active = await db.debts
            .where('status')
            .equals('ACTIVE')
            .and(d => d.dueDateLocal >= today)
            .sortBy('dueDateLocal')
        return active[0]
    },
}
