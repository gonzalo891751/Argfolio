import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CostingMethod } from '@/domain/portfolio/lot-allocation'

const STORAGE_KEY = 'argfolio.trackCash'
const COSTING_KEY = 'argfolio.cryptoCostingMethod'
const AUTO_ACCRUE_KEY = 'argfolio.autoAccrueWalletInterest'
const AUTO_SETTLE_PF_KEY = 'argfolio.autoSettleFixedTerms'

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

/**
 * Hook for controlling automatic wallet interest accrual.
 * Default: OFF (user must opt-in)
 */
export function useAutoAccrueWalletInterest() {
    const queryClient = useQueryClient()

    const [enabled, setEnabledState] = useState(() => {
        const stored = localStorage.getItem(AUTO_ACCRUE_KEY)
        // Default OFF - user must opt-in
        return stored === 'true'
    })

    const setEnabled = useCallback((value: boolean) => {
        setEnabledState(value)
        localStorage.setItem(AUTO_ACCRUE_KEY, String(value))
        // Invalidate portfolio to reflect changes
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    }, [queryClient])

    return { autoAccrueEnabled: enabled, setAutoAccrueEnabled: setEnabled }
}

/**
 * Hook for controlling automatic fixed term settlement.
 * Default: ON (most users expect auto-settlement)
 */
export function useAutoSettleFixedTerms() {
    const queryClient = useQueryClient()

    const [enabled, setEnabledState] = useState(() => {
        const stored = localStorage.getItem(AUTO_SETTLE_PF_KEY)
        // Default ON - typical user expects auto-settlement
        if (stored === null) return true
        return stored === 'true'
    })

    const setEnabled = useCallback((value: boolean) => {
        setEnabledState(value)
        localStorage.setItem(AUTO_SETTLE_PF_KEY, String(value))
        // Invalidate portfolio to reflect changes
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    }, [queryClient])

    return { autoSettleEnabled: enabled, setAutoSettleEnabled: setEnabled }
}

/**
 * Get automation preferences values directly (for non-React contexts)
 */
export function getAutomationPreferences(): { autoAccrue: boolean; autoSettle: boolean } {
    const autoAccrue = localStorage.getItem(AUTO_ACCRUE_KEY) === 'true'
    const autoSettle = localStorage.getItem(AUTO_SETTLE_PF_KEY) !== 'false' // default ON
    return { autoAccrue, autoSettle }
}
