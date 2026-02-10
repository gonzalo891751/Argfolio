import { corsHeaders, ensureSyncSchema, getDatabase, jsonResponse, optionsResponse, type SyncEnv } from '../_lib/sync'

function parseRows<T>(rows: Array<{ payload_json: string }>): T[] {
    return rows
        .map((row) => {
            try {
                return JSON.parse(row.payload_json) as T
            } catch {
                return null
            }
        })
        .filter((row): row is T => row != null)
}

function nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now()
    }
    return Date.now()
}

function toDurationMs(startMs: number): number {
    return Math.max(0, Math.round(nowMs() - startMs))
}

function createBootstrapPayload({
    asOfISO,
    accounts,
    movements,
    instruments,
    durationMs,
    degraded = false,
}: {
    asOfISO: string
    accounts: unknown[]
    movements: unknown[]
    instruments: unknown[]
    durationMs: number
    degraded?: boolean
}) {
    return {
        ok: true,
        degraded,
        asOfISO,
        serverTimeISO: asOfISO,
        snapshot: null,
        durationMs,
        accounts,
        movements,
        instruments,
    }
}

async function safeQueryRows<T>(db: D1Database, sql: string, dataset: string): Promise<T[]> {
    try {
        const result = await db.prepare(sql).all<{ payload_json: string }>()
        return parseRows<T>(result?.results ?? [])
    } catch (error: any) {
        console.warn('[sync/bootstrap] query failed; returning empty dataset', {
            stage: 'bootstrap-read',
            dataset,
            error: error?.message || 'unknown_error',
        })
        return []
    }
}

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    if (context.request.method === 'OPTIONS') {
        return optionsResponse()
    }

    if (context.request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const startedAtMs = nowMs()
    const asOfISO = new Date().toISOString()
    console.log('[sync/bootstrap] start', { hasDb: Boolean(context.env.DB) })

    let stage = 'schema'
    try {
        const db = getDatabase(context.env)
        console.log('[sync/bootstrap] schema ensure start')
        try {
            await ensureSyncSchema(db)
            console.log('[sync/bootstrap] schema ensure done')
        } catch (error: any) {
            console.warn('[sync/bootstrap] schema ensure failed; continuing with empty-safe reads', {
                stage: 'schema',
                error: error?.message || 'unknown_error',
            })
        }

        stage = 'bootstrap-read'
        const [accounts, movements, instruments] = await Promise.all([
            safeQueryRows(db, 'SELECT payload_json FROM accounts ORDER BY updated_at DESC', 'accounts'),
            safeQueryRows(db, 'SELECT payload_json FROM movements ORDER BY date DESC', 'movements'),
            safeQueryRows(db, 'SELECT payload_json FROM instruments ORDER BY updated_at DESC', 'instruments'),
        ])

        const durationMs = toDurationMs(startedAtMs)
        console.log('[sync/bootstrap] done', {
            durationMs,
            accounts: accounts.length,
            movements: movements.length,
            instruments: instruments.length,
            degraded: false,
        })
        console.info('[sync/bootstrap] snapshot served', {
            durationMs,
            accounts: accounts.length,
            movements: movements.length,
            instruments: instruments.length,
            degraded: false,
        })

        return new Response(JSON.stringify(createBootstrapPayload({
            asOfISO,
            accounts,
            movements,
            instruments,
            durationMs,
        })), {
            headers: {
                ...corsHeaders(),
                'Cache-Control': 'no-store',
            },
        })
    } catch (error: any) {
        const durationMs = toDurationMs(startedAtMs)
        console.log('[sync/bootstrap] done with degraded payload', { durationMs })
        console.error('[sync/bootstrap] failed; returning empty bootstrap payload', {
            stage,
            durationMs,
            error: error?.message || 'unknown_error',
            stack: error?.stack,
        })

        return new Response(JSON.stringify(createBootstrapPayload({
            asOfISO,
            accounts: [],
            movements: [],
            instruments: [],
            durationMs,
            degraded: true,
        })), {
            status: 200,
            headers: {
                ...corsHeaders(),
                'Cache-Control': 'no-store',
            },
        })
    }
}
