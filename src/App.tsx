import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/lib/theme'
import { RefreshProvider } from '@/hooks/use-auto-refresh'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { AppLayout } from '@/components/layout/app-layout'
import { DashboardPage } from '@/pages/dashboard'
import { AssetsPage } from '@/pages/assets'
import { AssetsPageV2 } from '@/pages/assets-v2'
import { WalletDetailPage } from '@/pages/wallet-detail'
import { PFDetailPage } from '@/pages/pf-detail'
import { AssetDetailPage } from '@/pages/asset-detail'
import { MovementsPageV2 as MovementsPage } from '@/pages/movements/index'
import { HistoryPage } from '@/pages/history'
import { PersonalFinancesPage } from '@/features/personal-finances'
import { SettingsPage } from '@/pages/settings'
import { ImportPage } from '@/pages/import'
import { MarketPage } from '@/pages/market'
import { ToastProvider } from '@/components/ui/toast'
import { GlobalDataHandler } from '@/components/GlobalDataHandler'
import { seedDatabase } from '@/db'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 30000,
        },
    },
})

function App() {
    const [isDbReady, setIsDbReady] = useState(false)

    // Initialize database on app startup
    useEffect(() => {
        seedDatabase().then(() => {
            setIsDbReady(true)
        }).catch((err) => {
            console.error('Failed to initialize database:', err)
            setIsDbReady(true) // Continue anyway
        })
    }, [])

    if (!isDbReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center mx-auto mb-4">
                        <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <p className="text-muted-foreground">Cargando Argfolio...</p>
                </div>
            </div>
        )
    }

    return (
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <ThemeProvider>
                    <RefreshProvider>
                        <TooltipProvider>
                            <BrowserRouter>
                                <GlobalDataHandler>
                                    <Routes>
                                        <Route element={<AppLayout />}>
                                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                                            <Route
                                                path="/dashboard"
                                                element={
                                                    <ErrorBoundary>
                                                        <DashboardPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/market"
                                                element={
                                                    <ErrorBoundary>
                                                        <MarketPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/assets"
                                                element={
                                                    <ErrorBoundary>
                                                        <AssetsPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/assets/:instrumentId"
                                                element={
                                                    <ErrorBoundary>
                                                        <AssetDetailPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            {/* Mis Activos V2 - New Implementation */}
                                            <Route
                                                path="/mis-activos-v2"
                                                element={
                                                    <ErrorBoundary>
                                                        <AssetsPageV2 />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            {/* Wallet Detail - Subpage */}
                                            <Route
                                                path="/mis-activos-v2/billeteras/:accountId"
                                                element={
                                                    <ErrorBoundary>
                                                        <WalletDetailPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            {/* PF Detail - Subpage */}
                                            <Route
                                                path="/mis-activos-v2/plazos-fijos/:pfId"
                                                element={
                                                    <ErrorBoundary>
                                                        <PFDetailPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/movements"
                                                element={
                                                    <ErrorBoundary>
                                                        <MovementsPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/history"
                                                element={
                                                    <ErrorBoundary>
                                                        <HistoryPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            {/* Personal Finances - New Module */}
                                            <Route
                                                path="/personal-finances"
                                                element={
                                                    <ErrorBoundary>
                                                        <PersonalFinancesPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            {/* Redirect old /debts to new module */}
                                            <Route
                                                path="/debts"
                                                element={<Navigate to="/personal-finances" replace />}
                                            />
                                            <Route
                                                path="/settings"
                                                element={
                                                    <ErrorBoundary>
                                                        <SettingsPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                            <Route
                                                path="/import"
                                                element={
                                                    <ErrorBoundary>
                                                        <ImportPage />
                                                    </ErrorBoundary>
                                                }
                                            />
                                        </Route>
                                    </Routes>
                                </GlobalDataHandler>
                            </BrowserRouter>
                        </TooltipProvider>
                    </RefreshProvider>
                </ThemeProvider>
            </ToastProvider>
        </QueryClientProvider>
    )
}

export default App
