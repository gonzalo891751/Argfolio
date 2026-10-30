import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarProvider, useSidebar, MobileNav, MobileTabBar } from '@/components/layout/sidebar'
import { QuickEntryProvider } from '@/features/quick-entry/QuickEntryContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { usePFSettlement } from '@/hooks/use-pf-settlement'
import { usePFModelMigration } from '@/hooks/use-pf-model-migration'
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
                <AppHeader />

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
