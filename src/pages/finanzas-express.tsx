import { useEffect, useRef, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Loader2, Check, CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'
import { useFxRates } from '@/hooks/use-fx-rates'
import { getSyncToken, isRemoteSyncEnabled } from '@/sync/remote-sync'
import { FinanzasExpressNative } from '@/features/finanzas-express/FinanzasExpressNative'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

const BUDGET_KEY = 'budget_fintech'
const DEBOUNCE_MS = 1200

export function FinanzasExpressPage() {
    const [searchParams] = useSearchParams()
    const useNative = searchParams.get('native') === '1'

    if (useNative) return <FinanzasExpressNative />
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const { resolvedTheme } = useTheme()
    const { data: fxRates } = useFxRates()
    const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
    const lastPushedRef = useRef<string>('')
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()

    // --- Helper to post message to iframe ---
    const postToIframe = useCallback((msg: Record<string, unknown>) => {
        const w = iframeRef.current?.contentWindow
        if (w) w.postMessage(msg, '*')
    }, [])

    // --- Theme bridge: send resolved theme to iframe ---
    useEffect(() => {
        postToIframe({ type: 'argfolio:theme', resolved: resolvedTheme })
    }, [resolvedTheme, postToIframe])

    // --- FX bridge: send oficial compra/venta to iframe ---
    useEffect(() => {
        if (!fxRates?.oficial?.buy || !fxRates?.oficial?.sell) return
        postToIframe({
            type: 'argfolio:fx',
            compra: fxRates.oficial.buy,
            venta: fxRates.oficial.sell,
            source: fxRates.source,
        })
    }, [fxRates, postToIframe])

    // --- Iframe load: send init + theme + FX ---
    const handleIframeLoad = useCallback(() => {
        postToIframe({ type: 'argfolio:init' })
        postToIframe({ type: 'argfolio:theme', resolved: resolvedTheme })
        if (fxRates?.oficial?.buy && fxRates?.oficial?.sell) {
            postToIframe({
                type: 'argfolio:fx',
                compra: fxRates.oficial.buy,
                venta: fxRates.oficial.sell,
                source: fxRates.source,
            })
        }
        // Store initial value to avoid immediately re-pushing
        lastPushedRef.current = localStorage.getItem(BUDGET_KEY) || ''
    }, [resolvedTheme, fxRates, postToIframe])

    // --- Auto-sync: push financeExpress to server ---
    const pushFinanceExpress = useCallback(async (data: string) => {
        if (!isRemoteSyncEnabled()) return
        const syncToken = getSyncToken()
        if (!syncToken) return

        setSyncStatus('syncing')
        try {
            const res = await fetch('/api/sync/push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${syncToken}`,
                },
                body: JSON.stringify({
                    version: 1,
                    data: { financeExpress: data },
                }),
            })
            if (res.ok) {
                lastPushedRef.current = data
                setSyncStatus('synced')
                setTimeout(() => setSyncStatus(prev => prev === 'synced' ? 'idle' : prev), 3000)
            } else {
                setSyncStatus('error')
            }
        } catch {
            setSyncStatus('offline')
            // Retry once after 10s
            setTimeout(() => {
                const current = localStorage.getItem(BUDGET_KEY) || ''
                if (current && current !== lastPushedRef.current) {
                    pushFinanceExpress(current)
                }
            }, 10_000)
        }
    }, [])

    // --- Listen for storage events (iframe writes → parent sees) ---
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key !== BUDGET_KEY) return
            const newValue = e.newValue || ''
            if (!newValue || newValue === lastPushedRef.current) return

            // Debounce
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
                pushFinanceExpress(newValue)
            }, DEBOUNCE_MS)
        }

        window.addEventListener('storage', handler)
        return () => {
            window.removeEventListener('storage', handler)
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [pushFinanceExpress])

    // --- Sync status indicator ---
    const statusUi = syncStatus !== 'idle' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {syncStatus === 'syncing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {syncStatus === 'synced' && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            {syncStatus === 'error' && <CloudOff className="h-3.5 w-3.5 text-destructive" />}
            {syncStatus === 'offline' && <CloudOff className="h-3.5 w-3.5 text-amber-500" />}
            <span>
                {syncStatus === 'syncing' && 'Guardando\u2026'}
                {syncStatus === 'synced' && 'Guardado'}
                {syncStatus === 'error' && 'Error al sincronizar'}
                {syncStatus === 'offline' && 'Sin conexión'}
            </span>
        </div>
    )

    return (
        <div className="flex flex-col h-[calc(100dvh-4rem)] -m-4 md:-m-6 lg:-m-8">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
                <h1 className="text-sm font-medium text-muted-foreground">Presupuesto Express</h1>
                <div className="flex items-center gap-2">
                    {statusUi}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => window.open('/apps/finanzas-express/index.html', '_blank')}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir en pestaña nueva
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
                onLoad={handleIframeLoad}
            />
        </div>
    )
}
