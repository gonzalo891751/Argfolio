import {
    ensureSyncSchema,
    getDatabase,
    isWriteEnabled,
    jsonResponse,
    optionsResponse,
    type SyncEnv,
} from '../_lib/sync'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * DELETE /api/sync/snapshots?date=YYYY-MM-DD — removes one daily snapshot
 * (a "bad day" captured with wrong prices). Bearer token checked by the sync
 * middleware.
 */
export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    const method = context.request.method
    if (method === 'OPTIONS') {
        return optionsResponse()
    }
    if (method !== 'DELETE') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    try {
        if (!isWriteEnabled(context.env)) {
            return jsonResponse({ error: 'Sync write disabled' }, 403)
        }

        const date = new URL(context.request.url).searchParams.get('date') ?? ''
        if (!DATE_KEY.test(date)) {
            return jsonResponse({ error: 'Missing or invalid date (YYYY-MM-DD)' }, 400)
        }

        const db = getDatabase(context.env)
        await ensureSyncSchema(db)
        const result = await db.prepare('DELETE FROM snapshots WHERE date = ?1').bind(date).run()
        return jsonResponse({ ok: true, date, deleted: result.meta?.changes ?? 0 })
    } catch (error: any) {
        return jsonResponse({
            error: 'Failed to delete snapshot',
            details: error?.message || 'unknown_error',
        }, 500)
    }
}
