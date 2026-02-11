import { ExternalLink, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
    FINANCE_EXPRESS_STORAGE_KEY,
    FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY,
    SYNC_TOKEN_STORAGE_KEY,
    bootstrapRemoteSync,
    getSyncToken,
    isRemoteSyncEnabled,
} from '@/sync/remote-sync'

const FINANCE_SYNC_DEBUG_FLAG = 'argfolio-finance-sync-debug'
const FINANCE_SYNC_POST_MESSAGE_TYPE = 'argfolio:finance-express-data-updated'
const FINANCE_SYNC_DEBOUNCE_MS = 900

type FinanceSyncState = 'idle' | 'saving' | 'saved' | 'error' | 'no-token' | 'disabled' | 'pulling'

interface FinancePushResponse {
    ok?: boolean
    saved?: boolean
    updated_at?: string | null
    size?: number
    error?: string
    details?: unknown
}

export function FinanzasExpressPage() {
    const navigate = useNavigate()
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [syncState, setSyncState] = useState<FinanceSyncState>(() => {
        if (!isRemoteSyncEnabled()) return 'disabled'
        return getSyncToken().length > 0 ? 'idle' : 'no-token'
    })
    const [syncMessage, setSyncMessage] = useState<string>(() => {
        if (!isRemoteSyncEnabled()) return 'Sync remoto desactivado'
        return getSyncToken().length > 0 ? 'Sin cambios pendientes' : 'Sin token / No sincroniza'
    })

    const debounceRef = useRef<number | null>(null)
    const pendingPayloadRef = useRef<string | null>(null)
    const lastPushedPayloadRef = useRef<string | null>(null)
    // Flag to suppress re-push of data that was just pulled from remote
    const isRestoringFromRemoteRef = useRef(false)
    // Tracks whether a pull has completed at least once (to avoid double-reload on mount)
    const pullDoneRef = useRef(false)

    const debugEnabled = useMemo(() => {
        if (typeof window === 'undefined') return false
        if (import.meta.env.DEV) return true
        return window.localStorage.getItem(FINANCE_SYNC_DEBUG_FLAG) === '1'
    }, [])

    const logDebug = (event: string, meta?: Record<string, unknown>) => {
        if (!debugEnabled) return
        console.info('[finanzas-express-sync]', event, meta ?? {})
    }

    const setNoTokenState = () => {
        setSyncState('no-token')
        setSyncMessage('Sin token / No sincroniza')
    }

    // ── PULL: fetch remote data and reload iframe if changed ──

    const pullRemoteData = useCallback(async (reason: string): Promise<boolean> => {
        if (!isRemoteSyncEnabled()) return false
        if (!getSyncToken()) {
            setNoTokenState()
            return false
        }

        const localBefore = localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
        logDebug('pull-start', { reason, localSize: localBefore?.length ?? 0 })

        setSyncState('pulling')
        setSyncMessage('Descargando...')

        try {
            const result = await bootstrapRemoteSync()
            if (!result.ok) {
                logDebug('pull-bootstrap-failed', { reason, offline: result.offline })
                if (result.offline) {
                    setSyncState('error')
                    setSyncMessage('Sin conexion al descargar')
                } else {
                    setSyncState('idle')
                    setSyncMessage('Sin cambios pendientes')
                }
                return false
            }

            const localAfter = localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
            const dataChanged = localAfter !== localBefore

            logDebug('pull-done', {
                reason,
                dataChanged,
                localBeforeSize: localBefore?.length ?? 0,
                localAfterSize: localAfter?.length ?? 0,
            })

            if (dataChanged && localAfter) {
                // Update refs so we don't re-push data we just pulled
                isRestoringFromRemoteRef.current = true
                lastPushedPayloadRef.current = localAfter
                pendingPayloadRef.current = localAfter

                // Reload iframe to pick up new localStorage data
                try {
                    const iframe = iframeRef.current
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.location.reload()
                        logDebug('iframe-reloaded', { reason })
                    }
                } catch {
                    // Cross-origin or iframe not ready - ignore
                }

                // Clear the restoring flag after a short delay (longer than debounce)
                // to prevent the iframe's save() postMessage from re-pushing pulled data
                window.setTimeout(() => {
                    isRestoringFromRemoteRef.current = false
                }, FINANCE_SYNC_DEBOUNCE_MS + 500)

                setSyncState('saved')
                setSyncMessage('Datos remotos aplicados')
                return true
            }

            setSyncState('idle')
            setSyncMessage('Sin cambios pendientes')
            return false
        } catch (error) {
            logDebug('pull-error', {
                reason,
                error: error instanceof Error ? error.message : String(error),
            })
            setSyncState('error')
            setSyncMessage('Error al descargar datos remotos')
            return false
        }
    }, [debugEnabled])

    // ── PUSH: send local changes to D1 ──

    const flushPush = async (reason: string) => {
        if (!isRemoteSyncEnabled()) {
            setSyncState('disabled')
            setSyncMessage('Sync remoto desactivado')
            return
        }

        // Don't push data that was just restored from remote
        if (isRestoringFromRemoteRef.current) {
            logDebug('push-skipped-restoring', { reason })
            return
        }

        const payload = pendingPayloadRef.current
        if (!payload || payload.length === 0) return
        if (payload === lastPushedPayloadRef.current) {
            logDebug('push-skipped-same-payload', { reason, size: payload.length })
            return
        }

        const token = getSyncToken()
        if (!token) {
            logDebug('push-skipped-no-token', { reason })
            setNoTokenState()
            return
        }

        setSyncState('saving')
        setSyncMessage('Guardando...')
        logDebug('push-start', { reason, size: payload.length })

        try {
            const response = await fetch('/api/sync/push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    version: 1,
                    exportedAtISO: new Date().toISOString(),
                    data: {
                        financeExpress: payload,
                    },
                }),
            })

            const rawBody = await response.text()
            let parsedBody: FinancePushResponse | null = null
            if (rawBody.trim().length > 0) {
                try {
                    parsedBody = JSON.parse(rawBody) as FinancePushResponse
                } catch {
                    parsedBody = null
                }
            }

            logDebug('push-result', {
                reason,
                status: response.status,
                ok: response.ok,
                body: parsedBody ?? rawBody.slice(0, 300),
            })

            if (!response.ok || parsedBody?.ok === false) {
                if (response.status === 401) {
                    setSyncState('error')
                    setSyncMessage('Token invalido (401). Revisa en Settings.')
                    return
                }
                if (response.status === 403) {
                    setSyncState('error')
                    setSyncMessage('Sync deshabilitado en servidor (403)')
                    return
                }

                const errorText = typeof parsedBody?.error === 'string'
                    ? parsedBody.error
                    : `HTTP ${response.status}`
                setSyncState('error')
                setSyncMessage(`Error de sync: ${errorText}`)
                return
            }

            if (parsedBody?.saved !== true) {
                setSyncState('error')
                setSyncMessage('Push no confirmo guardado')
                return
            }

            const updatedAt = typeof parsedBody.updated_at === 'string' ? parsedBody.updated_at : null
            if (updatedAt) {
                localStorage.setItem(FINANCE_EXPRESS_UPDATED_AT_STORAGE_KEY, updatedAt)
            }
            lastPushedPayloadRef.current = payload
            setSyncState('saved')
            setSyncMessage('Guardado')
        } catch (error) {
            logDebug('push-network-error', {
                reason,
                error: error instanceof Error ? error.message : String(error),
            })
            setSyncState('error')
            setSyncMessage('Error de red al sincronizar')
        }
    }

    const schedulePush = (reason: string) => {
        // Don't schedule pushes while restoring from remote
        if (isRestoringFromRemoteRef.current) {
            logDebug('push-schedule-skipped-restoring', { reason })
            return
        }

        const payload = localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
        if (typeof payload !== 'string' || payload.length === 0) return

        pendingPayloadRef.current = payload
        logDebug('change-detected', { reason, size: payload.length })

        if (!isRemoteSyncEnabled()) {
            setSyncState('disabled')
            setSyncMessage('Sync remoto desactivado')
            return
        }

        if (!getSyncToken()) {
            setNoTokenState()
            return
        }

        if (debounceRef.current != null) {
            window.clearTimeout(debounceRef.current)
        }
        debounceRef.current = window.setTimeout(() => {
            void flushPush(reason)
        }, FINANCE_SYNC_DEBOUNCE_MS)
    }

    // ── EFFECT: pull on mount + push listeners ──

    useEffect(() => {
        if (!isRemoteSyncEnabled()) {
            setSyncState('disabled')
            setSyncMessage('Sync remoto desactivado')
            return
        }

        lastPushedPayloadRef.current = localStorage.getItem(FINANCE_EXPRESS_STORAGE_KEY)
        pendingPayloadRef.current = lastPushedPayloadRef.current

        if (!getSyncToken()) {
            setNoTokenState()
        } else {
            // Pull remote data on mount — this is the key fix for cross-device sync.
            // bootstrapRemoteSync() deduplicates with the global call from GlobalDataHandler,
            // so this won't cause an extra network request if bootstrap is already in-flight.
            void pullRemoteData('mount').then(() => {
                pullDoneRef.current = true
            })
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key === FINANCE_EXPRESS_STORAGE_KEY) {
                // Don't re-push data that was just pulled from remote
                if (isRestoringFromRemoteRef.current) return
                schedulePush('storage-event')
                return
            }

            if (event.key === SYNC_TOKEN_STORAGE_KEY) {
                const hasToken = getSyncToken().length > 0
                if (!hasToken) {
                    setNoTokenState()
                } else {
                    setSyncState((previous) => (previous === 'disabled' ? 'disabled' : 'idle'))
                    setSyncMessage('Token detectado')
                    schedulePush('token-storage-event')
                }
            }
        }

        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return
            const data = event.data as { type?: string; key?: string } | null
            if (!data || typeof data !== 'object') return

            const isBudgetUpdate =
                data.type === FINANCE_SYNC_POST_MESSAGE_TYPE ||
                (data.type === 'data-updated' && data.key === FINANCE_EXPRESS_STORAGE_KEY)
            if (!isBudgetUpdate) return

            // Don't re-push data if the iframe just reloaded from a pull
            if (isRestoringFromRemoteRef.current) {
                logDebug('postmessage-skipped-restoring')
                return
            }

            schedulePush('postmessage-event')
        }

        window.addEventListener('storage', onStorage)
        window.addEventListener('message', onMessage)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener('message', onMessage)
            if (debounceRef.current != null) {
                window.clearTimeout(debounceRef.current)
                debounceRef.current = null
            }
        }
    }, [])

    const statusClassName = useMemo(() => {
        switch (syncState) {
            case 'saved':
                return 'text-emerald-600'
            case 'saving':
            case 'pulling':
                return 'text-blue-600'
            case 'error':
            case 'no-token':
                return 'text-destructive'
            case 'disabled':
                return 'text-muted-foreground'
            default:
                return 'text-muted-foreground'
        }
    }, [syncState])

    const canPull = isRemoteSyncEnabled() && getSyncToken().length > 0 && syncState !== 'pulling' && syncState !== 'saving'

    return (
        <div className="flex flex-col h-[calc(100dvh-4rem)] -m-4 md:-m-6 lg:-m-8">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-medium text-muted-foreground">Presupuesto Express</h1>
                    <span className={`text-xs ${statusClassName}`}>{syncMessage}</span>
                    {syncState === 'no-token' ? (
                        <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => navigate('/settings')}
                        >
                            Configurar token
                        </Button>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {canPull ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => void pullRemoteData('manual-pull')}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Traer ultimo
                        </Button>
                    ) : null}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open('/apps/finanzas-express/index.html', '_blank')}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir en pestana nueva
                    </Button>
                </div>
            </div>
            {/* Iframe */}
            <iframe
                ref={iframeRef}
                src="/apps/finanzas-express/index.html"
                title="Presupuesto Express"
                className="flex-1 w-full border-0"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    )
}
