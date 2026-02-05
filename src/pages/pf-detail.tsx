/**
 * PF Detail Page — Subpágina de detalle de Plazo Fijo
 *
 * Muestra:
 * - Hero card con Total a Cobrar (ARS + USD equivalente)
 * - KPIs: Capital, Interés Ganado, Plazo (con barra progreso), Tasas TNA/TEA
 * - Timeline de automatización al vencimiento
 * - Movimientos relacionados
 *
 * Diseño basado en docs/prototypes/mis_activos/PF.html
 */

import { useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useMovements } from '@/hooks/use-movements'
import type { Movement } from '@/domain/types'

// =============================================================================
// Helpers
// =============================================================================

function getDaysRemaining(maturityIso: string): number {
    const today = new Date()
    const maturity = new Date(maturityIso)

    // Normalize to start of day for calendar day difference
    today.setHours(0, 0, 0, 0)
    maturity.setHours(0, 0, 0, 0)

    const diffTime = maturity.getTime() - today.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    return diffDays
}

function getTotalDays(startIso: string, maturityIso: string): number {
    const start = new Date(startIso)
    const maturity = new Date(maturityIso)
    start.setHours(0, 0, 0, 0)
    maturity.setHours(0, 0, 0, 0)
    return Math.round((maturity.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function getProgressPercent(startIso: string, maturityIso: string): number {
    const totalDays = getTotalDays(startIso, maturityIso)
    if (totalDays <= 0) return 100
    const daysRemaining = getDaysRemaining(maturityIso)
    const elapsed = totalDays - daysRemaining
    return Math.min(100, Math.max(0, (elapsed / totalDays) * 100))
}

type PFStatus = 'active' | 'expiring_today' | 'matured'

function getPFStatus(maturityIso: string): PFStatus {
    const daysRemaining = getDaysRemaining(maturityIso)
    if (daysRemaining > 0) return 'active'
    if (daysRemaining === 0) return 'expiring_today'
    return 'matured'
}

function getStatusBadge(status: PFStatus) {
    switch (status) {
        case 'active':
            return {
                label: 'Activo',
                className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }
        case 'expiring_today':
            return {
                label: 'Vence hoy',
                className: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }
        case 'matured':
            return {
                label: 'Vencido',
                className: 'bg-amber-500/10 text-amber-500 border-amber-500/30'
            }
    }
}

// =============================================================================
// Main Component
// =============================================================================

export function PFDetailPage() {
    const { pfId } = useParams<{ pfId: string }>()
    const navigate = useNavigate()

    // Data hooks
    const portfolio = usePortfolioV2()
    const { data: allMovements = [], isLoading: movementsLoading } = useMovements()

    // Find the PF in portfolio
    const pfItem = useMemo(() => {
        if (!portfolio || !pfId) return null
        const plazosRubro = portfolio.rubros.find(r => r.id === 'plazos')
        if (!plazosRubro) return null

        for (const provider of plazosRubro.providers) {
            const item = provider.items.find(it => it.id === pfId)
            if (item) return { item, provider }
        }
        return null
    }, [portfolio, pfId])

    // Get fixed deposit detail from portfolio
    const pfDetail = useMemo(() => {
        if (!portfolio || !pfId) return null
        return portfolio.fixedDepositDetails.get(pfId) ?? null
    }, [portfolio, pfId])

    // Get related movements
    const relatedMovements = useMemo(() => {
        if (!pfId || !allMovements) return []

        // Find movements related to this PF
        // 1. The creation movement (id === pfId since PF id is derived from movement id)
        // 2. Any redemption movements linked to this PF
        return allMovements
            .filter(m => {
                // Creation movement
                if (m.id === pfId) return true
                // Redemption linked to this PF
                if (m.pf?.pfId === pfId) return true
                // Auto-settlement movements linked via meta
                if (m.meta?.pfGroupId === pfDetail?.movementId) return true
                if (m.meta?.fixedDeposit?.pfGroupId === pfDetail?.movementId) return true
                return false
            })
            .sort((a, b) => b.datetimeISO.localeCompare(a.datetimeISO))
    }, [allMovements, pfId, pfDetail])

    // FX rate
    const oficialSell = portfolio?.fx.officialSell ?? 1

    // Loading state
    if (!portfolio || portfolio.isLoading || movementsLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary mx-auto" />
                    <p className="text-muted-foreground">Cargando detalle...</p>
                </div>
            </div>
        )
    }

    // Not found state
    if (!pfItem || !pfDetail) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">Plazo fijo no encontrado</p>
                <button
                    onClick={() => navigate('/mis-activos-v2')}
                    className="text-primary hover:underline"
                >
                    Volver a Mis Activos
                </button>
            </div>
        )
    }

    const { item, provider } = pfItem
    const pfMeta = item.pfMeta!

    // Calculated values
    const daysRemaining = getDaysRemaining(pfMeta.maturityDateISO)
    const totalDays = getTotalDays(pfMeta.startDateISO, pfMeta.maturityDateISO)
    const progressPercent = getProgressPercent(pfMeta.startDateISO, pfMeta.maturityDateISO)
    const status = getPFStatus(pfMeta.maturityDateISO)
    const statusBadge = getStatusBadge(status)

    // Format dates
    const startDate = new Date(pfMeta.startDateISO).toLocaleDateString('es-AR')
    const maturityDate = new Date(pfMeta.maturityDateISO).toLocaleDateString('es-AR')

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link to="/mis-activos-v2" className="hover:text-foreground transition-colors">
                    Mis Activos
                </Link>
                <span>/</span>
                <span>Plazos Fijos</span>
                <span>/</span>
                <span>{provider.name}</span>
                <span>/</span>
                <span className="text-foreground font-medium">{item.label}</span>
            </nav>

            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/mis-activos-v2')}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{item.label}</h1>
                            <span className={cn(
                                "text-sm font-medium px-2.5 py-1 rounded-full border",
                                statusBadge.className
                            )}>
                                {statusBadge.label}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {provider.name} · Plazo Fijo Tradicional en Pesos
                        </p>
                    </div>
                </div>
            </div>

            {/* Hero Card - Total a Cobrar */}
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                    <div>
                        <p className="text-sm font-mono text-primary uppercase tracking-wider mb-2">Total a cobrar</p>
                        <p className="text-4xl md:text-5xl font-mono font-bold tracking-tighter">
                            {formatMoneyARS(pfMeta.expectedTotalArs)}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <span className="px-2 py-1 rounded bg-background/50 text-sm font-mono text-emerald-400">
                                ≈ {formatMoneyUSD(pfMeta.expectedTotalArs / oficialSell)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                Calculado a USD Oficial Venta (${oficialSell.toFixed(2)})
                            </span>
                        </div>
                    </div>

                    {/* Step Chart Visualization */}
                    <div className="h-24 w-full flex items-end relative">
                        <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 50">
                            <defs>
                                <linearGradient id="pfChartGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {/* Line: Start low, step up at end */}
                            <path d="M0 40 L85 40 L85 10 L100 10" fill="none" stroke="#6366f1" strokeWidth="2" className="chart-path" />
                            {/* Fill Area */}
                            <path d="M0 40 L85 40 L85 10 L100 10 L100 50 L0 50 Z" fill="url(#pfChartGradient)" opacity="0.5" />
                            {/* Dots */}
                            <circle cx="0" cy="40" r="2" fill="#6366f1" />
                            <circle cx="85" cy="40" r="2" fill="#6366f1" />
                            <circle cx="85" cy="10" r="2" fill="#fff" />
                            <circle cx="100" cy="10" r="2" fill="#fff" />
                            {/* Labels */}
                            <text x="2" y="35" className="text-[4px] fill-muted-foreground font-mono">Inicio</text>
                            <text x="75" y="5" className="text-[4px] fill-emerald-400 font-mono font-bold">Cobro</text>
                        </svg>
                    </div>
                </div>
            </div>

            {/* KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Capital */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">Capital Invertido</p>
                    <p className="text-lg font-mono font-medium">{formatMoneyARS(pfMeta.capitalArs)}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                        ≈ {formatMoneyUSD(pfMeta.capitalArs / oficialSell)}
                    </p>
                </div>

                {/* KPI 2: Interés */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center gap-1 mb-1">
                        <p className="text-xs text-muted-foreground">Interés Ganado</p>
                        <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </div>
                    <p className="text-lg font-mono font-medium text-emerald-400">
                        +{formatMoneyARS(pfMeta.expectedInterestArs)}
                    </p>
                    <p className="text-xs font-mono text-emerald-500/50 mt-1">Fijo por contrato</p>
                </div>

                {/* KPI 3: Plazo */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Plazo</p>
                            <p className="text-lg font-medium">{totalDays} días</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase">Vencimiento</p>
                            <p className="text-sm font-mono">{maturityDate}</p>
                        </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3 relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "absolute top-0 left-0 h-full rounded-full transition-all",
                                status === 'active' && "bg-gradient-to-r from-primary to-sky-500",
                                status === 'expiring_today' && "bg-amber-500 animate-pulse",
                                status === 'matured' && "bg-emerald-500"
                            )}
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>{startDate.split('/').slice(0, 2).join('/')}</span>
                        <span className={cn(
                            status === 'expiring_today' && "text-amber-400 font-bold",
                            status === 'matured' && "text-emerald-400"
                        )}>
                            {daysRemaining > 0 ? `${daysRemaining} días restantes` :
                                daysRemaining === 0 ? 'Vence hoy' : 'Finalizado'}
                        </span>
                    </div>
                </div>

                {/* KPI 4: Tasas */}
                <div className="bg-card border border-border rounded-xl p-5 border-l-2 border-l-muted">
                    <div className="flex items-center gap-1 mb-1">
                        <p className="text-xs text-muted-foreground">Tasas</p>
                        <span className="text-muted-foreground" title="Tasas fijas al momento de constitución">🔒</span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">TNA</span>
                            <span className="font-mono">{formatPercent(pfDetail.tna / 100)}</span>
                        </div>
                        {pfDetail.tea && (
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">TEA</span>
                                <span className="font-mono">{formatPercent(pfDetail.tea / 100)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Automation & Movements Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Automation Timeline */}
                <div className="lg:col-span-1 bg-card border border-border rounded-xl p-6">
                    <h3 className="font-semibold text-lg mb-4">Automatización al Vencimiento</h3>

                    <div className="relative pl-4 border-l border-border space-y-8 my-6">
                        {/* Step 1: Baja del PF */}
                        <div className="relative">
                            <div className={cn(
                                "absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-background",
                                status === 'matured' ? "bg-emerald-500 ring-1 ring-emerald-500/50" :
                                    status === 'expiring_today' ? "bg-emerald-500 ring-1 ring-emerald-500/50" :
                                        "bg-muted ring-1 ring-muted-foreground/30"
                            )} />
                            <p className="text-sm font-medium">Baja del Plazo Fijo</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Cierre del contrato y liquidación de intereses.
                            </p>
                        </div>

                        {/* Step 2: Acreditación */}
                        <div className="relative">
                            <div className={cn(
                                "absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-background",
                                status === 'matured' ? "bg-emerald-500 ring-1 ring-emerald-500/50" :
                                    status === 'expiring_today' ? "bg-amber-500 ring-1 ring-amber-500/50 animate-pulse" :
                                        "bg-muted ring-1 ring-muted-foreground/30"
                            )} />
                            <p className="text-sm font-medium">Acreditación en Liquidez</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                El total se transfiere a tu cuenta {provider.name} disponible.
                            </p>
                        </div>
                    </div>

                    {/* Status Box */}
                    <div className={cn(
                        "p-3 rounded-lg flex items-start gap-3 border",
                        status === 'active' && "bg-primary/10 border-primary/20",
                        status === 'expiring_today' && "bg-amber-500/10 border-amber-500/20",
                        status === 'matured' && "bg-emerald-500/10 border-emerald-500/20"
                    )}>
                        {status === 'active' && (
                            <>
                                <Clock className="w-5 h-5 text-primary mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-primary uppercase">Programado</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Se ejecutará automáticamente el {maturityDate}.
                                    </p>
                                </div>
                            </>
                        )}
                        {status === 'expiring_today' && (
                            <>
                                <Loader2 className="w-5 h-5 text-amber-500 mt-0.5 animate-spin" />
                                <div>
                                    <p className="text-xs font-bold text-amber-500 uppercase">Procesando</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Tus fondos están ingresando a la cuenta de liquidez.
                                    </p>
                                </div>
                            </>
                        )}
                        {status === 'matured' && (
                            <>
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-emerald-500 uppercase">Completado</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Fondos disponibles en tu billetera.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Movements Table */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                        <h3 className="font-semibold">Movimientos Relacionados</h3>
                    </div>

                    {relatedMovements.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>Sin movimientos registrados</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-xs font-mono text-muted-foreground border-b border-border">
                                        <th className="p-4 font-normal">Fecha</th>
                                        <th className="p-4 font-normal">Concepto</th>
                                        <th className="p-4 font-normal text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {/* Future Settlement Row (if not yet matured) */}
                                    {status === 'active' && (
                                        <tr className="border-b border-border bg-primary/5 opacity-60">
                                            <td className="p-4 font-mono text-muted-foreground">{maturityDate}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span>Vencimiento Plazo Fijo</span>
                                                    <Clock className="w-3 h-3 text-muted-foreground" />
                                                </div>
                                                <p className="text-xs text-muted-foreground">Acreditación automática</p>
                                            </td>
                                            <td className="p-4 text-right font-mono text-emerald-400">
                                                +{formatMoneyARS(pfMeta.expectedTotalArs)}
                                            </td>
                                        </tr>
                                    )}

                                    {/* Actual Movements */}
                                    {relatedMovements.map(mov => (
                                        <MovementRow key={mov.id} movement={mov} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="p-4 bg-muted/30 text-[10px] text-muted-foreground text-center mt-auto">
                        Este comprobante es válido como constancia de inversión. <br />
                        ID de transacción: #{pfId?.slice(0, 8).toUpperCase()}
                    </div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="text-xs text-muted-foreground text-center max-w-2xl mx-auto pt-8 pb-12">
                <p>
                    Argfolio muestra esta información a modo de resumen. La custodia real de los
                    fondos corresponde a {provider.name} (Entidad regulada por BCRA). Los rendimientos
                    pasados no garantizan rendimientos futuros.
                </p>
            </div>
        </div>
    )
}

// =============================================================================
// Sub-components
// =============================================================================

interface MovementRowProps {
    movement: Movement
}

function MovementRow({ movement }: MovementRowProps) {
    const dateStr = new Date(movement.datetimeISO).toLocaleDateString('es-AR')
    const amount = movement.totalAmount ?? movement.quantity ?? 0
    const isDeposit = movement.type === 'DEPOSIT' || movement.type === 'INTEREST' || movement.type === 'SELL'
    const isCreation = movement.type === 'BUY' || (movement.assetClass === 'pf' && movement.type === 'DEPOSIT')

    let concept = 'Movimiento'
    let subtext = ''

    if (isCreation && movement.assetClass === 'pf') {
        concept = 'Constitución Plazo Fijo'
        subtext = `Débito de cuenta ${movement.bank || ''}`
    } else if (movement.type === 'SELL' && movement.assetClass === 'pf') {
        concept = movement.isAuto ? 'Vencimiento Plazo Fijo' : 'Rescate Plazo Fijo'
        subtext = movement.isAuto ? 'Acreditación automática' : 'Acreditación manual'
    } else if (movement.type === 'DEPOSIT' && movement.pf?.pfId) {
        concept = 'Acreditación PF'
        subtext = 'Fondos disponibles'
    }

    return (
        <tr className="border-b border-border hover:bg-muted/30 transition-colors">
            <td className="p-4 font-mono text-muted-foreground">{dateStr}</td>
            <td className="p-4">
                <p>{concept}</p>
                {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
            </td>
            <td className={cn(
                "p-4 text-right font-mono",
                isDeposit && !isCreation ? "text-emerald-400" : ""
            )}>
                {isDeposit && !isCreation ? '+' : isCreation ? '-' : ''}{formatMoneyARS(amount)}
            </td>
        </tr>
    )
}

export default PFDetailPage
