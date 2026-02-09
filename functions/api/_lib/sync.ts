export interface SyncEnv {
    DB?: D1Database
    ARGFOLIO_SYNC_WRITE_ENABLED?: string
}

export function corsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
}

export function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: corsHeaders(),
    })
}

export function optionsResponse(): Response {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(),
    })
}

export function getDatabase(env: SyncEnv): D1Database {
    if (!env.DB) {
        throw new Error('Missing DB binding. Configure D1 binding as "DB".')
    }
    return env.DB
}

export function isWriteEnabled(env: SyncEnv): boolean {
    return env.ARGFOLIO_SYNC_WRITE_ENABLED === '1'
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
    return request.json() as Promise<T>
}

export async function ensureSyncSchema(db: D1Database): Promise<void> {
    await db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  instrument_id TEXT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  fx_at_trade REAL,
  meta_json TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_account_date ON movements(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date DESC);

CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  category TEXT NOT NULL,
  currency TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`)
}

