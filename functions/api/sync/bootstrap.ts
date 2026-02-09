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

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    if (context.request.method === 'OPTIONS') {
        return optionsResponse()
    }

    if (context.request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    try {
        const db = getDatabase(context.env)
        await ensureSyncSchema(db)

        const [accountsResult, movementsResult, instrumentsResult] = await Promise.all([
            db.prepare('SELECT payload_json FROM accounts ORDER BY updated_at DESC').all<{ payload_json: string }>(),
            db.prepare('SELECT payload_json FROM movements ORDER BY date DESC').all<{ payload_json: string }>(),
            db.prepare('SELECT payload_json FROM instruments ORDER BY updated_at DESC').all<{ payload_json: string }>(),
        ])

        return new Response(JSON.stringify({
            asOfISO: new Date().toISOString(),
            accounts: parseRows(accountsResult.results ?? []),
            movements: parseRows(movementsResult.results ?? []),
            instruments: parseRows(instrumentsResult.results ?? []),
        }), {
            headers: {
                ...corsHeaders(),
                'Cache-Control': 'no-store',
            },
        })
    } catch (error: any) {
        return jsonResponse({
            error: 'Failed to bootstrap sync snapshot',
            details: error?.message || 'unknown_error',
        }, 500)
    }
}

