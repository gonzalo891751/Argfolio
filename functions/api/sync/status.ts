import {
    ensureSyncSchema,
    getDatabase,
    isWriteEnabled,
    jsonResponse,
    optionsResponse,
    type SyncEnv,
} from '../_lib/sync'

interface SyncStatusCounts {
    accounts: number
    movements: number
    instruments: number
}

async function countRows(db: D1Database, table: 'accounts' | 'movements' | 'instruments'): Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) as count FROM ${table}`).first<{ count?: number }>()
    const value = row?.count
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    if (context.request.method === 'OPTIONS') {
        return optionsResponse()
    }

    if (context.request.method !== 'GET') {
        return jsonResponse({
            error: 'Method not allowed',
            details: `Unsupported method: ${context.request.method}`,
        }, 405)
    }

    const writeEnabled = isWriteEnabled(context.env)
    const emptyCounts: SyncStatusCounts = {
        accounts: 0,
        movements: 0,
        instruments: 0,
    }

    if (!context.env.DB) {
        return jsonResponse({
            ok: true,
            d1Bound: false,
            writeEnabled,
            counts: emptyCounts,
        })
    }

    try {
        const db = getDatabase(context.env)
        await ensureSyncSchema(db)

        const [accounts, movements, instruments] = await Promise.all([
            countRows(db, 'accounts'),
            countRows(db, 'movements'),
            countRows(db, 'instruments'),
        ])

        return jsonResponse({
            ok: true,
            d1Bound: true,
            writeEnabled,
            counts: {
                accounts,
                movements,
                instruments,
            },
        })
    } catch (error: any) {
        return jsonResponse({
            ok: true,
            d1Bound: true,
            writeEnabled,
            counts: emptyCounts,
            error: 'Failed to read sync status',
            details: error?.message || 'unknown_error',
        })
    }
}
