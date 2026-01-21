import { useState, useEffect, createContext, useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
    LayoutDashboard,
    Wallet,
    ArrowLeftRight,
    History,
    CreditCard,
    Settings,
    ChevronLeft,
    Menu,
    TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

interface SidebarContextValue {
    isCollapsed: boolean
    setIsCollapsed: (collapsed: boolean) => void
    isMobileOpen: boolean
    setIsMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

export function useSidebar() {
    const context = useContext(SidebarContext)
    if (!context) {
        throw new Error('useSidebar must be used within SidebarProvider')
    }
    return context
}

const STORAGE_KEY = 'argfolio-sidebar-collapsed'

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/market', label: 'Mercado', icon: TrendingUp },
    { path: '/assets', label: 'Mis Activos', icon: Wallet },
    { path: '/movements', label: 'Movimientos', icon: ArrowLeftRight },
    { path: '/history', label: 'Historial', icon: History },
    { path: '/personal-finances', label: 'Finanzas', icon: CreditCard },
    { path: '/settings', label: 'Configurar', icon: Settings },
]

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsedState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored === 'true'
    })
    const [isMobileOpen, setIsMobileOpen] = useState(false)

    const setIsCollapsed = (collapsed: boolean) => {
        localStorage.setItem(STORAGE_KEY, String(collapsed))
        setIsCollapsedState(collapsed)
    }

    return (
        <SidebarContext.Provider
            value={{ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }}
        >
            {children}
        </SidebarContext.Provider>
    )
}

function NavItem({
    path,
    label,
    icon: Icon,
    isCollapsed,
    onClick,
}: {
    path: string
    label: string
    icon: React.ComponentType<{ className?: string }>
    isCollapsed: boolean
    onClick?: () => void
}) {
    const content = (
        <NavLink
            to={path}
            onClick={onClick}
            className={({ isActive }) =>
                cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground',
                    isCollapsed && 'justify-center px-2'
                )
            }
        >
            <Icon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span>{label}</span>}
        </NavLink>
    )

    if (isCollapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
        )
    }

    return content
}

export function Sidebar() {
    const { isCollapsed, setIsCollapsed } = useSidebar()
    const location = useLocation()

    // Close mobile drawer on route change
    useEffect(() => {
        // This effect watches for route changes
    }, [location])

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 z-40 h-screen bg-card border-r transition-all duration-300 hidden lg:flex flex-col',
                isCollapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Logo */}
            <div className={cn(
                'flex items-center h-16 px-4 border-b',
                isCollapsed ? 'justify-center' : 'gap-3'
            )}>
                <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
                    <span className="text-white font-bold text-lg">A</span>
                </div>
                {!isCollapsed && (
                    <span className="font-semibold text-lg">Argfolio</span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => (
                    <NavItem
                        key={item.path}
                        {...item}
                        isCollapsed={isCollapsed}
                    />
                ))}
            </nav>

            {/* Collapse button */}
            <div className="p-3 border-t">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={cn('w-full', isCollapsed ? 'px-2' : '')}
                >
                    <ChevronLeft
                        className={cn(
                            'h-4 w-4 transition-transform',
                            isCollapsed && 'rotate-180'
                        )}
                    />
                    {!isCollapsed && <span className="ml-2">Colapsar</span>}
                </Button>
            </div>
        </aside>
    )
}

export function MobileNav() {
    const { isMobileOpen, setIsMobileOpen } = useSidebar()
    const location = useLocation()

    // Close drawer on route change
    useEffect(() => {
        setIsMobileOpen(false)
    }, [location, setIsMobileOpen])

    return (
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Menú</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center">
                            <span className="text-white font-bold text-lg">A</span>
                        </div>
                        <SheetTitle className="text-lg">Argfolio</SheetTitle>
                    </div>
                </SheetHeader>
                <nav className="p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavItem
                            key={item.path}
                            {...item}
                            isCollapsed={false}
                            onClick={() => setIsMobileOpen(false)}
                        />
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    )
}
