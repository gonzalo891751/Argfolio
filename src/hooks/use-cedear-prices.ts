import { useQuery } from '@tanstack/react-query'
import { fetchCedearPrices } from '@/data/providers/cedears-ppi'
import { useEffect } from 'react'

export type CedearPriceMap = Record<string, { lastPriceArs: number; changePct?: number; underlyingPrice?: number; updatedAt: string }>

const STORAGE_KEY = 'argfolio.cedearPrices.v1'
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

declare global {
    interface Window {
        SIMULATE_CEDEAR_FAILURE?: boolean
    }
}

function getStoredPrices(): CedearPriceMap {
    try {
        const item = localStorage.getItem(STORAGE_KEY)
        return item ? JSON.parse(item) : {}
    } catch {
        return {}
    }
}

export function useCedearPrices(enabled: boolean = true) {
    // Load initial data from local storage to avoid layout shift / empty state
    const initialData = getStoredPrices()

    const query = useQuery({
        queryKey: ['cedears', 'prices'],
        queryFn: async () => {
            if (typeof window !== 'undefined' && window.SIMULATE_CEDEAR_FAILURE) {
                throw new Error('Simulated CEDEAR failure')
            }

            const data = await fetchCedearPrices()

            // Normalize
            const map: CedearPriceMap = {}
            for (const item of data.items) {
                map[item.ticker] = {
                    lastPriceArs: item.lastPriceArs,
                    // If changePct is missing, maybe default to 0 or null?
                    // Let's store it if present.
                    // But TypeScript needs consistent type.
                    // We need to update CedearPriceMap definition too.
                    updatedAt: data.updatedAt
                }
                if (item.changePct !== undefined) {
                    (map[item.ticker] as any).changePct = item.changePct
                }
            }
            return map
        },
        // Polling if enabled
        refetchInterval: enabled ? REFRESH_INTERVAL : false,
        enabled,
        staleTime: 60 * 1000, // 1 minute stale
        initialData: initialData,
    })

    // Sync to localStorage on success
    useEffect(() => {
        if (query.data && Object.keys(query.data).length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(query.data))
        }
    }, [query.data])

    return query
}
