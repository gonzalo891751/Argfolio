/**
 * Wallet Detail Page — Subpágina de detalle de billetera/liquidez
 *
 * Muestra:
 * - Capital actual (ARS + USD equivalente)
 * - TNA/TEA editable
 * - Proyecciones (mañana, 30 días, 1 año)
 * - Últimos movimientos filtrados por accountId
 * - Sparkline de balance histórico
 */

import { useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Check, X, Calendar, Wallet, ChevronDown, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Scale, ListFilter, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import { usePortfolioV2, type ItemKind, type ItemV2 } from '@/features/portfolioV2'
import { useAccounts, useUpdateAccount } from '@/hooks/use-instruments'
import { useMovements } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'
import type { Movement, Currency } from '@/domain/types'
import { getMovementCashDeltas as getLedgerCashDeltas, traceCashBalanceContributions } from '@/domain/portfolio/cash-ledger'
import { walletMovementPrefill } from '@/pages/movements/movement-wizard-prefill'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// =============================================================================
// Helpers
// =============================================================================

const EPSILON = 1e-8

function computeTEA(tna: number): number {
    // TEA = (1 + TNA/365)^365 - 1
    return (Math.pow(1 + tna / 100 / 365, 365) - 1) * 100
}

function computeDailyInterest(capital: number, tna: number): number {
    return capital * (tna / 100 / 365)
}

function computeCompoundProjection(capital: number, tna: number, days: number): number {
    const dailyRate = tna / 100 / 365
    return capital * (Math.pow(1 + dailyRate, days) - 1)
}

function isCashItemKind(kind: string | null): kind is Extract<ItemKind, 'cash_ars' | 'cash_usd' | 'wallet_yield'> {
    return kind === 'cash_ars' || kind === 'cash_usd' || kind === 'wallet_yield'
}


function getMovementCashDeltaForCurrencies(mov: Movement, currencies: Currency[]): number {
    const deltas = getLedgerCashDeltas(mov)
    return deltas
        .filter(d => currencies.includes(d.currency))
        .reduce((sum, d) => sum + d.amount, 0)
}

// =============================================================================
// Main Component
// =============================================================================

export function WalletDetailPage() {
    const { accountId } = useParams<{ accountId: string }>()
    const navigate = useNavigate()
    const { toast } = useToast()
    const [searchParams] = useSearchParams()

    // Data hooks
    const portfolio = usePortfolioV2()
    const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
    const { data: allMovements = [], isLoading: movementsLoading } = useMovements()
    const updateAccount = useUpdateAccount()

    // Find the account
    const account = useMemo(() => {
        return accounts.find(a => a.id === accountId)
    }, [accounts, accountId])

    const kindParam = searchParams.get('kind')
    const requestedKind = useMemo(() => (isCashItemKind(kindParam) ? kindParam : null), [kindParam])

    const walletProvider = useMemo(() => {
        if (!portfolio || !accountId) return null
        const wallets = portfolio.rubros.find(r => r.id === 'wallets')
        if (!wallets) return null
        return wallets.providers.find(p => p.id === accountId || p.id === `${accountId}-cash`) ?? null
    }, [portfolio, accountId])

    const selectedItem: ItemV2 | null = useMemo(() => {
        const items = walletProvider?.items ?? []
        if (items.length === 0 && accountId) {
            const kind = requestedKind ?? 'cash_ars'
            const isUsd = kind === 'cash_usd'
            return {
                id: `trace-${accountId}-${kind}`,
                kind,
                symbol: isUsd ? 'USD' : 'ARS',
                label: isUsd ? 'Dólares' : 'Pesos',
                qty: 0,
                valArs: 0,
                valUsd: 0,
                accountId,
            }
        }
        if (items.length === 0) return null

        if (requestedKind) {
            const match = items.find(it => it.kind === requestedKind)
            if (match) return match
        }

        if (items.length === 1) return items[0]

        const arsDefault = items.find(it => it.kind === 'cash_ars') ?? items.find(it => it.kind === 'wallet_yield')
        return arsDefault ?? items[0]
    }, [walletProvider, requestedKind, accountId])

    const baseCurrency: 'ARS' | 'USD' = selectedItem?.kind === 'cash_usd' ? 'USD' : 'ARS'
    const formatPrimaryMoney = baseCurrency === 'USD' ? formatMoneyUSD : formatMoneyARS
    const formatSecondaryMoney = baseCurrency === 'USD' ? formatMoneyARS : formatMoneyUSD

    const capitalPrimary = baseCurrency === 'USD' ? (selectedItem?.valUsd ?? 0) : (selectedItem?.valArs ?? 0)
    const capitalSecondary = baseCurrency === 'USD' ? (selectedItem?.valArs ?? 0) : (selectedItem?.valUsd ?? 0)

    const secondaryPerPrimary = useMemo(() => {
        if (!selectedItem) return null

        if (baseCurrency === 'USD') {
            const usd = selectedItem.valUsd
            const ars = selectedItem.valArs
            if (!Number.isFinite(usd) || usd === 0 || !Number.isFinite(ars)) return null
            return ars / usd
        }

        const ars = selectedItem.valArs
        const usd = selectedItem.valUsd
        if (!Number.isFinite(ars) || ars === 0 || !Number.isFinite(usd)) return null
        return usd / ars
    }, [selectedItem, baseCurrency])

    // TNA editing state
    const [isEditingTna, setIsEditingTna] = useState(false)
    const [tnaInput, setTnaInput] = useState('')

    // Get TNA from account
    const tna = account?.cashYield?.tna ?? 0
    const tea = computeTEA(tna)

    const movementCurrencies: Currency[] = useMemo(() => {
        return baseCurrency === 'USD' ? ['USD', 'USDT', 'USDC'] : ['ARS']
    }, [baseCurrency])

    // Filter movements for this account + selected base currency (avoid ARS leaks on USD view)
    const accountMovements = useMemo(() => {
        if (!accountId) return []
        return allMovements
            .filter(m => m.accountId === accountId)
            .map(m => ({
                movement: m,
                delta: getMovementCashDeltaForCurrencies(m, movementCurrencies),
            }))
            .filter(({ delta }) => Number.isFinite(delta) && Math.abs(delta) > EPSILON)
            .sort((a, b) => b.movement.datetimeISO.localeCompare(a.movement.datetimeISO))
            .slice(0, 20) // Últimos 20
    }, [allMovements, accountId, movementCurrencies])

    const cashTrace = useMemo(() => accountId
        ? traceCashBalanceContributions({ movements: allMovements, accountId, currency: baseCurrency })
        : [], [allMovements, accountId, baseCurrency])
    const hasSuspiciousCash = cashTrace.some(row => row.issue != null)

    const openWalletOperation = (operationMode: 'deposit' | 'withdraw' | 'transfer' | 'adjust_balance') => {
        navigate('/movements', {
            state: {
                movementWizardPrefill: walletMovementPrefill(operationMode, {
                    accountId,
                    currency: baseCurrency,
                }),
            },
        })
    }

    // Projections (expressed in selected base currency)
    const dailyInterest = computeDailyInterest(capitalPrimary, tna)
    const interest30d = computeCompoundProjection(capitalPrimary, tna, 30)
    const interest1y = capitalPrimary * (tea / 100)

    // Handle TNA save
    const handleSaveTna = useCallback(async () => {
        const newTna = parseFloat(tnaInput)
        if (isNaN(newTna) || newTna < 0) {
            toast({ title: 'Error', description: 'La TNA debe ser un número positivo', variant: 'destructive' as any })
            return
        }

        try {
            await updateAccount.mutateAsync({
                id: accountId!,
                updates: {
                    cashYield: {
                        enabled: true,
                        tna: newTna,
                        compounding: account?.cashYield?.compounding || 'DAILY',
                        currency: account?.cashYield?.currency || 'ARS',
                        lastAccruedDate: account?.cashYield?.lastAccruedDate || new Date().toISOString().slice(0, 10),
                    },
                },
            })
            toast({ title: 'TNA Actualizada', description: `Nueva TNA: ${newTna}%` })
            setIsEditingTna(false)
        } catch {
            toast({ title: 'Error', description: 'No se pudo actualizar la TNA', variant: 'destructive' as any })
        }
    }, [tnaInput, accountId, account, updateAccount, toast])

    // Generate sparkline data from movements
    const sparklineData = useMemo(() => {
        if (!accountId) return []
        const movs = allMovements
            .filter(m => m.accountId === accountId)
            .sort((a, b) => a.datetimeISO.localeCompare(b.datetimeISO))

        let balance = 0
        const points: number[] = []

        for (const mov of movs) {
            balance += getMovementCashDeltaForCurrencies(mov, movementCurrencies)
            points.push(balance)
        }

        // Take last 30 points or pad with initial value
        const lastPoints = points.slice(-30)
        if (lastPoints.length < 5) return [] // Not enough data
        return lastPoints
    }, [allMovements, accountId, movementCurrencies])

    // Loading/error states
    if (!accountId) {
        return (
            <div className="p-8 text-center">
                <p className="text-muted-foreground">Account ID no especificado</p>
            </div>
        )
    }

    if (!portfolio || portfolio.isLoading || accountsLoading || movementsLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center space-y-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary mx-auto" />
                    <p className="text-muted-foreground">Cargando detalle...</p>
                </div>
            </div>
        )
    }

    if (!account) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">Cuenta no encontrada</p>
                <button
                    onClick={() => navigate('/activos')}
                    className="text-primary hover:underline"
                >
                    Volver a Mis Activos
                </button>
            </div>
        )
    }

    if (!selectedItem) {
        return (
            <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">No se encontraron subcuentas de liquidez para esta cuenta.</p>
                <button
                    onClick={() => navigate('/activos')}
                    className="text-primary hover:underline"
                >
                    Volver a Mis Activos
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link to="/activos" className="hover:text-foreground transition-colors">
                    Mis Activos
                </Link>
                <span>/</span>
                <span>Billeteras</span>
                <span>/</span>
                <span className="text-foreground font-medium">{account.name || `Liquidez ${accountId.slice(-4).toUpperCase()}`}</span>
            </nav>

            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/activos')}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">{account.name || `Liquidez ${accountId.slice(-4).toUpperCase()}`}</h1>
                                <p className="text-sm text-muted-foreground">Rendimiento y proyecciones</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={() => openWalletOperation('adjust_balance')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                        <Scale className="h-4 w-4" /> Ajustar saldo
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">Operar <ChevronDown className="h-4 w-4" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => openWalletOperation('deposit')}><ArrowDownToLine className="mr-2 h-4 w-4" /> Registrar ingreso</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openWalletOperation('withdraw')}><ArrowUpFromLine className="mr-2 h-4 w-4" /> Registrar egreso / gasto</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openWalletOperation('transfer')}><ArrowLeftRight className="mr-2 h-4 w-4" /> Transferir</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate('/movements', { state: { movementFilters: { accountId, datePreset: 'all' } } })}><ListFilter className="mr-2 h-4 w-4" /> Ver movimientos</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {hasSuspiciousCash && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /><span>Este saldo contiene una operación cripto cash-neutral o un settlement incompleto. Revisá la composición antes de ajustarlo.</span></div>
                    <a href="#cash-composition" className="whitespace-nowrap font-medium text-amber-700 dark:text-amber-300 underline">Ver composición</a>
                </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Capital Card */}
                <div className="md:col-span-2 bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                    <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2">Capital Actual</p>
                    <p className="text-4xl font-bold font-mono mb-2">{formatPrimaryMoney(capitalPrimary)}</p>
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-background/50 rounded text-sm font-mono text-emerald-600 dark:text-emerald-400">
                            ≈ {formatSecondaryMoney(capitalSecondary)}
                        </span>
                        {selectedItem.fxMeta && selectedItem.fxMeta.rate > 0 && (
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                TC {selectedItem.fxMeta.family} {selectedItem.fxMeta.side}
                            </span>
                        )}
                        {baseCurrency === 'USD' && selectedItem.symbol.toUpperCase() === 'USDT' && (
                            <span className="text-xs text-muted-foreground">USD (USDT 1:1)</span>
                        )}
                    </div>

                    {/* Sparkline */}
                    {sparklineData.length >= 5 && (
                        <div className="mt-6 h-16 opacity-60">
                            <SparklineSVG data={sparklineData} />
                        </div>
                    )}
                </div>

                {/* TNA/TEA Card */}
                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs uppercase text-muted-foreground tracking-wider">Rendimiento</p>
                        {!isEditingTna && (
                            <button
                                onClick={() => {
                                    setTnaInput(tna.toString())
                                    setIsEditingTna(true)
                                }}
                                className="p-1.5 hover:bg-muted rounded transition-colors text-primary"
                                title="Editar TNA"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {isEditingTna ? (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Nueva TNA %</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={tnaInput}
                                    onChange={e => setTnaInput(e.target.value)}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg font-mono focus:border-primary outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSaveTna}
                                    disabled={updateAccount.isPending}
                                    className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                    <Check className="h-4 w-4" />
                                    Guardar
                                </button>
                                <button
                                    onClick={() => setIsEditingTna(false)}
                                    className="px-3 py-2 bg-muted rounded-lg hover:bg-muted/80"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4">
                                <p className="text-sm text-muted-foreground mb-1">TNA</p>
                                <p className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{tna.toFixed(2)}%</p>
                            </div>
                            <div className="space-y-2 pt-4 border-t border-border">
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">TEA</span>
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{tea.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Interés Diario</span>
                                    <span className="font-mono text-sm">+{formatPrimaryMoney(dailyInterest)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Projections Card */}
                <div className="md:col-span-3 bg-card border border-border rounded-xl p-6">
                    <p className="text-xs uppercase text-muted-foreground tracking-wider mb-4">Proyección de Ganancias (Estimada)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Tomorrow */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                                1d
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Mañana</p>
                                <p className="font-mono text-lg text-emerald-600 dark:text-emerald-400 font-semibold">+{formatPrimaryMoney(dailyInterest)}</p>
                                {secondaryPerPrimary != null && (
                                    <p className="font-mono text-xs text-muted-foreground">≈ {formatSecondaryMoney(dailyInterest * secondaryPerPrimary)}</p>
                                )}
                            </div>
                        </div>
                        {/* 30 Days */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                                30d
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">En 30 días</p>
                                <p className="font-mono text-lg text-emerald-600 dark:text-emerald-400 font-semibold">+{formatPrimaryMoney(interest30d)}</p>
                                {secondaryPerPrimary != null && (
                                    <p className="font-mono text-xs text-muted-foreground">≈ {formatSecondaryMoney(interest30d * secondaryPerPrimary)}</p>
                                )}
                            </div>
                        </div>
                        {/* 1 Year */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                                1A
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">En 1 año (TEA)</p>
                                <p className="font-mono text-lg text-emerald-600 dark:text-emerald-400 font-semibold">+{formatPrimaryMoney(interest1y)}</p>
                                {secondaryPerPrimary != null && (
                                    <p className="font-mono text-xs text-muted-foreground">≈ {formatSecondaryMoney(interest1y * secondaryPerPrimary)}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Movements Card */}
                <div className="md:col-span-3 bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <h3 className="font-semibold">Últimos Movimientos</h3>
                        </div>
                        <button
                            onClick={() => navigate('/movements', { state: { movementFilters: { accountId, datePreset: 'all' } } })}
                            className="text-xs text-primary hover:underline"
                        >
                            Ver todos
                        </button>
                    </div>

                    {accountMovements.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>Sin movimientos aún</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {accountMovements.slice(0, 10).map(({ movement, delta }) => (
                                <MovementRow
                                    key={movement.id}
                                    movement={movement}
                                    delta={delta}
                                    formatPrimaryMoney={formatPrimaryMoney}
                                    formatSecondaryMoney={formatSecondaryMoney}
                                    secondaryPerPrimary={secondaryPerPrimary}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div id="cash-composition" className="md:col-span-3 bg-card border border-border rounded-xl overflow-hidden scroll-mt-6">
                    <div className="px-6 py-4 border-b border-border bg-muted/30">
                        <h3 className="font-semibold">Cómo se compone este saldo</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Lectura auditable; esta tabla no ejecuta reparaciones.</p>
                    </div>
                    {cashTrace.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No hay contribuciones de {baseCurrency} para mostrar.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead className="border-b border-border text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Movimiento</th><th className="px-4 py-3">Operación</th><th className="px-4 py-3 text-right">Impacto</th><th className="px-4 py-3 text-right">Acumulado</th></tr></thead>
                                <tbody className="divide-y divide-border">
                                    {cashTrace.map((row, index) => {
                                        const accumulated = cashTrace.slice(0, index + 1).reduce((sum, item) => sum + item.amount, 0)
                                        return <tr key={`${row.movementId}-${index}`} className={row.issue ? 'bg-amber-500/[0.05]' : ''}>
                                            <td className="px-4 py-3 whitespace-nowrap">{new Date(row.datetimeISO).toLocaleDateString('es-AR')}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{row.synthetic ? <span className="text-muted-foreground">Saldo inicial</span> : <button className="text-primary hover:underline" onClick={() => navigate('/movements', { state: { movementFilters: { search: row.movementId, datePreset: 'all' } } })}>{row.movementId.slice(0, 12)}</button>}<div className="text-muted-foreground">{row.type} {row.symbol ?? ''}</div></td>
                                            <td className="px-4 py-3"><span>{row.reason}</span>{row.operationId && <div className="font-mono text-[10px] text-muted-foreground">{row.operationId.slice(0, 16)}</div>}{row.issue && <span className="mt-1 inline-flex rounded bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">{row.issue === 'possible_swap_residue' ? 'Posible residuo de swap' : row.issue === 'missing_settlement_metadata' ? 'Settlement sin importe real' : 'Settlement legacy'}</span>}</td>
                                            <td className={`px-4 py-3 text-right font-mono ${row.amount < 0 ? 'text-rose-600 dark:text-rose-400' : row.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{row.amount > 0 ? '+' : ''}{formatPrimaryMoney(row.amount)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatPrimaryMoney(accumulated)}</td>
                                        </tr>
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* FX Info */}
            {selectedItem.fxMeta && selectedItem.fxMeta.rate > 0 && (
                <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
                    <strong>TC utilizado:</strong> {selectedItem.fxMeta.family} {selectedItem.fxMeta.side === 'V' ? 'Venta' : 'Compra'} ${selectedItem.fxMeta.rate.toFixed(2)}
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Sub-components
// =============================================================================

interface MovementRowProps {
    movement: Movement
    delta: number
    formatPrimaryMoney: (value: number | null | undefined) => string
    formatSecondaryMoney: (value: number | null | undefined) => string
    secondaryPerPrimary: number | null
}

function MovementRow({ movement, delta, formatPrimaryMoney, formatSecondaryMoney, secondaryPerPrimary }: MovementRowProps) {
    const isPositive = delta > 0
    const amount = Math.abs(delta)
    const dateStr = new Date(movement.datetimeISO).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
    })

    const typeLabels: Record<string, string> = {
        DEPOSIT: 'Depósito',
        WITHDRAW: 'Retiro',
        INTEREST: 'Rendimiento',
        DIVIDEND: 'Dividendo',
        TRANSFER_IN: 'Transferencia recibida',
        TRANSFER_OUT: 'Transferencia enviada',
        BUY: 'Compra',
        SELL: 'Venta',
    }

    const typeIcons: Record<string, string> = {
        INTEREST: '📈',
        DIVIDEND: '💰',
        DEPOSIT: '↓',
        WITHDRAW: '↑',
        TRANSFER_IN: '↓',
        TRANSFER_OUT: '↑',
    }

    return (
        <div className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-4">
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs",
                    isPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                )}>
                    {typeIcons[movement.type] || '•'}
                </div>
                <div>
                    <p className="text-sm font-medium">{typeLabels[movement.type] || movement.type}</p>
                    <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
            </div>
            <div className="text-right">
                <p className={cn(
                    "font-mono text-sm font-semibold",
                    isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                )}>
                    {isPositive ? '+' : '-'}{formatPrimaryMoney(amount)}
                </p>
                {secondaryPerPrimary != null && (
                    <p className="font-mono text-xs text-muted-foreground">
                        ≈ {formatSecondaryMoney(amount * secondaryPerPrimary)}
                    </p>
                )}
            </div>
        </div>
    )
}

interface SparklineSVGProps {
    data: number[]
}

function SparklineSVG({ data }: SparklineSVGProps) {
    if (data.length < 2) return null

    const width = 500
    const height = 64
    const padding = 4

    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2)
        const y = height - padding - ((val - min) / range) * (height - padding * 2)
        return `${x},${y}`
    })

    const linePath = `M ${points.join(' L ')}`
    const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`

    return (
        <svg className="w-full h-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id="sparkline-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#sparkline-gradient)" />
            <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" />
        </svg>
    )
}

export default WalletDetailPage
