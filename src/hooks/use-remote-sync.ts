import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toast'
import {
    bootstrapRemoteSync,
    isRemoteSyncEnabled,
    subscribeRemoteSyncStatus,
} from '@/sync/remote-sync'

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

        bootstrapRemoteSync().then((result) => {
            if (cancelled || !result.ok) return

            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['instruments'] })
            queryClient.invalidateQueries({ queryKey: ['snapshots'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        })

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [queryClient, toast])
}
