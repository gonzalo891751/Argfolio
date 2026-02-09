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

interface AccountPayload {
    id: string
    name: string
    kind: string
    defaultCurrency: string
}

function toIsoNow(): string {
    return new Date().toISOString()
}

async function upsertAccount(db: D1Database, account: AccountPayload): Promise<void> {
    const now = toIsoNow()
    await db.prepare(`
INSERT INTO accounts (id, name, type, currency, payload_json, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  currency = excluded.currency,
  payload_json = excluded.payload_json,
  updated_at = excluded.updated_at
`)
        .bind(
            account.id,
            account.name,
            account.kind,
            account.defaultCurrency,
            JSON.stringify(account),
            now,
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
                .prepare('SELECT payload_json FROM accounts ORDER BY updated_at DESC')
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
            const account = await parseJsonBody<AccountPayload>(context.request)
            if (!account?.id || !account?.name || !account?.kind || !account?.defaultCurrency) {
                return jsonResponse({ error: 'Missing required fields: id, name, kind, defaultCurrency' }, 400)
            }

            await upsertAccount(db, account)
            return jsonResponse({ ok: true, id: account.id })
        }

        if (method === 'DELETE') {
            const url = new URL(context.request.url)
            const id = url.searchParams.get('id')
            if (!id) {
                return jsonResponse({ error: 'Missing id' }, 400)
            }

            await db.prepare('DELETE FROM accounts WHERE id = ?1').bind(id).run()
            return jsonResponse({ ok: true, id })
        }

        return jsonResponse({ error: 'Method not allowed' }, 405)
    } catch (error: any) {
        return jsonResponse({
            error: 'Failed to handle accounts sync',
            details: error?.message || 'unknown_error',
        }, 500)
    }
}

