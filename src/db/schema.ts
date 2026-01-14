import Dexie, { Table } from 'dexie'
import type { Movement, Instrument, Account, Snapshot, Debt } from '@/domain/types'

export class ArgfolioDatabase extends Dexie {
    movements!: Table<Movement, string>
    instruments!: Table<Instrument, string>
    accounts!: Table<Account, string>
    snapshots!: Table<Snapshot, string>
    debts!: Table<Debt, string>
    manualPrices!: Table<{ instrumentId: string; price: number; updatedAtISO: string }, string>

    constructor() {
        super('argfolio-db')

        this.version(1).stores({
            movements: 'id, datetimeISO, type, instrumentId, accountId, tradeCurrency',
            instruments: 'id, symbol, category, nativeCurrency',
            accounts: 'id, name, kind',
            snapshots: 'id, dateLocal, createdAtISO',
            debts: 'id, status, dueDateLocal',
        })

        this.version(2).stores({
            manualPrices: 'instrumentId',
        })
    }
}

export const db = new ArgfolioDatabase()

// Check if database has been seeded
export async function isDatabaseSeeded(): Promise<boolean> {
    const count = await db.accounts.count()
    return count > 0
}
