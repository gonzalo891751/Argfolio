import { db } from '@/db/schema'
import type { Account, Instrument, ManualPrice, Movement } from '@/domain/types'

const BACKUP_VERSION = 1

const PREFERENCE_KEYS = [
    'argfolio-fx-preference',
    'argfolio-settings-cedear-auto',
    'argfolio.trackCash',
    'argfolio.cryptoCostingMethod',
    'argfolio.autoAccrueWalletInterest',
    'argfolio.autoSettleFixedTerms',
] as const

export interface LocalBackupPayload {
    version: number
    exportedAtISO: string
    data: {
        accounts: Account[]
        instruments: Instrument[]
        movements: Movement[]
        manualPrices: ManualPrice[]
        preferences: Partial<Record<typeof PREFERENCE_KEYS[number], string>>
    }
}

function assertArray(value: unknown, field: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`Formato inválido: ${field} debe ser un array.`)
    }
    return value
}

export async function exportLocalBackup(): Promise<LocalBackupPayload> {
    const [accounts, instruments, movements, manualPrices] = await Promise.all([
        db.accounts.toArray(),
        db.instruments.toArray(),
        db.movements.toArray(),
        db.manualPrices.toArray(),
    ])

    const preferences: Partial<Record<typeof PREFERENCE_KEYS[number], string>> = {}
    for (const key of PREFERENCE_KEYS) {
        const value = localStorage.getItem(key)
        if (value != null) preferences[key] = value
    }

    return {
        version: BACKUP_VERSION,
        exportedAtISO: new Date().toISOString(),
        data: {
            accounts,
            instruments,
            movements,
            manualPrices,
            preferences,
        },
    }
}

export function parseBackupJson(raw: string): LocalBackupPayload {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        throw new Error('El archivo no es un JSON válido.')
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Formato inválido: contenido vacío.')
    }

    const payload = parsed as Partial<LocalBackupPayload>
    if (payload.version !== BACKUP_VERSION) {
        throw new Error(`Versión de backup no soportada: ${String(payload.version)}.`)
    }
    if (!payload.data || typeof payload.data !== 'object') {
        throw new Error('Formato inválido: falta bloque data.')
    }

    const data = payload.data as LocalBackupPayload['data']
    assertArray(data.accounts, 'data.accounts')
    assertArray(data.instruments, 'data.instruments')
    assertArray(data.movements, 'data.movements')
    assertArray(data.manualPrices, 'data.manualPrices')

    return {
        version: BACKUP_VERSION,
        exportedAtISO: typeof payload.exportedAtISO === 'string' ? payload.exportedAtISO : new Date().toISOString(),
        data: {
            accounts: data.accounts as Account[],
            instruments: data.instruments as Instrument[],
            movements: data.movements as Movement[],
            manualPrices: data.manualPrices as ManualPrice[],
            preferences: (data.preferences && typeof data.preferences === 'object')
                ? data.preferences as Partial<Record<typeof PREFERENCE_KEYS[number], string>>
                : {},
        },
    }
}

export async function importLocalBackup(payload: LocalBackupPayload): Promise<{
    accounts: number
    instruments: number
    movements: number
    manualPrices: number
}> {
    const { accounts, instruments, movements, manualPrices, preferences } = payload.data

    await db.transaction('rw', [db.accounts, db.instruments, db.movements, db.manualPrices], async () => {
        if (accounts.length > 0) await db.accounts.bulkPut(accounts)
        if (instruments.length > 0) await db.instruments.bulkPut(instruments)
        if (movements.length > 0) await db.movements.bulkPut(movements)
        if (manualPrices.length > 0) await db.manualPrices.bulkPut(manualPrices)
    })

    for (const key of PREFERENCE_KEYS) {
        const value = preferences[key]
        if (typeof value === 'string') {
            localStorage.setItem(key, value)
        }
    }

    return {
        accounts: accounts.length,
        instruments: instruments.length,
        movements: movements.length,
        manualPrices: manualPrices.length,
    }
}

