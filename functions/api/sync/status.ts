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
    snapshots: number
}

function trimText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength)}...`
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
        snapshots: 0,
    }

    console.log('[sync][status] start', {
        hasDb: Boolean(context.env.DB),
        writeEnabled,
    })

    if (!context.env.DB) {
        console.log('[sync][status] done (no db binding)', { counts: emptyCounts })
        return jsonResponse({
            ok: true,
            d1Bound: false,
            writeEnabled,
            counts: emptyCounts,
        })
    }

    let stage = 'schema'
    try {
        const db = getDatabase(context.env)
        let schemaError = ''
        console.log('[sync][status] schema ensure start')
        try {
            await ensureSyncSchema(db)
            console.log('[sync][status] schema ensure done')
        } catch (error: any) {
            schemaError = trimText(error?.message || 'unknown_error', 500)
            console.log('[sync][status] schema ensure failed', { stage: 'schema', error: schemaError })
        }

        const details: string[] = []
        const counts: SyncStatusCounts = {
            accounts: 0,
            movements: 0,
            instruments: 0,
            snapshots: 0,
        }
        if (schemaError) details.push(`stage=schema: ${schemaError}`)

        stage = 'counts'
        console.log('[sync][status] counting...')
        try {
            const a = await db.prepare('SELECT COUNT(*) AS c FROM accounts').first<{ c?: number | string }>()
            const parsed = Number(a?.c ?? 0)
            counts.accounts = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        } catch (error: any) {
            const message = trimText(error?.message || 'unknown_error', 500)
            details.push(`stage=counts.accounts: ${message}`)
            counts.accounts = 0
        }

        try {
            const m = await db.prepare('SELECT COUNT(*) AS c FROM movements').first<{ c?: number | string }>()
            const parsed = Number(m?.c ?? 0)
            counts.movements = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        } catch (error: any) {
            const message = trimText(error?.message || 'unknown_error', 500)
            details.push(`stage=counts.movements: ${message}`)
            counts.movements = 0
        }

        try {
            const i = await db.prepare('SELECT COUNT(*) AS c FROM instruments').first<{ c?: number | string }>()
            const parsed = Number(i?.c ?? 0)
            counts.instruments = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        } catch (error: any) {
            const message = trimText(error?.message || 'unknown_error', 500)
            details.push(`stage=counts.instruments: ${message}`)
            counts.instruments = 0
        }

        try {
            const s = await db.prepare('SELECT COUNT(*) AS c FROM snapshots').first<{ c?: number | string }>()
            const parsed = Number(s?.c ?? 0)
            counts.snapshots = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
        } catch (error: any) {
            const message = trimText(error?.message || 'unknown_error', 500)
            details.push(`stage=counts.snapshots: ${message}`)
            counts.snapshots = 0
        }

        console.log('[sync][status] done', {
            counts,
            errors: details.length,
        })

        return jsonResponse({
            ok: true,
            d1Bound: true,
            writeEnabled,
            counts,
            ...(details.length > 0
                ? {
                    error: 'Failed to read sync status',
                    details: details.join(' | '),
                }
                : {}),
        })
    } catch (error: any) {
        const details = trimText(error?.message || 'unknown_error', 500)
        console.log('[sync][status] fatal error', { stage, error: details })
        return jsonResponse({
            ok: true,
            d1Bound: true,
            writeEnabled,
            counts: emptyCounts,
            error: 'Failed to read sync status',
            details: `stage=${stage}: ${details}`,
        })
    }
}
