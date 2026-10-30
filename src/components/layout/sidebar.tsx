import { useState, useEffect, createContext, useContext } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
    Home,
    Wallet,
    ArrowLeftRight,
    History,
    CreditCard,
    Calculator,
    Settings,
    ChevronLeft,
    Plus,
    Menu,
    TrendingUp,
    BarChart3,
} from 'lucide-react'
import { useQuickEntry } from '@/features/quick-entry/QuickEntryContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'

import { ArgfolioLogo } from '@/components/brand/ArgfolioLogo'

interface SidebarContextValue {
    /** Manual collapse state (user toggle via Colapsar button) */
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
    { path: '/inicio', label: 'Inicio', icon: Home },
    { path: '/activos', label: 'Mis activos', icon: Wallet },
    { path: '/rendimiento', label: 'Rendimiento', icon: BarChart3 },
    { path: '/movements', label: 'Movimientos', icon: ArrowLeftRight },
    { path: '/market', label: 'Mercado', icon: TrendingUp },
]

/** Secondary tools, out of the way */
const moreItems = [
    { path: '/history', label: 'Historial', icon: History },
    { path: '/personal-finances', label: 'Finanzas personales', icon: CreditCard },
    { path: '/finanzas-express', label: 'Presupuesto', icon: Calculator },
    { path: '/settings', label: 'Configuración', icon: Settings },
]

/** Old paths still count as active for their new section */
const ACTIVE_ALIASES: Record<string, string[]> = {
    '/inicio': ['/dashboard'],
    '/activos': ['/mis-activos-v2'],
}

function isNavActive(path: string, pathname: string): boolean {
    return [path, ...(ACTIVE_ALIASES[path] ?? [])].some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    // Manual collapse (user toggle via Colapsar button, persisted)
    const [isCollapsed, setIsCollapsedState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored === 'true'
    })
    const [isMobileOpen, setIsMobileOpen] = useState(false)

    const setIsCollapsed = (collapsed: boolean) => {
        localStorage.setItem(STORAGE_KEY, String(collapsed))
        setIsCollapsedState(collapsed)
    }

    // NOTE: Sidebar does NOT auto-collapse on scroll.
    // Only the top header condenses on scroll.

    return (
        <SidebarContext.Provider
            value={{
                isCollapsed,
                setIsCollapsed,
                isMobileOpen,
                setIsMobileOpen
            }}
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
    const { pathname } = useLocation()
    const isActive = isNavActive(path, pathname)
    const content = (
        <NavLink
            to={path}
            onClick={onClick}
            className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                'hover:bg-accent hover:text-accent-foreground',
                isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground',
                isCollapsed && 'justify-center px-2'
            )}
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

    // Check for reduced motion
    const prefersReducedMotion = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 z-40 h-screen bg-card border-r hidden lg:flex flex-col',
                // Smooth transition unless reduced motion
                !prefersReducedMotion && 'transition-all duration-300 ease-out',
                isCollapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Logo */}
            <div className={cn(
                'flex items-center h-16 px-4 border-b',
                !prefersReducedMotion && 'transition-all duration-300',
                isCollapsed ? 'justify-center' : 'gap-3'
            )}>
                {isCollapsed ? (
                    <ArgfolioLogo variant="mark" className="h-8 w-8" />
                ) : (
                    <ArgfolioLogo variant="full" className="h-9 w-auto" />
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                <QuickEntryButton isCollapsed={isCollapsed} />
                {navItems.map((item) => (
                    <NavItem
                        key={item.path}
                        {...item}
                        isCollapsed={isCollapsed}
                    />
                ))}
                <div className={cn('pt-4 pb-1 text-xs font-medium text-muted-foreground/80', isCollapsed ? 'text-center' : 'px-3')}>
                    {isCollapsed ? '···' : 'Más'}
                </div>
                {moreItems.map((item) => (
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
            {/* No SheetTrigger here — header hamburger button controls isMobileOpen via context */}
            <SheetContent side="left" className="w-72 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="border-b px-4 py-4">
                    <div className="flex items-center gap-3">
                        <ArgfolioLogo variant="full" className="h-9 w-auto" />
                    </div>
                </SheetHeader>
                <nav className="p-4 space-y-1">
                    {[...navItems, ...moreItems].map((item) => (
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

function QuickEntryButton({ isCollapsed }: { isCollapsed: boolean }) {
    const { openQuickEntry } = useQuickEntry()
    return (
        <button
            type="button"
            onClick={() => openQuickEntry()}
            className={cn(
                'mb-3 flex w-full items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90',
                isCollapsed && 'justify-center px-2'
            )}
            title="Cargar un movimiento"
        >
            <Plus className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span>Cargar</span>}
        </button>
    )
}

/**
 * Phone bottom bar: the three places you use most and "Cargar" in the middle.
 * "Más" opens the drawer with the rest.
 */
export function MobileTabBar() {
    const { pathname } = useLocation()
    const { setIsMobileOpen } = useSidebar()
    const { openQuickEntry } = useQuickEntry()

    const tab = (path: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
        const active = isNavActive(path, pathname)
        return (
            <NavLink
                to={path}
                className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}
            >
                <Icon className="h-5 w-5" />
                {label}
            </NavLink>
        )
    }

    return (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegación principal">
            <div className="mx-auto flex max-w-md items-stretch">
                {tab('/inicio', 'Inicio', Home)}
                {tab('/activos', 'Activos', Wallet)}
                <div className="flex flex-1 items-center justify-center">
                    <button
                        type="button"
                        onClick={() => openQuickEntry()}
                        className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                        aria-label="Cargar"
                    >
                        <Plus className="h-6 w-6" />
                    </button>
                </div>
                {tab('/movements', 'Movimientos', ArrowLeftRight)}
                <button
                    type="button"
                    onClick={() => setIsMobileOpen(true)}
                    className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
                >
                    <Menu className="h-5 w-5" />
                    Más
                </button>
            </div>
        </nav>
    )
}
