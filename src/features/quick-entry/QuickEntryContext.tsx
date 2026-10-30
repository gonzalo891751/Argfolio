import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { QuickEntrySheet } from './QuickEntrySheet'
import { MovementWizard } from '@/pages/movements/components'
import type { MovementWizardPrefill } from '@/pages/movements/movement-wizard-prefill'

export type QuickEntryMode = 'trade' | 'cash' | 'balance'

export interface QuickEntryPrefill {
    mode?: QuickEntryMode
    side?: 'buy' | 'sell'
    assetClass?: 'crypto' | 'cedear'
    symbol?: string
    accountId?: string
    currency?: 'ARS' | 'USD'
    direction?: 'in' | 'out'
}

interface QuickEntryContextValue {
    openQuickEntry: (prefill?: QuickEntryPrefill) => void
    openAdvancedWizard: (prefill?: MovementWizardPrefill) => void
}

const QuickEntryContext = createContext<QuickEntryContextValue | null>(null)

export function QuickEntryProvider({ children }: { children: ReactNode }) {
    const [prefill, setPrefill] = useState<QuickEntryPrefill | null>(null)
    const [wizardPrefill, setWizardPrefill] = useState<MovementWizardPrefill | null | undefined>(undefined)

    const openQuickEntry = useCallback((next?: QuickEntryPrefill) => {
        setPrefill(next ?? {})
    }, [])

    const openAdvancedWizard = useCallback((next?: MovementWizardPrefill) => {
        setPrefill(null)
        setWizardPrefill(next ?? null)
    }, [])

    const value = useMemo(() => ({ openQuickEntry, openAdvancedWizard }), [openQuickEntry, openAdvancedWizard])

    return (
        <QuickEntryContext.Provider value={value}>
            {children}
            {prefill && (
                <QuickEntrySheet
                    prefill={prefill}
                    onClose={() => setPrefill(null)}
                    onOpenAdvanced={openAdvancedWizard}
                />
            )}
            {wizardPrefill !== undefined && (
                <MovementWizard
                    open
                    onOpenChange={open => { if (!open) setWizardPrefill(undefined) }}
                    prefill={wizardPrefill}
                />
            )}
        </QuickEntryContext.Provider>
    )
}

export function useQuickEntry(): QuickEntryContextValue {
    const ctx = useContext(QuickEntryContext)
    if (!ctx) throw new Error('useQuickEntry must be used within QuickEntryProvider')
    return ctx
}
