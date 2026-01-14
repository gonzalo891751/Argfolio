import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Sidebar, SidebarProvider, useSidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

function LayoutContent() {
    const { isCollapsed } = useSidebar()

    return (
        <div className="min-h-screen bg-background">
            <Sidebar />
            <div className={cn(
                'transition-all duration-300',
                'lg:pl-64', // Default when sidebar expanded
                isCollapsed && 'lg:pl-16'
            )}>
                <Topbar />
                <main className="p-4 md:p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export function AppLayout() {
    return (
        <SidebarProvider>
            <LayoutContent />
        </SidebarProvider>
    )
}
