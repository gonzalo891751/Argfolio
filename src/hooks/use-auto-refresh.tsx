import { createContext, useContext, useState, useEffect } from 'react'

interface RefreshContextValue {
    isAutoRefreshEnabled: boolean
    setAutoRefreshEnabled: (enabled: boolean) => void
    refreshInterval: number
    lastRefreshTime: Date | null
    setLastRefreshTime: (time: Date) => void
}

const RefreshContext = createContext<RefreshContextValue | undefined>(undefined)

const STORAGE_KEY = 'argfolio-auto-refresh'
const DEFAULT_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function RefreshProvider({ children }: { children: React.ReactNode }) {
    const [isAutoRefreshEnabled, setAutoRefreshEnabledState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored !== 'false' // Default to true
    })
    const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null)

    const setAutoRefreshEnabled = (enabled: boolean) => {
        localStorage.setItem(STORAGE_KEY, String(enabled))
        setAutoRefreshEnabledState(enabled)
    }

    useEffect(() => {
        setLastRefreshTime(new Date())
    }, [])

    return (
        <RefreshContext.Provider
            value={{
                isAutoRefreshEnabled,
                setAutoRefreshEnabled,
                refreshInterval: isAutoRefreshEnabled ? DEFAULT_INTERVAL : 0,
                lastRefreshTime,
                setLastRefreshTime,
            }}
        >
            {children}
        </RefreshContext.Provider>
    )
}

export function useAutoRefresh() {
    const context = useContext(RefreshContext)
    if (!context) {
        throw new Error('useAutoRefresh must be used within a RefreshProvider')
    }
    return context
}
