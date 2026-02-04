/**
 * Global Data Handler
 * 
 * A wrapper component that runs global background tasks like accrual scheduling.
 * This component renders its children and runs hooks in the background.
 */

import { ReactNode } from 'react'
import { useAccrualScheduler } from '@/features/yield'

interface GlobalDataHandlerProps {
    children: ReactNode
}

export function GlobalDataHandler({ children }: GlobalDataHandlerProps) {
    // Run yield accrual once per day
    useAccrualScheduler()

    return <>{children}</>
}
