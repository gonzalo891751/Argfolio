import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toast'
import {
    bootstrapRemoteSync,
    getSyncToken,
    isRemoteSyncEnabled,
    subscribeRemoteSyncStatus,
} from '@/sync/remote-sync'
import { connectDevice, readLinkToken, stripLinkFromUrl } from '@/sync/device-link'

/** Everything read from the local DB, after it was replaced from D1. */
export function invalidateSyncedData(queryClient: QueryClient): void {
    for (const key of ['accounts', 'movements', 'instruments', 'snapshots', 'portfolio']) {
        queryClient.invalidateQueries({ queryKey: [key] })
    }
}

export function useRemoteSync() {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    useEffect(() => {
        if (!isRemoteSyncEnabled()) return

        let cancelled = false

        const unsubscribe = subscribeRemoteSyncStatus((detail) => {
            if (cancelled) return
            toast({
                title: detail.title,
                description: detail.description,
                variant: detail.variant ?? 'info',
            })
        })

        // Opened from a "use on another device" link: connect this device first
        const linkToken = typeof window !== 'undefined' ? readLinkToken(window.location.hash) : null
        if (linkToken) {
            stripLinkFromUrl()
            // One-shot: report the result even if this effect was re-run meanwhile
            connectDevice(linkToken).then((result) => {
                if (result === 'ok') {
                    invalidateSyncedData(queryClient)
                    toast({ title: 'Dispositivo conectado', description: 'Ya ves tus datos en este dispositivo.', variant: 'success' })
                } else {
                    toast({
                        title: result === 'invalid' ? 'El enlace no es válido' : 'No se pudo conectar',
                        description: result === 'invalid'
                            ? 'Generá uno nuevo desde Configuración en tu otro dispositivo.'
                            : 'Revisá la conexión a internet y volvé a abrir el enlace.',
                        variant: 'error',
                    })
                }
            })
        } else if (getSyncToken()) {
            // Without a token there is nothing to download: Inicio explains how to connect
            bootstrapRemoteSync().then((result) => {
                if (cancelled || !result.ok) return
                invalidateSyncedData(queryClient)
            })
        }

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [queryClient, toast])
}
