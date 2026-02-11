import { db } from '@/db/schema'
import type { Account, Instrument, Movement, Snapshot } from '@/domain/types'

const REMOTE_SYNC_FLAG = 'VITE_ARGFOLIO_REMOTE_SYNC'
const REMOTE_SYNC_STATUS_EVENT = 'argfolio:remote-sync-status'
export const SYNC_TOKEN_STORAGE_KEY = 'argfolio-sync-token'
export const FINANCE_EXPRESS_STORAGE_KEY = 'budget_fintech'
export const FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY = 'budget_fintech_updated_at'

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

function toTimestampMs(value: string | null | undefined): number | null {
    if (typeof value !== 'string' || value.trim().length === 0) return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
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
        title: 'Sin conexión',
        description: 'Usando datos locales (Dexie).',
        variant: 'info',
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

            await db.transaction('rw', [db.accounts, db.movements, db.instruments, db.snapshots], async () => {
                if (accounts.length > 0) await db.accounts.bulkPut(accounts)
                if (movements.length > 0) await db.movements.bulkPut(movements)
                if (instruments.length > 0) await db.instruments.bulkPut(instruments)
                if (snapshotsToPersist.length > 0) {
                    const snapshotDates = Array.from(new Set(snapshotsToPersist.map((snapshot) => snapshot.dateLocal)))
                    if (snapshotDates.length > 0) {
                        await db.snapshots.where('dateLocal').anyOf(snapshotDates).delete()
                    }
                    await db.snapshots.bulkPut(snapshotsToPersist)
                }
            })

            // Last-write-wins restore for Finance Express data.
            if (typeof payload.financeExpress === 'string' && payload.financeExpress.length > 0) {
                const localFinanceExpress = localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
                const localUpdatedAt = localStorage.getItem(FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY)
                const remoteUpdatedAt = typeof payload.financeExpressUpdatedAt === 'string'
                    ? payload.financeExpressUpdatedAt
                    : null
                const localUpdatedAtMs = toTimestampMs(localUpdatedAt)
                const remoteUpdatedAtMs = toTimestampMs(remoteUpdatedAt)
                const shouldRestore =
                    typeof localFinanceExpress !== 'string' ||
                    localFinanceExpress.length === 0 ||
                    localUpdatedAtMs == null ||
                    (remoteUpdatedAtMs != null && remoteUpdatedAtMs > localUpdatedAtMs)

                if (shouldRestore) {
                    localStorage.setItem(FINANCE_EXPRESS_STORAGE_KEY, payload.financeExpress)
                    if (remoteUpdatedAt && remoteUpdatedAtMs != null) {
                        localStorage.setItem(FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY, remoteUpdatedAt)
                    }
                }
            }

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
