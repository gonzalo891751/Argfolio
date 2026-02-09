import {
    corsHeaders,
    ensureSyncSchema,
    getDatabase,
    isWriteEnabled,
    jsonResponse,
    optionsResponse,
    parseJsonBody,
    type SyncEnv,
} from './_lib/sync'

interface MovementPayload {
    id: string
    accountId: string
    instrumentId?: string
    datetimeISO: string
    type: string
    totalAmount: number
    tradeCurrency: string
    fxAtTrade?: number
    meta?: unknown
}

function toIsoNow(): string {
    return new Date().toISOString()
}

function toSafeAmount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function upsertMovement(db: D1Database, movement: MovementPayload): Promise<void> {
    const now = toIsoNow()
    const createdAt = movement.datetimeISO || now

    await db.prepare(`
INSERT INTO movements (
  id, account_id, instrument_id, date, kind, amount, currency, fx_at_trade, meta_json, payload_json, created_at, updated_at
)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
ON CONFLICT(id) DO UPDATE SET
  account_id = excluded.account_id,
  instrument_id = excluded.instrument_id,
  date = excluded.date,
  kind = excluded.kind,
  amount = excluded.amount,
  currency = excluded.currency,
  fx_at_trade = excluded.fx_at_trade,
  meta_json = excluded.meta_json,
  payload_json = excluded.payload_json,
  updated_at = excluded.updated_at
`)
        .bind(
            movement.id,
            movement.accountId,
            movement.instrumentId ?? null,
            movement.datetimeISO || now,
            movement.type,
            toSafeAmount(movement.totalAmount),
            movement.tradeCurrency,
            typeof movement.fxAtTrade === 'number' ? movement.fxAtTrade : null,
            JSON.stringify(movement.meta ?? null),
            JSON.stringify(movement),
            createdAt,
            now
        )
        .run()
}

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    const method = context.request.method
    if (method === 'OPTIONS') {
        return optionsResponse()
    }

    try {
        const db = getDatabase(context.env)
        await ensureSyncSchema(db)

        if (method === 'GET') {
            const result = await db
                .prepare('SELECT payload_json FROM movements ORDER BY date DESC')
                .all<{ payload_json: string }>()

            const rows = (result.results ?? [])
                .map((row) => {
                    try {
                        return JSON.parse(row.payload_json)
                    } catch {
                        return null
                    }
                })
                .filter((row) => row != null)

            return new Response(JSON.stringify({ items: rows }), {
                headers: {
                    ...corsHeaders(),
                    'Cache-Control': 'no-store',
                },
            })
        }

        if (!isWriteEnabled(context.env)) {
            return jsonResponse({
                error: 'Sync write disabled',
                hint: 'Set ARGFOLIO_SYNC_WRITE_ENABLED=1 after protecting the site with Cloudflare Access.',
            }, 403)
        }

        if (method === 'POST' || method === 'PUT') {
            const movement = await parseJsonBody<MovementPayload>(context.request)
            if (!movement?.id || !movement?.accountId) {
                return jsonResponse({ error: 'Missing required fields: id, accountId' }, 400)
            }

            await upsertMovement(db, movement)
            return jsonResponse({ ok: true, id: movement.id })
        }

        if (method === 'DELETE') {
            const url = new URL(context.request.url)
            const id = url.searchParams.get('id')
            if (!id) {
                return jsonResponse({ error: 'Missing id' }, 400)
            }

            await db.prepare('DELETE FROM movements WHERE id = ?1').bind(id).run()
            return jsonResponse({ ok: true, id })
        }

        return jsonResponse({ error: 'Method not allowed' }, 405)
    } catch (error: any) {
        return jsonResponse({
            error: 'Failed to handle movements sync',
            details: error?.message || 'unknown_error',
        }, 500)
    }
}

