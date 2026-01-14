import { db } from '@/db/schema'
import type { MappedRow } from './mapper'
import type { Movement, Instrument, Account, AssetCategory, Currency } from '@/domain/types'
import { suggestInstrumentId, suggestAccountId } from './validator'

export interface ImportResult {
    batchId: string
    movementsCreated: number
    instrumentsCreated: string[]
    accountsCreated: string[]
    errors: string[]
}

/**
 * Generate unique batch ID for import
 */
export function generateBatchId(): string {
    return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Create missing instruments
 */
export async function createMissingInstruments(
    symbols: Set<string>,
    category: AssetCategory = 'CRYPTO',
    currency: Currency = 'USD'
): Promise<Instrument[]> {
    const created: Instrument[] = []

    for (const symbol of symbols) {
        const id = suggestInstrumentId(symbol)
        const instrument: Instrument = {
            id,
            symbol: symbol.toUpperCase(),
            name: symbol.toUpperCase(),
            category,
            nativeCurrency: currency,
            priceKey: id,
        }
        await db.instruments.put(instrument)
        created.push(instrument)
    }

    return created
}

/**
 * Create missing accounts
 */
export async function createMissingAccounts(
    names: Set<string>
): Promise<Account[]> {
    const created: Account[] = []

    for (const name of names) {
        const id = suggestAccountId(name)
        const account: Account = {
            id,
            name: name.trim(),
            kind: 'EXCHANGE',
            defaultCurrency: 'USD',
        }
        await db.accounts.put(account)
        created.push(account)
    }

    return created
}

/**
 * Import validated rows as movements
 */
export async function importMovements(
    rows: MappedRow[],
    batchId: string,
    instruments: Map<string, Instrument>,
    accounts: Map<string, Account>
): Promise<ImportResult> {
    const result: ImportResult = {
        batchId,
        movementsCreated: 0,
        instrumentsCreated: [],
        accountsCreated: [],
        errors: [],
    }

    // Build lookup maps by symbol/name
    const instrumentBySymbol = new Map(
        Array.from(instruments.values()).map((i) => [i.symbol.toUpperCase(), i])
    )
    const accountByName = new Map(
        Array.from(accounts.values()).map((a) => [a.name.toLowerCase(), a])
    )

    const movements: Movement[] = []

    for (const row of rows) {
        try {
            const instrument = instrumentBySymbol.get(row.symbol.toUpperCase())
            const account = accountByName.get(row.account.toLowerCase())

            if (!instrument) {
                result.errors.push(`Instrumento no encontrado: ${row.symbol} (fila ${row.rowIndex + 2})`)
                continue
            }

            if (!account) {
                result.errors.push(`Cuenta no encontrada: ${row.account} (fila ${row.rowIndex + 2})`)
                continue
            }

            const movement: Movement = {
                id: `${batchId}-${row.rowIndex}`,
                datetimeISO: row.datetimeISO,
                type: row.type,
                instrumentId: instrument.id,
                accountId: account.id,
                quantity: row.quantity,
                unitPrice: row.unitPrice,
                tradeCurrency: row.tradeCurrency,
                totalAmount: row.totalAmount,
                feeAmount: row.feeAmount,
                feeCurrency: row.feeCurrency,
                fxAtTrade: row.fxAtTrade,
                notes: row.notes,
                importBatchId: batchId,
            }

            movements.push(movement)
        } catch (error) {
            result.errors.push(`Error en fila ${row.rowIndex + 2}: ${error}`)
        }
    }

    // Bulk insert movements
    if (movements.length > 0) {
        await db.movements.bulkPut(movements)
        result.movementsCreated = movements.length
    }

    return result
}

/**
 * Undo an import by deleting all movements with matching batchId
 */
export async function undoImport(batchId: string): Promise<number> {
    const movements = await db.movements
        .where('importBatchId')
        .equals(batchId)
        .toArray()

    const ids = movements.map((m) => m.id)
    await db.movements.bulkDelete(ids)

    return ids.length
}

/**
 * Get list of import batches
 */
export async function getImportBatches(): Promise<Array<{ batchId: string; count: number; date: string }>> {
    const movements = await db.movements
        .filter((m) => !!m.importBatchId)
        .toArray()

    const batches = new Map<string, { count: number; date: string }>()

    for (const mov of movements) {
        if (!mov.importBatchId) continue
        const existing = batches.get(mov.importBatchId)
        if (existing) {
            existing.count++
        } else {
            batches.set(mov.importBatchId, {
                count: 1,
                date: mov.datetimeISO,
            })
        }
    }

    return Array.from(batches.entries())
        .map(([batchId, data]) => ({ batchId, ...data }))
        .sort((a, b) => b.date.localeCompare(a.date))
}
