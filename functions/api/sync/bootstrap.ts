import { corsHeaders, ensureSyncSchema, getDatabase, jsonResponse, optionsResponse, type SyncEnv } from '../_lib/sync'

const SNAPSHOT_BOOTSTRAP_DAYS = 180
const SNAPSHOT_SMALL_TABLE_MAX_ROWS = 180

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

function dateDaysAgoISO(days: number): string {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - days)
    return date.toISOString().slice(0, 10)
}

function createBootstrapPayload({
    asOfISO,
    accounts,
    movements,
    instruments,
    snapshots,
    durationMs,
    degraded = false,
}: {
    asOfISO: string
    accounts: unknown[]
    movements: unknown[]
    instruments: unknown[]
    snapshots?: unknown[]
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
        snapshots: Array.isArray(snapshots) ? snapshots : [],
    }
}

async function safeQueryRows<T>(
    db: D1Database,
    sql: string,
    dataset: string,
    bindings?: unknown[]
): Promise<T[]> {
    try {
        const statement = db.prepare(sql)
        const bound = Array.isArray(bindings) && bindings.length > 0
            ? statement.bind(...bindings)
            : statement
        const result = await bound.all<{ payload_json: string }>()
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

async function safeCountTable(db: D1Database, table: string): Promise<number> {
    try {
        const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).first<{ c?: number | string }>()
        const parsed = Number(row?.c ?? 0)
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    } catch (error: any) {
        console.warn('[sync/bootstrap] count failed; assuming empty dataset', {
            stage: 'bootstrap-read',
            dataset: table,
            error: error?.message || 'unknown_error',
        })
        return 0
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
        const snapshotsCount = await safeCountTable(db, 'snapshots')
        const snapshotsSql = snapshotsCount > SNAPSHOT_SMALL_TABLE_MAX_ROWS
            ? 'SELECT payload_json FROM snapshots WHERE date >= ?1 ORDER BY date DESC'
            : 'SELECT payload_json FROM snapshots ORDER BY date DESC'
        const snapshotsBindings = snapshotsCount > SNAPSHOT_SMALL_TABLE_MAX_ROWS
            ? [dateDaysAgoISO(SNAPSHOT_BOOTSTRAP_DAYS)]
            : []

        const [accounts, movements, instruments, snapshots] = await Promise.all([
            safeQueryRows(db, 'SELECT payload_json FROM accounts ORDER BY updated_at DESC', 'accounts'),
            safeQueryRows(db, 'SELECT payload_json FROM movements ORDER BY date DESC', 'movements'),
            safeQueryRows(db, 'SELECT payload_json FROM instruments ORDER BY updated_at DESC', 'instruments'),
            safeQueryRows(db, snapshotsSql, 'snapshots', snapshotsBindings),
        ])

        const durationMs = toDurationMs(startedAtMs)
        console.log('[sync/bootstrap] done', {
            durationMs,
            accounts: accounts.length,
            movements: movements.length,
            instruments: instruments.length,
            snapshots: snapshots.length,
            degraded: false,
        })
        console.info('[sync/bootstrap] snapshot served', {
            durationMs,
            accounts: accounts.length,
            movements: movements.length,
            instruments: instruments.length,
            snapshots: snapshots.length,
            degraded: false,
        })

        return new Response(JSON.stringify(createBootstrapPayload({
            asOfISO,
            accounts,
            movements,
            instruments,
            snapshots,
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
            snapshots: [],
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
