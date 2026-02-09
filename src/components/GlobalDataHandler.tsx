/**
 * Global Data Handler
 * 
 * A wrapper component that runs global background tasks like accrual scheduling.
 * This component renders its children and runs hooks in the background.
 */

import { ReactNode } from 'react'
import { useAccrualScheduler } from '@/features/yield'
import { useAutoDailySnapshotCapture } from '@/hooks/use-snapshots'
import { useRemoteSync } from '@/hooks/use-remote-sync'

interface GlobalDataHandlerProps {
    children: ReactNode
}

export function GlobalDataHandler({ children }: GlobalDataHandlerProps) {
    // Run yield accrual once per day
    useAccrualScheduler()
    // Run dashboard V2 auto snapshot (daily upsert) when setting is enabled
    useAutoDailySnapshotCapture()
    // Bootstrap remote sync snapshot (optional, behind feature flag)
    useRemoteSync()

    return <>{children}</>
}
