/**
 * Assets V2 Page — Mis Activos V2
 * 
 * Complete reimplementation of the Mis Activos page with:
 * - KPI Dashboard
 * - Rubro/Provider/Item hierarchy
 * - Full-page detail overlays
 * - "Cómo se calcula" side panel
 * - Provider commission settings
 * - No flickering (accrual moved to global scheduler)
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'
import { usePortfolioV2, type RubroV2, type ProviderV2, type ItemV2, type ItemKind } from '@/features/portfolioV2'
import { useFxOverrides, type FxOverrideFamily, type FxOverrideSide } from '@/features/portfolioV2/fxOverrides'
import { useProviderSettings } from '@/hooks/useProviderSettings'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
    Wallet,
    PiggyBank,
    Calendar,
    BarChart3,
    Bitcoin,
    TrendingUp,
    Landmark,
    DollarSign,
    ChevronDown,
    ChevronRight,
    Settings,
    Info,
    X,
    RefreshCw,
    AlertTriangle,
    LayoutGrid,
    List,
} from 'lucide-react'

type FxOverrideMode = 'auto' | 'manual'

function getFxRateForSelection(
    fx: NonNullable<ReturnType<typeof usePortfolioV2>>['fx'],
    family: FxOverrideFamily,
    side: FxOverrideSide
): number {
    // Convention: C (Compra USD) -> uses "venta" (sell/ask). V (Venta USD) -> uses "compra" (buy/bid).
    if (family === 'Cripto') return side === 'C' ? fx.cryptoSell : fx.cryptoBuy
    if (family === 'MEP') return side === 'C' ? fx.mepSell : fx.mepBuy
    return side === 'C' ? fx.officialSell : fx.officialBuy
}

// =============================================================================
// Icon Map
// =============================================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Wallet,
    PiggyBank,
    Calendar,
    BarChart3,
    Bitcoin,
    TrendingUp,
}

// =============================================================================
// Main Page Component
// =============================================================================

export function AssetsPageV2() {
    const portfolio = usePortfolioV2()
    const { calculateVNR } = useProviderSettings()
    const navigate = useNavigate()
    const location = useLocation()
    const { toast } = useToast()
    const { getOverride, setOverride, clearOverride } = useFxOverrides()

    const [fxOverrideTarget, setFxOverrideTarget] = useState<null | {
        accountId: string
        kind: ItemKind
        title: string
        autoMeta?: ItemV2['fxMeta']
    }>(null)

    const [fxOverrideMode, setFxOverrideMode] = useState<FxOverrideMode>('auto')
    const [fxOverrideFamily, setFxOverrideFamily] = useState<FxOverrideFamily>('Oficial')
    const [fxOverrideSide, setFxOverrideSide] = useState<FxOverrideSide>('V')

    // UI State
    const [expandedRubros, setExpandedRubros] = useState<Set<string>>(new Set())
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set())
    const [selectedItem, setSelectedItem] = useState<ItemV2 | null>(null)
    const [selectedProvider, setSelectedProvider] = useState<ProviderV2 | null>(null)
    const [showCalcPanel, setShowCalcPanel] = useState(false)
    const [grouping, setGrouping] = useState<'rubros' | 'cuentas'>('rubros')
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [settingsProviderId, setSettingsProviderId] = useState<string | null>(null)
    const didInitWalletsExpand = useRef(false)
    const didLogDebug = useRef(false)

    const debug = useMemo(() => {
        return new URLSearchParams(location.search).get('debug') === '1'
    }, [location.search])

    // Default UX: keep Billeteras expanded (rubro + providers) on first load
    useEffect(() => {
        if (!portfolio || portfolio.isLoading) return
        if (didInitWalletsExpand.current) return

        const wallets = portfolio.rubros.find(r => r.id === 'wallets')
        if (wallets) {
            setExpandedRubros(prev => {
                const next = new Set(prev)
                next.add('wallets')
                return next
            })
            setExpandedProviders(prev => {
                const next = new Set(prev)
                wallets.providers.forEach(p => next.add(p.id))
                return next
            })
        }

        didInitWalletsExpand.current = true
    }, [portfolio])

    // Optional dev-only debug: /mis-activos-v2?debug=1
    useEffect(() => {
        if (!debug) return
        if (!portfolio || portfolio.isLoading) return
        if (didLogDebug.current) return

        const wallets = portfolio.rubros.find(r => r.id === 'wallets')
        if (wallets) {
            console.table(wallets.providers.map(p => ({
                providerId: p.id,
                providerName: p.name,
                baseAccountId: p.id.replace(/-cash$/, ''),
                totalArs: p.totals.ars,
                totalUsd: p.totals.usd,
                items: p.items.length,
            })))
        }

        didLogDebug.current = true
    }, [debug, portfolio])

    const openFxOverride = (target: {
        accountId: string
        kind: ItemKind
        title: string
        autoMeta?: ItemV2['fxMeta']
    }) => {
        setFxOverrideTarget(target)
    }

    useEffect(() => {
        if (!fxOverrideTarget) return

        const existing = getOverride(fxOverrideTarget.accountId, fxOverrideTarget.kind)
        if (existing) {
            setFxOverrideMode('manual')
            setFxOverrideFamily(existing.family)
            setFxOverrideSide(existing.side)
            return
        }

        setFxOverrideMode('auto')
        const auto = fxOverrideTarget.autoMeta
        setFxOverrideFamily(auto?.family ?? 'Oficial')
        setFxOverrideSide(auto?.side ?? 'V')
    }, [fxOverrideTarget, getOverride])

    const applyFxOverride = () => {
        if (!portfolio || !fxOverrideTarget) return

        const { accountId, kind } = fxOverrideTarget

        if (fxOverrideMode === 'auto') {
            clearOverride(accountId, kind)
            setFxOverrideTarget(null)
            return
        }

        const rate = getFxRateForSelection(portfolio.fx, fxOverrideFamily, fxOverrideSide)
        if (!Number.isFinite(rate) || rate <= 0) {
            clearOverride(accountId, kind)
            toast({
                title: 'TC no disponible',
                description: `No hay cotización para ${fxOverrideFamily} ${fxOverrideSide}. Se usará Auto.`,
                variant: 'info',
            })
            setFxOverrideTarget(null)
            return
        }

        setOverride(accountId, kind, { family: fxOverrideFamily, side: fxOverrideSide })
        setFxOverrideTarget(null)
    }

    // Toggle helpers
    const toggleRubro = (id: string) => {
        setExpandedRubros(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleProvider = (id: string) => {
        setExpandedProviders(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const openItemDetail = (item: ItemV2, provider: ProviderV2) => {
        // For wallet/cash items, navigate to detail subpage
        const isWalletOrCash = item.kind === 'wallet_yield' || item.kind === 'cash_ars' || item.kind === 'cash_usd'
        if (isWalletOrCash) {
            // Use accountId from item, falling back to provider id (removing -cash suffix if present)
            const accountId = item.accountId || provider.id.replace(/-cash$/, '')
            navigate(`/mis-activos-v2/billeteras/${accountId}?kind=${item.kind}`)
            return
        }
        // For plazo fijo items, navigate to PF detail subpage
        if (item.kind === 'plazo_fijo') {
            navigate(`/mis-activos-v2/plazos-fijos/${item.id}`)
            return
        }
        // For crypto items (volatile), navigate to crypto detail subpage
        if (item.kind === 'crypto') {
            const accountId = item.accountId || provider.id
            navigate(`/mis-activos-v2/cripto/${accountId}/${item.symbol}`)
            return
        }
        // For CEDEAR items, navigate to cedear detail subpage
        if (item.kind === 'cedear') {
            const accountId = item.accountId || provider.id
            navigate(`/mis-activos-v2/cedears/${accountId}/${item.symbol}`)
            return
        }
        // For FCI items, navigate to fci detail subpage
        if (item.kind === 'fci') {
            const accountId = item.accountId || provider.id
            const instrumentId = encodeURIComponent(item.instrumentId || item.symbol)
            navigate(`/mis-activos-v2/fondos/${accountId}/${instrumentId}`)
            return
        }
        // For other items, use overlay
        setSelectedItem(item)
        setSelectedProvider(provider)
    }

    const closeDetail = () => {
        setSelectedItem(null)
        setSelectedProvider(null)
    }

    const openProviderSettings = (providerId: string) => {
        setSettingsProviderId(providerId)
        setShowSettingsModal(true)
    }

    // Flatten providers for "Cuentas" view
    const allProviders = useMemo(() => {
        if (!portfolio) return []
        return portfolio.rubros
            .flatMap(r => r.providers)
            .sort((a, b) => b.totals.ars - a.totals.ars)
    }, [portfolio])

    // Loading state
    if (!portfolio || portfolio.isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground">Cargando portfolio...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Mis Activos</h1>
                    <p className="text-sm text-muted-foreground">
                        Actualizado: {new Date(portfolio.asOfISO).toLocaleString('es-AR')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowCalcPanel(true)}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                    >
                        <Info className="h-4 w-4" />
                        Cómo se calcula
                    </button>
                </div>
            </div>

            {/* Inferred Balance Alert */}
            {portfolio.flags.inferredBalanceCount > 0 && (
                <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                    <p className="text-sm text-yellow-200">
                        {portfolio.flags.inferredMessage}
                    </p>
                </div>
            )}

            {/* KPI Dashboard */}
            <KPIDashboard portfolio={portfolio} />

            {/* View Toggle */}
            <div className="flex bg-muted/30 p-1 rounded-lg border border-border/50 self-start w-fit">
                <button
                    onClick={() => setGrouping('rubros')}
                    className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                        grouping === 'rubros' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                    )}
                >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Rubros
                </button>
                <button
                    onClick={() => setGrouping('cuentas')}
                    className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2",
                        grouping === 'cuentas' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
                    )}
                >
                    <List className="h-3.5 w-3.5" />
                    Cuentas
                </button>
            </div>

            {/* Content List */}
            {grouping === 'rubros' ? (
                /* Rubros View */
                <div className="space-y-4">
                    {portfolio.rubros.map(rubro => (
                        <RubroCard
                            key={rubro.id}
                            rubro={rubro}
                            isExpanded={expandedRubros.has(rubro.id)}
                            onToggle={() => toggleRubro(rubro.id)}
                            expandedProviders={expandedProviders}
                            onToggleProvider={toggleProvider}
                            onItemClick={openItemDetail}
                            onProviderSettings={openProviderSettings}
                            calculateVNR={calculateVNR}
                            onOpenFxOverride={openFxOverride}
                        />
                    ))}
                </div>
            ) : (
                /* Cuentas View (Flat List) */
                <div className="space-y-4">
                    {allProviders.map(provider => (
                        <div key={provider.id} className="border border-border rounded-xl overflow-hidden bg-card">
                            <ProviderSection
                                provider={provider}
                                isExpanded={expandedProviders.has(provider.id)}
                                onToggle={() => toggleProvider(provider.id)}
                                onItemClick={(item) => openItemDetail(item, provider)}
                                onSettings={() => openProviderSettings(provider.id)}
                                onOpenFxOverride={openFxOverride}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {portfolio.rubros.length === 0 && (
                <div className="text-center py-12 bg-muted/30 rounded-lg">
                    <p className="text-muted-foreground">No hay activos registrados</p>
                </div>
            )}

            {/* Detail Overlay */}
            {selectedItem && selectedProvider && (
                <DetailOverlay
                    item={selectedItem}
                    provider={selectedProvider}
                    portfolio={portfolio}
                    onClose={closeDetail}
                    calculateVNR={calculateVNR}
                />
            )}

            {/* Calc Panel */}
            {showCalcPanel && (
                <CalcPanel
                    fx={portfolio.fx}
                    onClose={() => setShowCalcPanel(false)}
                />
            )}

            {/* Settings Modal */}
            {showSettingsModal && settingsProviderId && (
                <SettingsModal
                    providerId={settingsProviderId}
                    providerName={
                        portfolio.rubros
                            .flatMap(r => r.providers)
                            .find(p => p.id === settingsProviderId)?.name ?? ''
                    }
                    onClose={() => setShowSettingsModal(false)}
                />
            )}

            {/* FX Override Modal */}
            <Dialog open={!!fxOverrideTarget} onOpenChange={(open) => !open && setFxOverrideTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Tipo de cambio</DialogTitle>
                        <DialogDescription>
                            {fxOverrideTarget?.title}
                        </DialogDescription>
                    </DialogHeader>

                    {fxOverrideTarget && (
                        <div className="space-y-4 px-6 pb-2">
                            <div className="flex items-center gap-2">
                                <button
                                    className={cn(
                                        'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                                        fxOverrideMode === 'auto'
                                            ? 'bg-primary/10 border-primary/30 text-primary'
                                            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                                    )}
                                    onClick={() => setFxOverrideMode('auto')}
                                    type="button"
                                >
                                    Auto (recomendado)
                                </button>
                                <button
                                    className={cn(
                                        'flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                                        fxOverrideMode === 'manual'
                                            ? 'bg-primary/10 border-primary/30 text-primary'
                                            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                                    )}
                                    onClick={() => setFxOverrideMode('manual')}
                                    type="button"
                                >
                                    Manual
                                </button>
                            </div>

                            <div className={cn('grid grid-cols-2 gap-3', fxOverrideMode === 'auto' && 'opacity-50 pointer-events-none')}>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Familia</p>
                                    <Select
                                        value={fxOverrideFamily}
                                        onChange={(e) => setFxOverrideFamily(e.target.value as FxOverrideFamily)}
                                        options={[
                                            { value: 'Oficial', label: 'Oficial' },
                                            { value: 'MEP', label: 'MEP' },
                                            { value: 'Cripto', label: 'Cripto' },
                                        ]}
                                    />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground mb-1">Lado</p>
                                    <Select
                                        value={fxOverrideSide}
                                        onChange={(e) => setFxOverrideSide(e.target.value as FxOverrideSide)}
                                        options={[
                                            { value: 'C', label: 'C (Compra)' },
                                            { value: 'V', label: 'V (Venta)' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="text-sm flex items-center justify-between bg-muted/30 border border-border rounded-lg px-3 py-2">
                                <span className="text-muted-foreground">Rate actual</span>
                                <span className="font-mono">
                                    {(() => {
                                        const rate = getFxRateForSelection(
                                            portfolio.fx,
                                            fxOverrideMode === 'auto'
                                                ? (fxOverrideTarget.autoMeta?.family ?? 'Oficial')
                                                : fxOverrideFamily,
                                            fxOverrideMode === 'auto'
                                                ? (fxOverrideTarget.autoMeta?.side ?? 'V')
                                                : fxOverrideSide
                                        )
                                        return Number.isFinite(rate) && rate > 0 ? `$${rate.toFixed(2)}` : '—'
                                    })()}
                                </span>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex !justify-between gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => {
                                if (!fxOverrideTarget) return
                                clearOverride(fxOverrideTarget.accountId, fxOverrideTarget.kind)
                                setFxOverrideTarget(null)
                            }}
                        >
                            Restaurar Auto
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" type="button" onClick={() => setFxOverrideTarget(null)}>
                                Cancelar
                            </Button>
                            <Button type="button" onClick={applyFxOverride}>
                                Aplicar
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// =============================================================================
// KPI Dashboard
// =============================================================================

interface KPIDashboardProps {
    portfolio: NonNullable<ReturnType<typeof usePortfolioV2>>
}

function KPIDashboard({ portfolio }: KPIDashboardProps) {
    const { kpis, fx } = portfolio

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Patrimonio */}
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-4">
                <p className="text-xs uppercase text-muted-foreground mb-1">Patrimonio Total</p>
                <p className="text-2xl font-bold font-mono">{formatMoneyARS(kpis.totalArs)}</p>
                <p className="text-sm text-muted-foreground font-mono">
                    ≈ {formatMoneyUSD(kpis.totalUsd)}
                </p>
            </div>

            {/* Composición USD */}
            <div className="bg-muted/50 border border-border rounded-xl p-4">
                <p className="text-xs uppercase text-muted-foreground mb-2">Composición USD</p>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span>USD Billete</span>
                        <span className="font-mono">{formatPercent(kpis.pctUsdHard / 100)}</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${kpis.pctUsdHard}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span>USD Equivalente</span>
                        <span className="font-mono">{formatPercent(kpis.pctUsdEq / 100)}</span>
                    </div>
                    <div className="h-2 bg-background rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${kpis.pctUsdEq}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* PnL */}
            <div className="bg-muted/50 border border-border rounded-xl p-4">
                <p className="text-xs uppercase text-muted-foreground mb-1">Resultado No Realizado</p>
                <p className={cn(
                    "text-2xl font-bold font-mono",
                    kpis.pnlUnrealizedArs >= 0 ? "text-green-500" : "text-red-500"
                )}>
                    {kpis.pnlUnrealizedArs >= 0 ? '+' : ''}{formatMoneyARS(kpis.pnlUnrealizedArs)}
                </p>
                <p className="text-sm text-muted-foreground font-mono">
                    ≈ {kpis.pnlUnrealizedUsd >= 0 ? '+' : ''}{formatMoneyUSD(kpis.pnlUnrealizedUsd)}
                </p>
            </div>

            {/* FX Rates */}
            <div className="bg-muted/50 border border-border rounded-xl p-4">
                <p className="text-xs uppercase text-muted-foreground mb-2">Tipos de Cambio</p>
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Oficial</span>
                        <span className="font-mono">${fx.officialSell.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">MEP</span>
                        <span className="font-mono">${fx.mepSell.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Cripto</span>
                        <span className="font-mono">${fx.cryptoSell.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// =============================================================================
// Rubro Card
// =============================================================================

interface RubroCardProps {
    rubro: RubroV2
    isExpanded: boolean
    onToggle: () => void
    expandedProviders: Set<string>
    onToggleProvider: (id: string) => void
    onItemClick: (item: ItemV2, provider: ProviderV2) => void
    onProviderSettings: (providerId: string) => void
    calculateVNR: (providerId: string, value: number, side: 'buy' | 'sell') => number
    onOpenFxOverride: (target: { accountId: string; kind: ItemKind; title: string; autoMeta?: ItemV2['fxMeta'] }) => void
}

function RubroCard({
    rubro,
    isExpanded,
    onToggle,
    expandedProviders,
    onToggleProvider,
    onItemClick,
    onProviderSettings,
    onOpenFxOverride,
}: RubroCardProps) {
    const IconComponent = ICON_MAP[rubro.icon] ?? Wallet

    return (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
            {/* Rubro Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                        <h3 className="font-semibold">{rubro.name}</h3>
                        <p className="text-xs text-muted-foreground">
                            {rubro.fxMeta
                                ? `TC ${rubro.fxMeta.family} ${rubro.fxMeta.side} $${rubro.fxMeta.rate.toFixed(2)}`
                                : rubro.fxPolicy
                            }
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-mono font-semibold">{formatMoneyARS(rubro.totals.ars)}</p>
                        <p className="text-xs text-emerald-400 font-mono">
                            ≈ {formatMoneyUSD(rubro.totals.usd)}
                        </p>
                    </div>
                    {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                </div>
            </button>

            {/* Providers List */}
            {isExpanded && (
                <div className="border-t border-border">
                    {rubro.providers.map(provider => (
                        <ProviderSection
                            key={provider.id}
                            provider={provider}
                            isExpanded={expandedProviders.has(provider.id)}
                            onToggle={() => onToggleProvider(provider.id)}
                            onItemClick={(item) => onItemClick(item, provider)}
                            onSettings={() => onProviderSettings(provider.id)}
                            onOpenFxOverride={onOpenFxOverride}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Provider Section
// =============================================================================

interface ProviderSectionProps {
    provider: ProviderV2
    isExpanded: boolean
    onToggle: () => void
    onItemClick: (item: ItemV2) => void
    onSettings: () => void
    onOpenFxOverride: (target: { accountId: string; kind: ItemKind; title: string; autoMeta?: ItemV2['fxMeta'] }) => void
}

function ProviderSection({
    provider,
    isExpanded,
    onToggle,
    onItemClick,
    onSettings,
    onOpenFxOverride,
}: ProviderSectionProps) {
    const isUsdPrimary = Math.abs(provider.totals.ars) < 1 && Math.abs(provider.totals.usd) >= 0.01
    const primary = isUsdPrimary ? formatMoneyUSD(provider.totals.usd) : formatMoneyARS(provider.totals.ars)
    const secondary = isUsdPrimary ? formatMoneyARS(provider.totals.ars) : formatMoneyUSD(provider.totals.usd)

    const baseAccountId = provider.id.replace(/-cash$/, '')
    const kindForProviderFx: ItemKind | null = useMemo(() => {
        // Prefer cash items (wallet pattern), then fall back to first item with fxMeta
        const cashKinds: ItemKind[] = ['cash_usd', 'cash_ars', 'wallet_yield']
        for (const k of cashKinds) {
            if (provider.items.some(it => it.kind === k)) return k
        }
        // For non-cash providers (CEDEARs, Cripto, FCI, PF), use first item's kind
        const firstWithFx = provider.items.find(it => it.fxMeta)
        if (firstWithFx) return firstWithFx.kind
        return null
    }, [provider.items])

    const autoMetaForProvider = useMemo(() => {
        if (!kindForProviderFx) return provider.fxMeta
        return provider.items.find(it => it.kind === kindForProviderFx)?.fxMeta ?? provider.fxMeta
    }, [kindForProviderFx, provider.fxMeta, provider.items])

    return (
        <div className="border-b border-border last:border-b-0">
            {/* Provider Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <button
                    onClick={onToggle}
                    className="flex items-center gap-2 flex-1 text-left"
                >
                    {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{provider.name}</span>
                </button>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-mono text-sm font-semibold">{primary}</p>
                        <div className="flex items-center justify-end gap-1.5">
                            <p className="text-xs text-emerald-400 font-mono">≈ {secondary}</p>
                            {provider.fxMeta && provider.fxMeta.rate > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!kindForProviderFx) return
                                        onOpenFxOverride({
                                            accountId: baseAccountId,
                                            kind: kindForProviderFx,
                                            title: provider.name,
                                            autoMeta: autoMetaForProvider,
                                        })
                                    }}
                                    className="text-[9px] font-mono text-muted-foreground bg-muted/50 hover:bg-muted px-1 py-0.5 rounded whitespace-nowrap transition-colors"
                                    title="Elegir tipo de cambio"
                                >
                                    TC {provider.fxMeta.family} {provider.fxMeta.side}
                                </button>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onSettings()
                        }}
                        className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                        title="Configurar comisiones"
                    >
                        <Settings className="h-4 w-4 text-muted-foreground" />
                    </button>
                </div>
            </div>

            {/* Items List */}
            {isExpanded && (() => {
                // Separate stablecoins from volatile crypto for visual grouping
                const stableItems = provider.items.filter(it => it.kind === 'stable')
                const volatileItems = provider.items.filter(it => it.kind !== 'stable')
                const hasStables = stableItems.length > 0
                const hasVolatiles = volatileItems.length > 0

                return (
                    <div>
                        {/* Volatile assets */}
                        {hasVolatiles && (
                            <div className="divide-y divide-border/50">
                                {volatileItems.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        onClick={() => onItemClick(item)}
                                        onOpenFxOverride={onOpenFxOverride}
                                        providerName={provider.name}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Stablecoin liquidity section */}
                        {hasStables && (
                            <>
                                <div className="flex justify-between items-center px-4 pt-4 pb-2">
                                    <span className="text-[11px] font-mono text-sky-400 uppercase tracking-widest">
                                        Liquidez (Stable)
                                    </span>
                                    <span className="text-[10px] text-muted-foreground hidden md:inline-block">
                                        USDT se considera dólar cripto
                                    </span>
                                </div>
                                <div className="divide-y divide-border/50">
                                    {stableItems.map(item => (
                                        <div
                                            key={item.id}
                                            className="border-l-4 border-l-sky-500/50 bg-gradient-to-r from-sky-500/5 to-transparent"
                                        >
                                            <ItemRow
                                                item={item}
                                                onClick={() => onItemClick(item)}
                                                onOpenFxOverride={onOpenFxOverride}
                                                providerName={provider.name}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Fallback: no special grouping needed */}
                        {!hasStables && !hasVolatiles && (
                            <div className="divide-y divide-border/50">
                                {provider.items.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        onClick={() => onItemClick(item)}
                                        onOpenFxOverride={onOpenFxOverride}
                                        providerName={provider.name}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )
            })()}
        </div>
    )
}

// =============================================================================
// Item Row
// =============================================================================

interface ItemRowProps {
    item: ItemV2
    onClick: () => void
    onOpenFxOverride: (target: { accountId: string; kind: ItemKind; title: string; autoMeta?: ItemV2['fxMeta'] }) => void
    providerName: string
}

function ItemRow({ item, onClick, onOpenFxOverride, providerName }: ItemRowProps) {
    const isWalletOrCash = item.kind === 'wallet_yield' || item.kind === 'cash_ars' || item.kind === 'cash_usd'
    const isUsdCash = item.kind === 'cash_usd'
    const isUsdNative = item.kind === 'crypto' || item.kind === 'stable'
    const hasTna = item.yieldMeta?.tna && item.yieldMeta.tna > 0
    const fciPriceSource = item.kind === 'fci' ? item.priceMeta?.source : undefined
    // For USD-native assets, secondary is ARS (check valArs). For others, secondary is USD (check valUsd).
    const hasSecondary = isUsdNative || isUsdCash
        ? Math.abs(item.valArs) >= 1
        : Math.abs(item.valUsd) >= 0.01

    // Determine primary/secondary display based on native currency
    const primaryValue = isUsdNative
        ? formatMoneyUSD(item.valUsd)
        : isUsdCash
            ? formatMoneyUSD(item.valUsd)
            : formatMoneyARS(item.valArs)
    const secondaryValue = isUsdNative || isUsdCash
        ? formatMoneyARS(item.valArs)
        : formatMoneyUSD(item.valUsd)

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors text-left group"
        >
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    isUsdCash ? "bg-emerald-500/10 text-emerald-400" :
                        isWalletOrCash ? "bg-sky-500/10 text-sky-400" : "bg-muted"
                )}>
                    {isWalletOrCash ? (
                        isUsdCash ? <DollarSign className="h-4 w-4" /> : <Landmark className="h-4 w-4" />
                    ) : item.symbol.slice(0, 2)}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors">{item.label}</p>
                        {/* FCI Pricing Guard: show when using estimated pricing */}
                        {fciPriceSource && fciPriceSource !== 'quote' && (
                            <span
                                className={cn(
                                    'text-[10px] font-bold px-1.5 py-0.5 rounded border',
                                    fciPriceSource === 'missing'
                                        ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                )}
                                title={
                                    fciPriceSource === 'last_trade'
                                        ? 'Precio estimado: última compra registrada'
                                        : fciPriceSource === 'avg_cost'
                                            ? 'Precio estimado: costo promedio'
                                            : 'Sin precio disponible (revisar cotización del fondo)'
                                }
                            >
                                {fciPriceSource === 'missing' ? 'Sin precio' : 'Estimado'}
                            </span>
                        )}
                        {/* TNA + TEA Chips */}
                        {hasTna && (
                            <>
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                    TNA {item.yieldMeta!.tna.toFixed(0)}%
                                </span>
                                {item.yieldMeta!.tea && item.yieldMeta!.tea > 0 && (
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                        TEA {item.yieldMeta!.tea.toFixed(1)}%
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {isUsdCash ? 'Tenencia en USD' : hasTna ? '' : isWalletOrCash ? 'Liquidez inmediata' :
                            item.qty ? `${item.qty.toLocaleString('es-AR', { maximumFractionDigits: 4 })} unidades` : ''}
                    </p>
                </div>
            </div>
            <div className="text-right">
                {/* Primary value */}
                <p className="font-mono text-base font-semibold">
                    {primaryValue}
                </p>
                {/* Secondary value (dual-currency) — unified for ALL item types */}
                {hasSecondary ? (
                    <div className="flex items-center justify-end gap-1.5">
                        <p className="text-xs text-emerald-400 font-mono">
                            ≈ {secondaryValue}
                        </p>
                        {/* TC Chip — clickable for FX override */}
                        {item.fxMeta && item.fxMeta.rate > 0 && (
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onOpenFxOverride({
                                        accountId: item.accountId,
                                        kind: item.kind,
                                        title: providerName,
                                        autoMeta: item.fxMeta,
                                    })
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        onOpenFxOverride({
                                            accountId: item.accountId,
                                            kind: item.kind,
                                            title: providerName,
                                            autoMeta: item.fxMeta,
                                        })
                                    }
                                }}
                                className="text-[9px] font-mono text-muted-foreground bg-muted/50 hover:bg-muted px-1 py-0.5 rounded whitespace-nowrap transition-colors cursor-pointer"
                                title="Elegir tipo de cambio"
                            >
                                TC {item.fxMeta.family} {item.fxMeta.side}
                            </span>
                        )}
                    </div>
                ) : null}
            </div>
        </button>
    )
}

// =============================================================================
// Detail Overlay - Enhanced for Billeteras and Frascos
// =============================================================================

interface DetailOverlayProps {
    item: ItemV2
    provider: ProviderV2
    portfolio: NonNullable<ReturnType<typeof usePortfolioV2>>
    onClose: () => void
    calculateVNR: (providerId: string, value: number, side: 'buy' | 'sell') => number
}

function DetailOverlay({
    item,
    provider,
    portfolio,
    onClose,
    calculateVNR,
}: DetailOverlayProps) {
    const { fx } = portfolio
    const oficialSell = fx.officialSell || 1

    // VNR calculation
    const vnrArs = calculateVNR(provider.id, item.valArs, 'sell')
    const vnrUsd = vnrArs / oficialSell

    // Yield calculations for wallet_yield items
    const tna = item.yieldMeta?.tna ?? 0
    const tea = tna > 0 ? (Math.pow(1 + tna / 100 / 365, 365) - 1) * 100 : 0
    const capitalArs = item.valArs
    const capitalUsdOficial = capitalArs / oficialSell

    // Daily interest (for tomorrow)
    const dailyInterestArs = capitalArs * (tna / 100 / 365)
    const dailyInterestUsd = dailyInterestArs / oficialSell

    // 30-day projection
    const interest30dArs = capitalArs * (tna / 100 / 365) * 30
    const total30dArs = capitalArs + interest30dArs
    const interest30dUsd = interest30dArs / oficialSell
    const total30dUsd = total30dArs / oficialSell

    // 1-year projection (compound)
    const interest1yArs = capitalArs * tea / 100
    const total1yArs = capitalArs + interest1yArs
    const interest1yUsd = interest1yArs / oficialSell
    const total1yUsd = total1yArs / oficialSell

    // Determine the type
    const isWalletYield = item.kind === 'wallet_yield'
    const isPlazoFijo = item.kind === 'plazo_fijo'

    return (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <p className="text-sm text-muted-foreground mb-1">
                            {provider.name}
                        </p>
                        <h2 className="text-2xl font-bold">{item.label}</h2>
                        <p className="text-sm text-muted-foreground">{item.symbol}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* ============================================================ */}
                {/* BILLETERA / FRASCO Detail (yield-enabled) */}
                {/* ============================================================ */}
                {isWalletYield && (
                    <>
                        {/* Capital */}
                        <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
                            <p className="text-xs uppercase text-muted-foreground mb-1">Capital</p>
                            <p className="text-2xl font-bold font-mono">{formatMoneyARS(capitalArs)}</p>
                            <p className="text-sm text-green-400 font-mono">
                                ≈ {formatMoneyUSD(capitalUsdOficial)} ({item.fxMeta ? `TC ${item.fxMeta.family} ${item.fxMeta.side === 'V' ? 'Venta' : 'Compra'}` : 'Oficial Venta'})
                            </p>
                        </div>

                        {/* TNA / TEA */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs uppercase text-muted-foreground">TNA</p>
                                    {/* Note: Editar tasa functionality would require state management */}
                                </div>
                                <p className="text-xl font-bold font-mono text-emerald-400">{tna.toFixed(2)}%</p>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <p className="text-xs uppercase text-muted-foreground mb-1">TEA</p>
                                <p className="text-xl font-bold font-mono text-emerald-400">{tea.toFixed(2)}%</p>
                                <p className="text-xs text-muted-foreground">Capitalización diaria</p>
                            </div>
                        </div>

                        {/* Interés Mañana */}
                        <div className="bg-muted/50 border border-border rounded-xl p-4 mb-4">
                            <p className="text-xs uppercase text-muted-foreground mb-2">Interés Mañana</p>
                            <div className="flex justify-between items-baseline">
                                <p className="text-lg font-mono font-semibold text-emerald-400">
                                    +{formatMoneyARS(dailyInterestArs)}
                                </p>
                                <p className="text-sm text-muted-foreground font-mono">
                                    ≈ {formatMoneyUSD(dailyInterestUsd)}
                                </p>
                            </div>
                        </div>

                        {/* Proyecciones */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            {/* 30 días */}
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <p className="text-xs uppercase text-muted-foreground mb-3">Proyección 30 Días</p>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Interés</span>
                                        <span className="font-mono text-emerald-400">+{formatMoneyARS(interest30dArs)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span></span>
                                        <span className="font-mono">≈ {formatMoneyUSD(interest30dUsd)}</span>
                                    </div>
                                    <hr className="border-border" />
                                    <div className="flex justify-between font-semibold">
                                        <span>Total</span>
                                        <span className="font-mono">{formatMoneyARS(total30dArs)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span></span>
                                        <span className="font-mono">≈ {formatMoneyUSD(total30dUsd)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 1 año */}
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <p className="text-xs uppercase text-muted-foreground mb-3">Proyección 1 Año</p>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Interés</span>
                                        <span className="font-mono text-emerald-400">+{formatMoneyARS(interest1yArs)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span></span>
                                        <span className="font-mono">≈ {formatMoneyUSD(interest1yUsd)}</span>
                                    </div>
                                    <hr className="border-border" />
                                    <div className="flex justify-between font-semibold">
                                        <span>Total</span>
                                        <span className="font-mono">{formatMoneyARS(total1yArs)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span></span>
                                        <span className="font-mono">≈ {formatMoneyUSD(total1yUsd)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* VNR */}
                        <div className="bg-muted/30 border border-border rounded-xl p-4 mb-6">
                            <p className="text-xs uppercase text-muted-foreground mb-1">VNR (Neto Comisión)</p>
                            <p className="text-lg font-mono">{formatMoneyARS(vnrArs)}</p>
                            <p className="text-sm text-muted-foreground font-mono">≈ {formatMoneyUSD(vnrUsd)}</p>
                        </div>

                        {/* Mini FX Info */}
                        <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-lg mb-6">
                            <strong>TC utilizado:</strong> Oficial Venta ${oficialSell.toFixed(2)}
                        </div>
                    </>
                )}

                {/* ============================================================ */}
                {/* PLAZO FIJO Detail */}
                {/* ============================================================ */}
                {isPlazoFijo && item.pfMeta && (
                    <>
                        {/* Capital */}
                        <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-4 mb-4">
                            <p className="text-xs uppercase text-muted-foreground mb-1">Capital Inicial</p>
                            <p className="text-2xl font-bold font-mono">{formatMoneyARS(item.pfMeta.capitalArs)}</p>
                            <p className="text-sm text-green-400 font-mono">
                                ≈ {formatMoneyUSD(item.pfMeta.capitalArs / oficialSell)} (Oficial Venta)
                            </p>
                        </div>

                        {/* Plazo / Fechas */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="bg-muted/50 border border-border rounded-xl p-3">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Inicio</p>
                                <p className="font-mono text-sm">
                                    {item.pfMeta.startDateISO
                                        ? new Date(item.pfMeta.startDateISO).toLocaleDateString('es-AR')
                                        : '-'}
                                </p>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-xl p-3">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Vencimiento</p>
                                <p className="font-mono text-sm">
                                    {item.pfMeta.maturityDateISO
                                        ? new Date(item.pfMeta.maturityDateISO).toLocaleDateString('es-AR')
                                        : '-'}
                                </p>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-xl p-3">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Días Restantes</p>
                                <p className="font-mono text-sm font-semibold">{item.pfMeta.daysRemaining} días</p>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-xl p-3">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Plazo Total</p>
                                <p className="font-mono text-sm">
                                    {/* Calculate total days if both dates exist */}
                                    {(item.pfMeta.startDateISO && item.pfMeta.maturityDateISO)
                                        ? Math.ceil((new Date(item.pfMeta.maturityDateISO).getTime() - new Date(item.pfMeta.startDateISO).getTime()) / 86400000)
                                        : '-'} días
                                </p>
                            </div>
                        </div>

                        {/* Interés Pactado */}
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-4">
                            <p className="text-xs uppercase text-muted-foreground mb-2">Interés Pactado</p>
                            <div className="flex justify-between items-baseline">
                                <p className="text-xl font-bold font-mono text-emerald-400">
                                    +{formatMoneyARS(item.pfMeta.expectedInterestArs)}
                                </p>
                                <p className="text-sm text-muted-foreground font-mono">
                                    ≈ {formatMoneyUSD(item.pfMeta.expectedInterestArs / oficialSell)}
                                </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                El interés es fijo según el contrato. La valuación en USD varía con el TC.
                            </p>
                        </div>

                        {/* Total a Cobrar */}
                        <div className="bg-muted/50 border border-border rounded-xl p-4 mb-4">
                            <p className="text-xs uppercase text-muted-foreground mb-1">Total a Cobrar</p>
                            <p className="text-2xl font-bold font-mono">{formatMoneyARS(item.pfMeta.expectedTotalArs ?? item.valArs)}</p>
                            <p className="text-sm text-green-400 font-mono">
                                ≈ {formatMoneyUSD((item.pfMeta.expectedTotalArs ?? item.valArs) / oficialSell)}
                            </p>
                        </div>

                        {/* VNR */}
                        <div className="bg-muted/30 border border-border rounded-xl p-4 mb-6">
                            <p className="text-xs uppercase text-muted-foreground mb-1">VNR (Neto Comisión)</p>
                            <p className="text-lg font-mono">{formatMoneyARS(vnrArs)}</p>
                            <p className="text-sm text-muted-foreground font-mono">≈ {formatMoneyUSD(vnrUsd)}</p>
                        </div>

                        {/* Mini FX Info */}
                        <div className="text-xs text-muted-foreground p-3 bg-muted/20 rounded-lg mb-6">
                            <strong>TC utilizado:</strong> Oficial Venta ${oficialSell.toFixed(2)}
                        </div>
                    </>
                )}

                {/* ============================================================ */}
                {/* GENERIC Cash / Other Assets Detail */}
                {/* ============================================================ */}
                {!isWalletYield && !isPlazoFijo && (
                    <>
                        {/* Valuation Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Valor de Mercado</p>
                                <p className="text-2xl font-bold font-mono">{formatMoneyARS(item.valArs)}</p>
                                <p className="text-sm text-muted-foreground font-mono">
                                    ≈ {formatMoneyUSD(item.valUsd)}
                                </p>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-xl p-4">
                                <p className="text-xs uppercase text-muted-foreground mb-1">VNR (Neto Comisión)</p>
                                <p className="text-2xl font-bold font-mono">{formatMoneyARS(vnrArs)}</p>
                                <p className="text-sm text-muted-foreground font-mono">
                                    ≈ {formatMoneyUSD(vnrUsd)}
                                </p>
                            </div>
                        </div>

                        {/* PnL Card */}
                        {item.pnlArs !== undefined && (
                            <div className="bg-muted/50 border border-border rounded-xl p-4 mb-6">
                                <p className="text-xs uppercase text-muted-foreground mb-1">Resultado No Realizado</p>
                                <div className="flex items-baseline gap-4">
                                    <p className={cn(
                                        "text-2xl font-bold font-mono",
                                        (item.pnlArs ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                                    )}>
                                        {(item.pnlArs ?? 0) >= 0 ? '+' : ''}{formatMoneyARS(item.pnlArs ?? 0)}
                                    </p>
                                    {item.pnlPct !== undefined && (
                                        <p className={cn(
                                            "text-lg font-mono",
                                            (item.pnlPct ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                                        )}>
                                            {(item.pnlPct ?? 0) >= 0 ? '+' : ''}{formatPercent((item.pnlPct ?? 0) / 100)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Quantity if applicable */}
                        {item.qty && item.qty !== item.valArs && (
                            <div className="text-sm text-muted-foreground mb-6">
                                Cantidad: {item.qty.toLocaleString('es-AR', { maximumFractionDigits: 8 })} unidades
                            </div>
                        )}
                    </>
                )}

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-muted hover:bg-muted/80 rounded-lg font-medium transition-colors"
                >
                    Cerrar
                </button>
            </div>
        </div>
    )
}

// =============================================================================
// Calc Panel (Side Panel)
// =============================================================================

interface CalcPanelProps {
    fx: NonNullable<ReturnType<typeof usePortfolioV2>>['fx']
    onClose: () => void
}

function CalcPanel({ fx, onClose }: CalcPanelProps) {
    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/50 transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-xl overflow-auto">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold">Cómo se calcula</h3>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* FX Table */}
                    <div className="mb-6">
                        <h4 className="text-sm font-semibold mb-3">Tipos de Cambio Utilizados</h4>
                        <div className="bg-muted/50 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="text-left p-3 font-medium">Tipo</th>
                                        <th className="text-right p-3 font-medium">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    <tr>
                                        <td className="p-3">Oficial Venta</td>
                                        <td className="p-3 text-right font-mono">${fx.officialSell.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3">MEP</td>
                                        <td className="p-3 text-right font-mono">${fx.mepSell.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3">Cripto (USDT/ARS)</td>
                                        <td className="p-3 text-right font-mono">${fx.cryptoSell.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Rules */}
                    <div>
                        <h4 className="text-sm font-semibold mb-3">Reglas de Valuación</h4>
                        <div className="space-y-3 text-sm">
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="font-medium">Billeteras / Plazos Fijos</p>
                                <p className="text-muted-foreground">TC Oficial Venta</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="font-medium">CEDEARs</p>
                                <p className="text-muted-foreground">TC MEP (dólar bolsa)</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="font-medium">Cripto</p>
                                <p className="text-muted-foreground">TC Cripto (USDT a ARS)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

// =============================================================================
// Settings Modal
// =============================================================================

interface SettingsModalProps {
    providerId: string
    providerName: string
    onClose: () => void
}

function SettingsModal({ providerId, providerName, onClose }: SettingsModalProps) {
    const { getSettings, saveSettings, isSaving } = useProviderSettings()
    const existing = getSettings(providerId)

    const [buyPct, setBuyPct] = useState(existing?.buyPct ?? 0)
    const [sellPct, setSellPct] = useState(existing?.sellPct ?? 0)
    const [fixedArs, setFixedArs] = useState(existing?.fixedArs ?? 0)

    const handleSave = async () => {
        await saveSettings(providerId, {
            buyPct,
            sellPct,
            fixedArs: fixedArs > 0 ? fixedArs : undefined,
        })
        onClose()
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md pointer-events-auto">
                    <div className="p-6">
                        <h3 className="text-lg font-bold mb-1">Comisiones</h3>
                        <p className="text-sm text-muted-foreground mb-6">{providerName}</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Comisión Compra (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={buyPct}
                                    onChange={e => setBuyPct(parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Comisión Venta (%)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={sellPct}
                                    onChange={e => setSellPct(parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Comisión Fija (ARS)
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={fixedArs}
                                    onChange={e => setFixedArs(parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2 bg-muted hover:bg-muted/80 rounded-lg font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default AssetsPageV2
