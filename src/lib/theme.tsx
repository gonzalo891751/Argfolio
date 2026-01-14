import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
    theme: Theme
    setTheme: (theme: Theme) => void
    resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'argfolio-theme'

function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
    if (typeof window === 'undefined') return 'system'
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored
    }
    return 'system'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
        const stored = getStoredTheme()
        return stored === 'system' ? getSystemTheme() : stored
    })

    useEffect(() => {
        const root = window.document.documentElement
        const resolved = theme === 'system' ? getSystemTheme() : theme

        root.classList.remove('light', 'dark')
        root.classList.add(resolved)
        setResolvedTheme(resolved)
    }, [theme])

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

        const handleChange = () => {
            if (theme === 'system') {
                const resolved = getSystemTheme()
                const root = window.document.documentElement
                root.classList.remove('light', 'dark')
                root.classList.add(resolved)
                setResolvedTheme(resolved)
            }
        }

        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [theme])

    const setTheme = (newTheme: Theme) => {
        localStorage.setItem(STORAGE_KEY, newTheme)
        setThemeState(newTheme)
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
