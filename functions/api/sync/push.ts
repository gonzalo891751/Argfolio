import {
    ensureSyncSchema,
    getDatabase,
    isWriteEnabled,
    jsonResponse,
    optionsResponse,
    parseJsonBody,
    type SyncEnv,
} from '../_lib/sync'

interface AccountPayload {
    id: string
    name: string
    kind: string
    defaultCurrency: string
}

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

interface InstrumentPayload {
    id: string
    symbol: string
    category: string
    nativeCurrency: string
}

interface PushPayload {
    version?: number
    exportedAtISO?: string
    data?: {
        accounts?: AccountPayload[]
        movements?: MovementPayload[]
        instruments?: InstrumentPayload[]
        manualPrices?: unknown[]
        preferences?: Record<string, unknown>
    }
}

interface SerializedException {
    name: string
    message: string
    stack: string | null
}

function toIsoNow(): string {
    return new Date().toISOString()
}

function toSafeAmount(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toArray<T>(value: unknown, field: string): T[] {
    if (value == null) return []
    if (!Array.isArray(value)) {
        throw new Error(`Invalid payload: ${field} must be an array`)
    }
    return value as T[]
}

function trimText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength)}...`
}

function serializeException(error: unknown): SerializedException {
    if (error instanceof Error) {
        return {
            name: trimText(error.name || 'Error', 120),
            message: trimText(error.message || 'unknown_error', 1000),
            stack: typeof error.stack === 'string' ? trimText(error.stack, 2000) : null,
        }
    }

    const raw = (() => {
        try {
            return JSON.stringify(error)
        } catch {
            return String(error)
        }
    })()

    return {
        name: 'NonError',
        message: trimText(raw || 'unknown_error', 1000),
        stack: null,
    }
}

async function runBatchInChunks(
    db: D1Database,
    statements: D1PreparedStatement[],
    chunkSize = 100
): Promise<void> {
    for (let index = 0; index < statements.length; index += chunkSize) {
        await db.batch(statements.slice(index, index + chunkSize))
    }
}

function buildAccountStatements(db: D1Database, accounts: AccountPayload[]): D1PreparedStatement[] {
    const now = toIsoNow()
    return accounts.map((account, index) => {
        if (!account?.id || !account?.name || !account?.kind || !account?.defaultCurrency) {
            throw new Error(`Invalid account at index ${index}: id, name, kind and defaultCurrency are required`)
        }

        return db.prepare(`
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
    })
}

function buildMovementStatements(db: D1Database, movements: MovementPayload[]): D1PreparedStatement[] {
    const now = toIsoNow()
    return movements.map((movement, index) => {
        if (!movement?.id || !movement?.accountId || !movement?.datetimeISO || !movement?.type || !movement?.tradeCurrency) {
            throw new Error(`Invalid movement at index ${index}: id, accountId, datetimeISO, type and tradeCurrency are required`)
        }

        return db.prepare(`
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
                movement.datetimeISO,
                movement.type,
                toSafeAmount(movement.totalAmount),
                movement.tradeCurrency,
                typeof movement.fxAtTrade === 'number' ? movement.fxAtTrade : null,
                JSON.stringify(movement.meta ?? null),
                JSON.stringify(movement),
                movement.datetimeISO || now,
                now
            )
    })
}

function buildInstrumentStatements(db: D1Database, instruments: InstrumentPayload[]): D1PreparedStatement[] {
    const now = toIsoNow()
    return instruments.map((instrument, index) => {
        if (!instrument?.id || !instrument?.symbol || !instrument?.category || !instrument?.nativeCurrency) {
            throw new Error(`Invalid instrument at index ${index}: id, symbol, category and nativeCurrency are required`)
        }

        return db.prepare(`
INSERT INTO instruments (id, symbol, category, currency, payload_json, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(id) DO UPDATE SET
  symbol = excluded.symbol,
  category = excluded.category,
  currency = excluded.currency,
  payload_json = excluded.payload_json,
  updated_at = excluded.updated_at
`)
            .bind(
                instrument.id,
                instrument.symbol,
                instrument.category,
                instrument.nativeCurrency,
                JSON.stringify(instrument),
                now,
                now
            )
    })
}

export const onRequest: PagesFunction<SyncEnv> = async (context) => {
    const method = context.request.method
    if (method === 'OPTIONS') {
        return optionsResponse()
    }

    if (method !== 'POST') {
        return jsonResponse({
            error: 'Method not allowed',
            details: `Unsupported method: ${method}`,
        }, 405)
    }

    if (!isWriteEnabled(context.env)) {
        return jsonResponse({
            error: 'Sync write disabled',
            details: 'ARGFOLIO_SYNC_WRITE_ENABLED must be "1".',
            hint: 'Write gate OFF: set ARGFOLIO_SYNC_WRITE_ENABLED=1 y redeploy.',
        }, 403)
    }

    if (!context.env.DB) {
        return jsonResponse({
            error: 'D1 binding unavailable',
            details: 'env.DB is undefined',
            hint: 'Falta binding D1 DB',
        }, 500)
    }

    try {
        let payload: PushPayload
        try {
            payload = await parseJsonBody<PushPayload>(context.request)
        } catch (error) {
            const serialized = serializeException(error)
            return jsonResponse({
                error: 'Invalid JSON body',
                details: serialized.message,
            }, 400)
        }

        if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
            return jsonResponse({
                error: 'Invalid payload: expected exportLocalBackup() JSON with data block.',
                details: 'Missing or invalid "data" object in request payload.',
            }, 400)
        }

        const accounts = toArray<AccountPayload>(payload.data.accounts, 'data.accounts')
        const movements = toArray<MovementPayload>(payload.data.movements, 'data.movements')
        const instruments = toArray<InstrumentPayload>(payload.data.instruments, 'data.instruments')
        const manualPrices = toArray<unknown>(payload.data.manualPrices, 'data.manualPrices')
        const hasPreferences =
            payload.data.preferences != null &&
            typeof payload.data.preferences === 'object' &&
            Object.keys(payload.data.preferences).length > 0

        const db = getDatabase(context.env)
        await ensureSyncSchema(db)

        const accountStatements = buildAccountStatements(db, accounts)
        const movementStatements = buildMovementStatements(db, movements)

        if (accountStatements.length > 0) {
            await runBatchInChunks(db, accountStatements)
        }
        if (movementStatements.length > 0) {
            await runBatchInChunks(db, movementStatements)
        }

        let instrumentsUpserted = 0
        const ignored: string[] = []
        if (manualPrices.length > 0) {
            ignored.push(`manualPrices (${manualPrices.length})`)
        }
        if (hasPreferences) {
            ignored.push('preferences')
        }

        if (instruments.length > 0) {
            try {
                const instrumentStatements = buildInstrumentStatements(db, instruments)
                if (instrumentStatements.length > 0) {
                    await runBatchInChunks(db, instrumentStatements)
                }
                instrumentsUpserted = instruments.length
            } catch (error: any) {
                ignored.push(`instruments (${error?.message || 'table missing or unavailable'})`)
            }
        }

        return jsonResponse({
            ok: true,
            counts: {
                accountsUpserted: accounts.length,
                movementsUpserted: movements.length,
                instrumentsUpserted,
            },
            ignored,
        })
    } catch (error) {
        const serialized = serializeException(error)
        return jsonResponse({
            error: 'Failed to push sync payload',
            details: serialized,
        }, 500)
    }
}
