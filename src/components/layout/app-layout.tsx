import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarProvider, useSidebar, MobileNav, MobileTabBar } from '@/components/layout/sidebar'
import { QuickEntryProvider } from '@/features/quick-entry/QuickEntryContext'
import { ArgfolioHeader } from '@/components/layout/ArgfolioHeader'
import { usePFSettlement } from '@/hooks/use-pf-settlement'
import { usePFModelMigration } from '@/hooks/use-pf-model-migration'
import { useScrollCondense } from '@/hooks/useScrollCondense'
// repair-duplicates: use dynamic import to avoid side-effect on every render.
// Call `window.loadRepairTools()` in DevTools when needed.
;(window as any).loadRepairTools = async () => {
    const mod = await import('@/domain/pf/repair-duplicates')
    ;(window as any).diagnoseDuplicates = mod.diagnoseDuplicates
    ;(window as any).repairDuplicates = mod.repairDuplicates
    console.log('✅ Repair tools loaded: window.diagnoseDuplicates(), window.repairDuplicates()')
    return mod
}

function LayoutContent() {
    // Sidebar collapse is MANUAL ONLY (via Colapsar button)
    const { isCollapsed } = useSidebar()

    // Header condensing based on scroll (does NOT affect sidebar)
    const { isCondensed } = useScrollCondense()

    return (
        <div className="min-h-screen bg-background flex">
            {/* Sidebar (fixed, always visible on lg+) - collapses ONLY via manual button */}
            <Sidebar />

            {/* Mobile nav drawer (Sheet) - triggered by header hamburger button */}
            <MobileNav />

            {/* Main content area (flex-1, to the right of sidebar) */}
            <div className={cn(
                'flex-1 min-w-0 flex flex-col transition-all duration-300',
                // Add left margin to account for fixed sidebar on lg+
                'lg:ml-64',
                isCollapsed && 'lg:ml-16'
            )}>
                {/* Header - sticky inside main area, condensed state from scroll */}
                {/* NOTE: isCondensed affects ONLY header, NOT sidebar */}
                <ArgfolioHeader condensed={isCondensed} />

                {/* Page content (bottom padding leaves room for the phone tab bar) */}
                <main className="flex-1 p-4 pb-28 md:p-6 md:pb-28 lg:p-8">
                    <Outlet />
                </main>
            </div>

            <MobileTabBar />
        </div>
    )
}

export function AppLayout() {
    usePFSettlement()
    usePFModelMigration()
    return (
        <SidebarProvider>
            <QuickEntryProvider>
                <LayoutContent />
            </QuickEntryProvider>
        </SidebarProvider>
    )
}
