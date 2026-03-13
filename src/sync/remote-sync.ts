import { db } from '@/db/schema'
import type { Account, Instrument, Movement, Snapshot } from '@/domain/types'

const REMOTE_SYNC_FLAG = 'VITE_ARGFOLIO_REMOTE_SYNC'
const REMOTE_SYNC_STATUS_EVENT = 'argfolio:remote-sync-status'
export const SYNC_TOKEN_STORAGE_KEY = 'argfolio-sync-token'
export const FINANCE_EXPRESS_STORAGE_KEY = 'budget_fintech'
export const FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY = 'budget_fintech_updated_at'
const PREFERENCES_UPDATED_AT_KEY = 'argfolio.preferences_updated_at'
const LAST_SYNC_KEY = 'argfolio.lastSyncISO'

// Preference keys that affect portfolio calculation and must be consistent cross-device
const SYNCED_PREFERENCE_KEYS = [
    'argfolio-fx-preference',
    'argfolio.trackCash',
    'argfolio.cryptoCostingMethod',
    'argfolio-settings-cedear-auto',
    'argfolio.autoAccrueWalletInterest',
    'argfolio.autoSettleFixedTerms',
] as const

interface RemoteSyncStatusDetail {
    title: string
    description?: string
    variant?: 'default' | 'success' | 'error' | 'info'
}

interface BootstrapResponse {
    asOfISO: string
    accounts: Account[]
    movements: Movement[]
    instruments?: Instrument[]
    snapshots?: Snapshot[]
    financeExpress?: string | null
    financeExpressUpdatedAt?: string | null
    preferences?: string | null
    preferencesUpdatedAt?: string | null
}

export interface SyncFingerprint {
    movementCount: number
    accountCount: number
    instrumentCount: number
    hash: string
    computedAtISO: string
}

class HttpError extends Error {
    status: number
    body: string

    constructor(status: number, body: string) {
        super(`HTTP ${status}`)
        this.status = status
        this.body = body
    }
}

let lastStatusKey = ''
let lastStatusAt = 0
let bootstrapInFlight: Promise<{ ok: boolean; offline: boolean }> | null = null

function emitSyncStatus(detail: RemoteSyncStatusDetail): void {
    if (typeof window === 'undefined') return

    const now = Date.now()
    const key = `${detail.title}|${detail.description ?? ''}`
    if (key === lastStatusKey && (now - lastStatusAt) < 15000) return

    lastStatusKey = key
    lastStatusAt = now

    window.dispatchEvent(
        new CustomEvent<RemoteSyncStatusDetail>(REMOTE_SYNC_STATUS_EVENT, { detail })
    )
}

function toJsonBody(value: unknown): BodyInit {
    return JSON.stringify(value)
}

function readSyncToken(): string {
    if (typeof window === 'undefined') return ''
    return (window.localStorage.getItem(SYNC_TOKEN_STORAGE_KEY) ?? '').trim()
}

function authHeaders(): Record<string, string> {
    const token = readSyncToken()
    return token.length > 0 ? { Authorization: `Bearer ${token}` } : {}
}

export function getSyncToken(): string {
    return readSyncToken()
}

export function setSyncToken(token: string): void {
    if (typeof window === 'undefined') return
    const normalized = token.trim()
    if (normalized.length === 0) {
        window.localStorage.removeItem(SYNC_TOKEN_STORAGE_KEY)
        return
    }
    window.localStorage.setItem(SYNC_TOKEN_STORAGE_KEY, normalized)
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(init?.headers ?? {}),
        },
    })

    if (!response.ok) {
        const body = await response.text()
        throw new HttpError(response.status, body)
    }

    if (response.status === 204) {
        return undefined as T
    }

    return response.json() as Promise<T>
}

export function isRemoteSyncEnabled(): boolean {
    const raw = import.meta.env[REMOTE_SYNC_FLAG]
    return raw === '1' || raw === 'true'
}

export function subscribeRemoteSyncStatus(
    listener: (detail: RemoteSyncStatusDetail) => void
): () => void {
    if (typeof window === 'undefined') return () => undefined

    const handler = (event: Event) => {
        const custom = event as CustomEvent<RemoteSyncStatusDetail>
        listener(custom.detail)
    }
    window.addEventListener(REMOTE_SYNC_STATUS_EVENT, handler)
    return () => window.removeEventListener(REMOTE_SYNC_STATUS_EVENT, handler)
}

function handleRemoteSyncError(error: unknown): void {
    if (error instanceof HttpError && error.status === 401) {
        emitSyncStatus({
            title: 'Sync remoto sin token',
            description: 'Configurá Token de Sync en Settings para bootstrap remoto.',
            variant: 'error',
        })
        return
    }

    if (error instanceof HttpError && error.status === 403) {
        emitSyncStatus({
            title: 'Sync remoto en solo lectura',
            description: 'Activá escritura en Cloudflare cuando tengas Access habilitado.',
            variant: 'info',
        })
        return
    }

    emitSyncStatus({
        title: 'Sync no disponible',
        description: 'Los cambios se guardaron localmente pero no se sincronizaron. Otros dispositivos no verán estos datos hasta reconectar.',
        variant: 'error',
    })
}

export async function bootstrapRemoteSync(force = false): Promise<{ ok: boolean; offline: boolean }> {
    if (!isRemoteSyncEnabled()) {
        return { ok: false, offline: false }
    }

    if (!force && bootstrapInFlight) {
        return bootstrapInFlight
    }

    const task = (async () => {
        try {
            const payload = await requestJson<BootstrapResponse>('/api/sync/bootstrap')
            const accounts = Array.isArray(payload.accounts) ? payload.accounts : []
            const movements = Array.isArray(payload.movements) ? payload.movements : []
            const instruments = Array.isArray(payload.instruments) ? payload.instruments : []
            const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : []
            const snapshotsToPersist = snapshots.filter((snapshot): snapshot is Snapshot => {
                return typeof snapshot?.dateLocal === 'string' && snapshot.dateLocal.length > 0
            })

<<<<<<< HEAD
            // D1 is the single source of truth — replace local DB entirely.
=======
            // Track remote IDs for reconciliation push
            const remoteMovementIds = new Set(movements.map(m => m.id))

>>>>>>> 7262d8101d6692d54190207b9ef61bba374f353a
            await db.transaction('rw', [db.accounts, db.movements, db.instruments, db.snapshots], async () => {
                await db.accounts.clear()
                await db.movements.clear()
                await db.instruments.clear()
                await db.snapshots.clear()

                if (accounts.length > 0) await db.accounts.bulkPut(accounts)
                if (movements.length > 0) await db.movements.bulkPut(movements)
                if (instruments.length > 0) await db.instruments.bulkPut(instruments)
                if (snapshotsToPersist.length > 0) await db.snapshots.bulkPut(snapshotsToPersist)

                console.info('[bootstrap] Replaced local DB from D1', {
                    accounts: accounts.length,
                    movements: movements.length,
                    instruments: instruments.length,
                    snapshots: snapshotsToPersist.length,
                })
            })

            // D1 is authoritative — always restore Finance Express from remote.
            if (typeof payload.financeExpress === 'string' && payload.financeExpress.length > 0) {
                localStorage.setItem(FINANCE_EXPRESS_STORAGE_KEY, payload.financeExpress)
                if (typeof payload.financeExpressUpdatedAt === 'string') {
                    localStorage.setItem(FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY, payload.financeExpressUpdatedAt)
                }
            }

            // Last-write-wins restore for Preferences.
            restorePreferencesFromRemote(payload.preferences, payload.preferencesUpdatedAt)

            // Record last sync time
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())

            // --- Reconciliation push: push local-only data to D1 ---
            // This ensures movements/accounts created locally (whose individual push may
            // have failed) eventually reach D1 so other devices can see them.
            reconciliationPush(remoteMovementIds).catch(error => {
                console.warn('[bootstrap] reconciliation push failed (non-blocking)', error)
            })

            return { ok: true, offline: false }
        } catch (error) {
            handleRemoteSyncError(error)
            return { ok: false, offline: true }
        } finally {
            if (!force) bootstrapInFlight = null
        }
    })()

    if (!force) {
        bootstrapInFlight = task
    }

    return task
}

// ---------------------------------------------------------------------------
// Reconciliation push — push local-only movements and all accounts to D1.
// Called automatically after bootstrap to ensure D1 eventually gets all data.
// Uses existing UPSERT endpoint, safe to call repeatedly.
// ---------------------------------------------------------------------------

let reconciliationInFlight = false

async function reconciliationPush(remoteMovementIds: Set<string>): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    if (reconciliationInFlight) return

    const token = readSyncToken()
    if (token.length === 0) return

    reconciliationInFlight = true
    try {
        // Find local-only movements (present locally but not in D1 bootstrap response)
        const allLocalMovements = await db.movements.toArray()
        const localOnlyMovements = allLocalMovements.filter(m => !remoteMovementIds.has(m.id))

        // Always push all accounts (small set, UPSERT is safe)
        const allLocalAccounts = await db.accounts.toArray()

        // Always push all instruments (small set)
        const allLocalInstruments = await db.instruments.toArray()

        // Collect current preferences
        const prefsPayload = collectLocalPreferences()

        const hasData = localOnlyMovements.length > 0 ||
            allLocalAccounts.length > 0 ||
            allLocalInstruments.length > 0

        if (!hasData && !prefsPayload) {
            console.log('[reconciliation] nothing to push')
            return
        }

        console.log('[reconciliation] pushing', {
            localOnlyMovements: localOnlyMovements.length,
            accounts: allLocalAccounts.length,
            instruments: allLocalInstruments.length,
            preferences: !!prefsPayload,
        })

        await requestJson('/api/sync/push', {
            method: 'POST',
            body: toJsonBody({
                version: 1,
                exportedAtISO: new Date().toISOString(),
                data: {
                    accounts: allLocalAccounts,
                    instruments: allLocalInstruments,
                    movements: localOnlyMovements,
                    snapshots: [],
                    manualPrices: [],
                    preferences: prefsPayload,
                },
            }),
        })

        if (localOnlyMovements.length > 0) {
            console.log(`[reconciliation] pushed ${localOnlyMovements.length} local-only movements to D1`)
            emitSyncStatus({
                title: 'Datos sincronizados',
                description: `${localOnlyMovements.length} movimiento(s) enviados a la nube.`,
                variant: 'success',
            })
        } else {
            console.log('[reconciliation] push done (accounts/instruments/preferences only)')
        }
    } catch (error) {
        console.warn('[reconciliation] push failed', error)
        // Non-blocking: don't surface error to user for reconciliation
    } finally {
        reconciliationInFlight = false
    }
}

// ---------------------------------------------------------------------------
// Preference sync helpers
// ---------------------------------------------------------------------------

function collectLocalPreferences(): Record<string, string> | null {
    const prefs: Record<string, string> = {}
    let hasAny = false
    for (const key of SYNCED_PREFERENCE_KEYS) {
        const value = localStorage.getItem(key)
        if (value !== null) {
            prefs[key] = value
            hasAny = true
        }
    }
    if (!hasAny) return null

    // Include updated_at for LWW
    const updatedAt = localStorage.getItem(PREFERENCES_UPDATED_AT_KEY)
    prefs['_updated_at'] = updatedAt || new Date().toISOString()
    return prefs
}

function restorePreferencesFromRemote(
    remotePrefsJson: string | null | undefined,
    remoteUpdatedAt: string | null | undefined
): void {
    if (typeof remotePrefsJson !== 'string' || remotePrefsJson.length === 0) return

    let remotePrefs: Record<string, string>
    try {
        remotePrefs = JSON.parse(remotePrefsJson)
    } catch {
        console.warn('[preferences] failed to parse remote preferences')
        return
    }

    if (typeof remotePrefs !== 'object' || remotePrefs === null) return

    const localUpdatedAt = localStorage.getItem(PREFERENCES_UPDATED_AT_KEY)
    const localMs = toTimestampMs(localUpdatedAt)
    const remoteMs = toTimestampMs(
        typeof remoteUpdatedAt === 'string' ? remoteUpdatedAt : remotePrefs['_updated_at']
    )

    // LWW: only restore if remote is newer or local has no timestamp
    if (localMs != null && remoteMs != null && remoteMs <= localMs) {
        console.log('[preferences] local is newer or equal, skipping remote restore')
        return
    }

    let restored = 0
    for (const key of SYNCED_PREFERENCE_KEYS) {
        const remoteVal = remotePrefs[key]
        if (typeof remoteVal === 'string') {
            const localVal = localStorage.getItem(key)
            if (localVal !== remoteVal) {
                localStorage.setItem(key, remoteVal)
                restored++
            }
        }
    }

    if (restored > 0) {
        const ts = typeof remoteUpdatedAt === 'string' ? remoteUpdatedAt : (remotePrefs['_updated_at'] || new Date().toISOString())
        localStorage.setItem(PREFERENCES_UPDATED_AT_KEY, ts)
        console.log(`[preferences] restored ${restored} preference(s) from remote`)
    }
}

/**
 * Mark preferences as modified (call after any preference change).
 * Triggers a preference push to D1 if remote sync is enabled.
 */
export function markPreferencesModified(): void {
    localStorage.setItem(PREFERENCES_UPDATED_AT_KEY, new Date().toISOString())
    if (!isRemoteSyncEnabled()) return
    syncPreferencesPush()
}

const PREFS_PUSH_DEBOUNCE_MS = 2000
let prefsPushTimeout: ReturnType<typeof setTimeout> | null = null

function syncPreferencesPush(): void {
    const token = readSyncToken()
    if (token.length === 0) return

    const prefs = collectLocalPreferences()
    if (!prefs) return

    if (prefsPushTimeout != null) clearTimeout(prefsPushTimeout)
    prefsPushTimeout = setTimeout(async () => {
        prefsPushTimeout = null
        try {
            await requestJson('/api/sync/push', {
                method: 'POST',
                body: toJsonBody({
                    version: 1,
                    exportedAtISO: new Date().toISOString(),
                    data: {
                        accounts: [],
                        instruments: [],
                        movements: [],
                        snapshots: [],
                        manualPrices: [],
                        preferences: prefs,
                    },
                }),
            })
            console.log('[preferences] pushed to D1')
        } catch (error) {
            console.warn('[preferences] push failed', error)
        }
    }, PREFS_PUSH_DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Force reconcile — manual full bidirectional sync.
// Pull → Push all → Pull again to converge.
// ---------------------------------------------------------------------------

export async function forceReconcile(): Promise<{
    ok: boolean
    pulled: number
    pushed: number
}> {
    if (!isRemoteSyncEnabled()) {
        return { ok: false, pulled: 0, pushed: 0 }
    }

    const token = readSyncToken()
    if (token.length === 0) {
        emitSyncStatus({
            title: 'Token de sync requerido',
            description: 'Configurá el token en Settings para sincronizar.',
            variant: 'error',
        })
        return { ok: false, pulled: 0, pushed: 0 }
    }

    try {
        emitSyncStatus({
            title: 'Sincronizando...',
            description: 'Descargando datos remotos...',
            variant: 'info',
        })

        // Step 1: Pull from D1
        const payload = await requestJson<BootstrapResponse>('/api/sync/bootstrap')
        const remoteMovements = Array.isArray(payload.movements) ? payload.movements : []
        const remoteAccounts = Array.isArray(payload.accounts) ? payload.accounts : []
        const remoteInstruments = Array.isArray(payload.instruments) ? payload.instruments : []
        const remoteMovementIds = new Set(remoteMovements.map(m => m.id))

        // Apply remote data locally (same logic as bootstrap)
        await db.transaction('rw', [db.accounts, db.movements, db.instruments], async () => {
            if (remoteAccounts.length > 0) await db.accounts.bulkPut(remoteAccounts)
            if (remoteMovements.length > 0) {
                const existingIds = new Set(
                    (await db.movements.toCollection().primaryKeys()) as string[]
                )
                const newMovements = remoteMovements.filter(m => !existingIds.has(m.id))
                if (newMovements.length > 0) {
                    await db.movements.bulkAdd(newMovements)
                }
            }
            if (remoteInstruments.length > 0) await db.instruments.bulkPut(remoteInstruments)
        })

        // Apply remote preferences (LWW)
        restorePreferencesFromRemote(payload.preferences, payload.preferencesUpdatedAt)

        // Step 2: Push local-only data to D1
        const allLocalMovements = await db.movements.toArray()
        const localOnlyMovements = allLocalMovements.filter(m => !remoteMovementIds.has(m.id))
        const allLocalAccounts = await db.accounts.toArray()
        const allLocalInstruments = await db.instruments.toArray()
        const prefsPayload = collectLocalPreferences()

        emitSyncStatus({
            title: 'Sincronizando...',
            description: 'Subiendo datos locales...',
            variant: 'info',
        })

        await requestJson('/api/sync/push', {
            method: 'POST',
            body: toJsonBody({
                version: 1,
                exportedAtISO: new Date().toISOString(),
                data: {
                    accounts: allLocalAccounts,
                    instruments: allLocalInstruments,
                    movements: localOnlyMovements,
                    snapshots: [],
                    manualPrices: [],
                    preferences: prefsPayload,
                },
            }),
        })

        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())

        const pulled = remoteMovements.length
        const pushed = localOnlyMovements.length

        emitSyncStatus({
            title: 'Sincronización completa',
            description: `${pulled} remotos procesados, ${pushed} locales enviados.`,
            variant: 'success',
        })

        return { ok: true, pulled, pushed }
    } catch (error) {
        handleRemoteSyncError(error)
        return { ok: false, pulled: 0, pushed: 0 }
    }
}

// ---------------------------------------------------------------------------
// Sync fingerprint — for debugging cross-device dataset comparison.
// ---------------------------------------------------------------------------

export async function computeSyncFingerprint(): Promise<SyncFingerprint> {
    const movements = await db.movements.toArray()
    const accounts = await db.accounts.toArray()
    const instruments = await db.instruments.toArray()

    // Simple hash: sort IDs and create a deterministic string
    const ids = movements.map(m => m.id).sort()
    const hashInput = ids.join('|')

    // Use a simple checksum (sum of char codes mod large prime)
    let hash = 0
    for (let i = 0; i < hashInput.length; i++) {
        hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0
    }
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0')

    return {
        movementCount: movements.length,
        accountCount: accounts.length,
        instrumentCount: instruments.length,
        hash: hashHex,
        computedAtISO: new Date().toISOString(),
    }
}

/**
 * Get last sync timestamp, or null if never synced.
 */
export function getLastSyncISO(): string | null {
    return localStorage.getItem(LAST_SYNC_KEY)
}

// ---------------------------------------------------------------------------
// Snapshot-only push — used by auto/manual snapshot save to sync to D1
// without requiring the user to click "Subir todo a D1".
// ---------------------------------------------------------------------------

const SNAPSHOT_PUSH_DEBOUNCE_MS = 2000
let snapshotPushTimeout: ReturnType<typeof setTimeout> | null = null
let snapshotPushInFlight = false

export async function syncPushSnapshots(snapshots: Snapshot[]): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    if (snapshots.length === 0) return

    const token = readSyncToken()
    if (token.length === 0) {
        console.log('[snapshots-sync] skip push: no sync token')
        return
    }

    // Anti-loop: if already pushing, skip
    if (snapshotPushInFlight) {
        console.log('[snapshots-sync] skip push: already in flight')
        return
    }

    // Debounce: clear any pending push and schedule a new one
    if (snapshotPushTimeout != null) {
        clearTimeout(snapshotPushTimeout)
    }

    return new Promise<void>((resolve, reject) => {
        snapshotPushTimeout = setTimeout(async () => {
            snapshotPushInFlight = true
            try {
                console.log('[snapshots-sync] pushing', { count: snapshots.length })
                await requestJson('/api/sync/push', {
                    method: 'POST',
                    body: toJsonBody({
                        version: 1,
                        exportedAtISO: new Date().toISOString(),
                        data: {
                            accounts: [],
                            instruments: [],
                            movements: [],
                            snapshots,
                            manualPrices: [],
                            preferences: {},
                        },
                    }),
                })
                console.log('[snapshots-sync] push done')
                emitSyncStatus({
                    title: 'Snapshot sincronizado',
                    variant: 'success',
                })
                resolve()
            } catch (error) {
                console.warn('[snapshots-sync] push failed', error)
                handleRemoteSyncError(error)
                reject(error)
            } finally {
                snapshotPushInFlight = false
                snapshotPushTimeout = null
            }
        }, SNAPSHOT_PUSH_DEBOUNCE_MS)
    })
}

export async function syncRemoteMovementCreate(movement: Movement): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson('/api/movements', {
            method: 'POST',
            body: toJsonBody(movement),
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

export async function syncRemoteMovementUpdate(movement: Movement): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson('/api/movements', {
            method: 'PUT',
            body: toJsonBody(movement),
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

export async function syncRemoteMovementDelete(id: string): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson(`/api/movements?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

export async function syncRemoteAccountCreate(account: Account): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson('/api/accounts', {
            method: 'POST',
            body: toJsonBody(account),
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

export async function syncRemoteAccountUpdate(account: Account): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson('/api/accounts', {
            method: 'PUT',
            body: toJsonBody(account),
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

export async function syncRemoteAccountDelete(id: string): Promise<void> {
    if (!isRemoteSyncEnabled()) return
    try {
        await requestJson(`/api/accounts?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        })
    } catch (error) {
        handleRemoteSyncError(error)
        throw error
    }
}

// ---------------------------------------------------------------------------
// Batch sync — push multiple movements to D1 via /api/sync/push.
// Used by code paths that write directly to Dexie (transfers, FCI, accrual).
// Returns { ok, failedCount } so callers can show feedback.
// ---------------------------------------------------------------------------

export async function syncMovementsBatch(
    movements: Movement[],
): Promise<{ ok: boolean; failedCount: number }> {
    if (!isRemoteSyncEnabled()) return { ok: true, failedCount: 0 }
    if (movements.length === 0) return { ok: true, failedCount: 0 }

    const token = readSyncToken()
    if (token.length === 0) {
        console.log('[movements-batch-sync] skip: no sync token')
        return { ok: false, failedCount: movements.length }
    }

    try {
        await requestJson('/api/sync/push', {
            method: 'POST',
            body: toJsonBody({
                version: 1,
                exportedAtISO: new Date().toISOString(),
                data: {
                    accounts: [],
                    instruments: [],
                    movements,
                    snapshots: [],
                    manualPrices: [],
                    preferences: {},
                },
            }),
        })
        console.log('[movements-batch-sync] pushed', { count: movements.length })
        return { ok: true, failedCount: 0 }
    } catch (error) {
        console.warn('[movements-batch-sync] push failed', error)
        handleRemoteSyncError(error)
        return { ok: false, failedCount: movements.length }
    }
}

// ---------------------------------------------------------------------------
// Budget (Finance Express) push — pushes localStorage budget data to D1.
// Called from useBudget on every persist so other devices see the changes.
// ---------------------------------------------------------------------------

const BUDGET_PUSH_DEBOUNCE_MS = 3000
let budgetPushTimeout: ReturnType<typeof setTimeout> | null = null

export function syncBudgetPush(): void {
    if (!isRemoteSyncEnabled()) return

    const token = readSyncToken()
    if (token.length === 0) return

    const payload = window.localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
    if (typeof payload !== 'string' || payload.length === 0) return

    if (budgetPushTimeout != null) {
        clearTimeout(budgetPushTimeout)
    }

    budgetPushTimeout = setTimeout(async () => {
        budgetPushTimeout = null
        try {
            const result = await requestJson<{ saved?: boolean; updated_at?: string }>(
                '/api/sync/push',
                {
                    method: 'POST',
                    body: toJsonBody({
                        version: 1,
                        exportedAtISO: new Date().toISOString(),
                        data: {
                            accounts: [],
                            instruments: [],
                            movements: [],
                            snapshots: [],
                            manualPrices: [],
                            preferences: {},
                            financeExpress: payload,
                        },
                    }),
                },
            )
            if (typeof result?.updated_at === 'string') {
                window.localStorage.setItem(
                    FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY,
                    result.updated_at,
                )
            }
            console.log('[budget-sync] pushed')
        } catch (error) {
            console.warn('[budget-sync] push failed', error)
        }
    }, BUDGET_PUSH_DEBOUNCE_MS)
}
