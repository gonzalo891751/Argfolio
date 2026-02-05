import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CostingMethod } from '@/domain/portfolio/lot-allocation'

const STORAGE_KEY = 'argfolio.trackCash'
const COSTING_KEY = 'argfolio.cryptoCostingMethod'

export function useTrackCash() {
    const queryClient = useQueryClient()

    // Initialize from localStorage, default false
    const [trackCash, setTrackCashState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        // If missing, default is FALSE (Simple Mode)
        if (stored === null) return false
        return stored === 'true'
    })

    const setTrackCash = (value: boolean) => {
        setTrackCashState(value)
        localStorage.setItem(STORAGE_KEY, String(value))

        // Invalidate relevant queries to trigger re-computation
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    }

    return { trackCash, setTrackCash }
}

const VALID_METHODS: CostingMethod[] = ['PPP', 'FIFO', 'LIFO', 'CHEAPEST', 'MANUAL']

export function useCostingMethod() {
    const [method, setMethodState] = useState<CostingMethod>(() => {
        const stored = localStorage.getItem(COSTING_KEY)
        if (stored && VALID_METHODS.includes(stored as CostingMethod)) {
            return stored as CostingMethod
        }
        return 'PPP' // default for crypto
    })

    const setMethod = (value: CostingMethod) => {
        setMethodState(value)
        localStorage.setItem(COSTING_KEY, value)
    }

    return { method, setMethod }
}
