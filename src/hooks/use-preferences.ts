import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const STORAGE_KEY = 'argfolio.trackCash'

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
