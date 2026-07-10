import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Play, ShieldCheck, Undo2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAccounts, useInstruments } from '@/hooks/use-instruments'
import { useMovements } from '@/hooks/use-movements'
import { downloadLocalBackup } from '@/domain/sync/local-backup'
import {
    applyRepairPlanToDatabase,
    rollbackRepairPlanFromDatabase,
    type ApplyRepairResult,
    type RollbackRepairResult,
} from '@/domain/operations/apply-repair-plan'
import {
    buildBinanceNexoRepairPlan,
    type RepairPlan,
} from '@/domain/operations/binance-nexo-repair-plan'
import {
    reconcileCryptoBalances,
    type CryptoReconciliationRow,
    type TargetCryptoBalance,
} from '@/domain/operations/crypto-reconciliation'
import {
    isAdjustmentReasonCompatible,
    reclassifyCryptoBalanceAdjustment,
    type CryptoAdjustmentReason,
} from '@/domain/operations/crypto-balance-adjustment'
import { getOperationId } from '@/domain/operations/operation'
import type { Account, Movement } from '@/domain/types'

interface EditableTarget extends TargetCryptoBalance {
    id: string
}

const DEFAULT_TARGETS: EditableTarget[] = [
    { id: 'nexo-btc', accountNameOrId: 'Nexo', symbol: 'BTC', targetQty: 0.0172965 },
    { id: 'nexo-nexo', accountNameOrId: 'Nexo', symbol: 'NEXO', targetQty: 162.22502272 },
    { id: 'nexo-usdc', accountNameOrId: 'Nexo', symbol: 'USDC', targetQty: 20.031414 },
    { id: 'nexo-bnb', accountNameOrId: 'Nexo', symbol: 'BNB', targetQty: 0.03341429 },
    { id: 'binance-btc', accountNameOrId: 'Binance', symbol: 'BTC', targetQty: 0 },
    { id: 'binance-bnb', accountNameOrId: 'Binance', symbol: 'BNB', targetQty: 0 },
    { id: 'binance-usdt', accountNameOrId: 'Binance', symbol: 'USDT', targetQty: 0 },
    { id: 'binance-usdc', accountNameOrId: 'Binance', symbol: 'USDC', targetQty: 0 },
]

const REASONS: Array<{ value: CryptoAdjustmentReason; label: string }> = [
    { value: 'unknown', label: 'Pendiente / no sé' },
    { value: 'reward', label: 'Reward / interés' },
    { value: 'rounding', label: 'Redondeo' },
    { value: 'external_transfer', label: 'Depósito / transferencia externa' },
    { value: 'manual_correction', label: 'Corrección manual' },
    { value: 'fee', label: 'Fee' },
]

function formatQty(value: number): string {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 }).format(value)
}

function groupMovements(movements: Movement[]): Map<string, Movement[]> {
    const groups = new Map<string, Movement[]>()
    for (const movement of movements) {
        const id = getOperationId(movement) ?? movement.id
        groups.set(id, [...(groups.get(id) ?? []), movement])
    }
    return groups
}

function describeProposedOperation(legs: Movement[], accounts: Map<string, Account>): string {
    const kind = legs[0]?.meta?.operationKind
    if (kind === 'transfer') {
        const out = legs.find(leg => leg.type === 'TRANSFER_OUT')
        const inn = legs.find(leg => leg.type === 'TRANSFER_IN')
        return `${out?.ticker ?? 'Activo'} ${accounts.get(out?.accountId ?? '')?.name ?? 'Origen'} → ${accounts.get(inn?.accountId ?? '')?.name ?? 'Destino'}`
    }
    if (kind === 'swap') {
        const source = legs.find(leg => leg.meta?.legRole === 'source')
        const destination = legs.find(leg => leg.meta?.legRole === 'destination')
        return `${formatQty(source?.quantity ?? 0)} ${source?.ticker ?? '?'} → ${formatQty(destination?.quantity ?? 0)} ${destination?.ticker ?? '?'}`
    }
    const leg = legs[0]
    const sign = leg.meta?.direction === 'out' ? '-' : '+'
    return `Ajuste ${leg.ticker ?? ''} ${sign}${formatQty(leg.quantity ?? 0)}`
}

function selectedProjection(
    sourceMovements: Movement[],
    proposedMovements: Movement[],
    selectedCandidateIds: Set<string>,
    selectedOperationIds: Set<string>,
    accounts: Account[],
    instruments: Parameters<typeof reconcileCryptoBalances>[0]['instruments'],
    targets: TargetCryptoBalance[],
): CryptoReconciliationRow[] {
    const projectedBase = sourceMovements.map(movement => selectedCandidateIds.has(movement.id)
        ? { ...movement, meta: { ...movement.meta, operationStatus: 'superseded' as const } }
        : movement
    )
    const selectedProposed = proposedMovements.filter(movement =>
        selectedOperationIds.has(getOperationId(movement) ?? movement.id)
    )
    return reconcileCryptoBalances({
        movements: [...projectedBase, ...selectedProposed],
        accounts,
        instruments,
        targets,
    })
}

export function BinanceNexoRepairPanel() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { data: movements = [] } = useMovements()
    const { data: accounts = [] } = useAccounts()
    const { data: instruments = [] } = useInstruments()
    const [targets, setTargets] = useState(DEFAULT_TARGETS)
    const [repairDate, setRepairDate] = useState('2026-07-09')
    const [estimatedNexoPriceUsd, setEstimatedNexoPriceUsd] = useState(0.74)
    const [plan, setPlan] = useState<RepairPlan | null>(null)
    const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
    const [proposedMovements, setProposedMovements] = useState<Movement[]>([])
    const [selectedOperationIds, setSelectedOperationIds] = useState<Set<string>>(new Set())
    const [confirmed, setConfirmed] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isApplying, setIsApplying] = useState(false)
    const [isRollingBack, setIsRollingBack] = useState(false)
    const [isBackingUp, setIsBackingUp] = useState(false)
    const [result, setResult] = useState<ApplyRepairResult | null>(null)
    const [rollbackConfirmed, setRollbackConfirmed] = useState(false)
    const [rollbackResult, setRollbackResult] = useState<RollbackRepairResult | null>(null)

    const accountsMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts])
    const proposedGroups = useMemo(() => groupMovements(proposedMovements), [proposedMovements])
    const parsedTargets = useMemo<TargetCryptoBalance[]>(() => targets.map(({ accountNameOrId, symbol, targetQty }) => ({
        accountNameOrId,
        symbol,
        targetQty,
    })), [targets])

    const projectedRows = useMemo(() => {
        if (!plan) return []
        try {
            return selectedProjection(
                movements,
                proposedMovements,
                selectedCandidateIds,
                selectedOperationIds,
                accounts,
                instruments,
                parsedTargets,
            )
        } catch {
            return plan.reconciliationAfter
        }
    }, [plan, movements, proposedMovements, selectedCandidateIds, selectedOperationIds, accounts, instruments, parsedTargets])

    const selectedProposed = useMemo(() => proposedMovements.filter(movement =>
        selectedOperationIds.has(getOperationId(movement) ?? movement.id)
    ), [proposedMovements, selectedOperationIds])
    const hasUnclassifiedSelected = selectedProposed.some(movement => movement.meta?.requiresManualReview)

    const acceptPlan = (nextPlan: RepairPlan) => {
        setPlan(nextPlan)
        setSelectedCandidateIds(new Set(nextPlan.candidateIdsToSupersede))
        setProposedMovements(nextPlan.proposedMovements)
        const safeDefaults = new Set<string>()
        for (const [operationId, legs] of groupMovements(nextPlan.proposedMovements)) {
            if (!legs.some(leg => leg.meta?.requiresManualReview)) safeDefaults.add(operationId)
        }
        setSelectedOperationIds(safeDefaults)
        setConfirmed(false)
        setResult(null)
        setRollbackConfirmed(false)
        setRollbackResult(null)
    }

    const generatePlan = (candidateIds?: string[]) => {
        setError(null)
        try {
            const occurredAtISO = new Date(`${repairDate}T12:00:00`).toISOString()
            const nextPlan = buildBinanceNexoRepairPlan({
                movements,
                accounts,
                instruments,
                targets: parsedTargets,
                candidateIdsToSupersede: candidateIds,
                occurredAtISO,
                estimatedNexoPriceUsd,
            })
            acceptPlan(nextPlan)
        } catch (planError) {
            setPlan(null)
            setError(planError instanceof Error ? planError.message : String(planError))
        }
    }

    const toggleCandidate = (id: string) => {
        const next = new Set(selectedCandidateIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        generatePlan([...next])
    }

    const toggleOperation = (id: string) => {
        const next = new Set(selectedOperationIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedOperationIds(next)
        setConfirmed(false)
    }

    const classifyAdjustment = (operationId: string, reason: CryptoAdjustmentReason) => {
        setProposedMovements(current => current.map(movement =>
            (getOperationId(movement) ?? movement.id) === operationId
                ? reclassifyCryptoBalanceAdjustment(movement, reason)
                : movement
        ))
        const next = new Set(selectedOperationIds)
        if (reason === 'unknown') next.delete(operationId)
        else next.add(operationId)
        setSelectedOperationIds(next)
        setConfirmed(false)
    }

    const handleBackup = async () => {
        setIsBackingUp(true)
        setError(null)
        try {
            await downloadLocalBackup('argfolio-backup-manual-pre-reparacion')
        } catch (backupError) {
            setError(backupError instanceof Error ? backupError.message : String(backupError))
        } finally {
            setIsBackingUp(false)
        }
    }

    const handleApply = async () => {
        if (!plan || !confirmed || hasUnclassifiedSelected) return
        setIsApplying(true)
        setError(null)
        try {
            const applyResult = await applyRepairPlanToDatabase(plan, {
                confirmed: true,
                candidateIdsToSupersede: [...selectedCandidateIds],
                proposedMovements: selectedProposed,
            })
            setResult(applyResult)
            if (applyResult.ok) {
                await queryClient.invalidateQueries()
                setConfirmed(false)
            } else {
                setError(applyResult.errors?.join(' ') ?? 'No se pudo aplicar la reparación.')
            }
        } catch (applyError) {
            setError(applyError instanceof Error ? applyError.message : String(applyError))
        } finally {
            setIsApplying(false)
        }
    }

    const handleRollback = async () => {
        if (!plan || !result?.ok || !rollbackConfirmed) return
        setIsRollingBack(true)
        setError(null)
        try {
            const nextRollbackResult = await rollbackRepairPlanFromDatabase(plan, { confirmed: true })
            setRollbackResult(nextRollbackResult)
            if (nextRollbackResult.ok) {
                await queryClient.invalidateQueries()
                setRollbackConfirmed(false)
            } else {
                setError(nextRollbackResult.errors?.join(' ') ?? 'No se pudo revertir la reparación.')
            }
        } catch (rollbackError) {
            setError(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
        } finally {
            setIsRollingBack(false)
        }
    }

    return (
        <Card className="border-amber-500/30">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-amber-500" />
                    Reparación asistida Binance → Nexo
                </CardTitle>
                <CardDescription>
                    Dry-run auditable: no borra historial. Marca movimientos elegidos como reemplazados y crea operaciones nuevas sólo después de confirmar.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <p>Revisá importes, candidatos y supuestos de precio. Al aplicar se descarga otro backup automáticamente antes de abrir la transacción.</p>
                </div>

                <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-medium text-sm">Targets editables</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-xs text-muted-foreground flex items-center gap-2">
                                Precio NEXO estimado (USD)
                                <Input
                                    type="number"
                                    step="any"
                                    min="0.00000001"
                                    value={estimatedNexoPriceUsd}
                                    onChange={event => {
                                        setEstimatedNexoPriceUsd(Number(event.target.value))
                                        setPlan(null)
                                    }}
                                    className="h-8 w-[110px] font-mono"
                                />
                            </label>
                            <label className="text-xs text-muted-foreground flex items-center gap-2">
                                Fecha reconstrucción
                                <Input
                                    type="date"
                                    value={repairDate}
                                    onChange={event => { setRepairDate(event.target.value); setPlan(null) }}
                                    className="h-8 w-[145px]"
                                />
                            </label>
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                        {targets.map(target => (
                            <label key={target.id} className="grid grid-cols-[80px_1fr] items-center gap-2 rounded-lg border bg-muted/20 p-2 text-xs">
                                <span className="font-medium">{target.accountNameOrId} {target.symbol}</span>
                                <Input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={target.targetQty}
                                    onChange={event => {
                                        const value = Number(event.target.value)
                                        setTargets(current => current.map(item => item.id === target.id ? { ...item, targetQty: value } : item))
                                        setPlan(null)
                                    }}
                                    className="h-8 font-mono"
                                />
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => generatePlan()}>
                            <Play className="h-4 w-4 mr-2" /> Generar dry-run
                        </Button>
                        <Button variant="outline" onClick={handleBackup} disabled={isBackingUp}>
                            <Download className="h-4 w-4 mr-2" /> {isBackingUp ? 'Exportando…' : 'Exportar backup ahora'}
                        </Button>
                    </div>
                </section>

                {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

                {plan && (
                    <>
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs font-mono">
                            Plan {plan.id} · confianza {plan.confidence} · {plan.candidatesToSupersede.length} candidatos · {proposedGroups.size} operaciones propuestas
                        </div>

                        <section className="space-y-2">
                            <h3 className="font-medium text-sm">Candidatos a reemplazar</h3>
                            {plan.candidateDetails.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No se detectaron movimientos legacy conocidos.</p>
                            ) : plan.candidateDetails.map(candidate => (
                                <label key={candidate.movement.id} className="flex gap-3 rounded-lg border p-3 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={selectedCandidateIds.has(candidate.movement.id)}
                                        onChange={() => toggleCandidate(candidate.movement.id)}
                                    />
                                    <span className="flex-1">
                                        <strong>
                                            {new Date(candidate.movement.datetimeISO).toLocaleString('es-AR')} · {candidate.movement.type} {candidate.movement.ticker}
                                            {' · '}{accountsMap.get(candidate.movement.accountId)?.name ?? candidate.movement.accountId}
                                        </strong>
                                        <span className="block font-mono">{formatQty(candidate.movement.quantity ?? 0)} · US$ {formatQty(candidate.movement.totalUSD ?? candidate.movement.totalAmount)}</span>
                                        <span className="block text-muted-foreground">Confianza {candidate.confidence} · {candidate.reason}</span>
                                    </span>
                                </label>
                            ))}
                        </section>

                        <section className="space-y-2">
                            <h3 className="font-medium text-sm">Operaciones propuestas</h3>
                            {[...proposedGroups].map(([operationId, legs]) => {
                                        const requiresReview = legs.some(leg => leg.meta?.requiresManualReview)
                                        const adjustment = legs.find(leg => leg.meta?.operationKind === 'balance_adjustment' || leg.meta?.operationKind === 'income' || leg.meta?.operationKind === 'fee')
                                        const adjustmentDiff = adjustment?.meta?.direction === 'out'
                                            ? -(adjustment.quantity ?? 0)
                                            : (adjustment?.quantity ?? 0)
                                const pnl = legs.reduce((sum, leg) => sum + (leg.meta?.realizedPnlUsd ?? 0), 0)
                                return (
                                    <div key={operationId} className="rounded-lg border p-3 text-xs space-y-2">
                                        <label className="flex gap-3 items-start">
                                            <input
                                                type="checkbox"
                                                checked={selectedOperationIds.has(operationId)}
                                                onChange={() => toggleOperation(operationId)}
                                                disabled={requiresReview}
                                            />
                                            <span className="flex-1">
                                                <strong>{describeProposedOperation(legs, accountsMap)}</strong>
                                                <span className="block text-muted-foreground">{legs.length} pata{legs.length !== 1 ? 's' : ''} · costo/producido US$ {formatQty(legs.reduce((sum, leg) => sum + (leg.meta?.legRole === 'destination' ? leg.totalUSD ?? 0 : 0), 0))}</span>
                                                {Math.abs(pnl) > 1e-9 && <span className="block">PnL realizado estimado: US$ {formatQty(pnl)}</span>}
                                            </span>
                                        </label>
                                        {adjustment && (
                                            <label className="flex items-center gap-2 pl-6">
                                                <span>Clasificación:</span>
                                                <select
                                                    value={adjustment.meta?.adjustmentReason ?? 'unknown'}
                                                    onChange={event => classifyAdjustment(operationId, event.target.value as CryptoAdjustmentReason)}
                                                    className="h-8 rounded-md border bg-background px-2"
                                                >
                                                    {REASONS
                                                        .filter(reason => isAdjustmentReasonCompatible(adjustmentDiff, reason.value))
                                                        .map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                                                </select>
                                            </label>
                                        )}
                                    </div>
                                )
                            })}
                        </section>

                        <section className="space-y-2">
                            <h3 className="font-medium text-sm">Reporte antes / después seleccionado</h3>
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/50"><tr><th className="p-2 text-left">Cuenta</th><th>Activo</th><th>Antes</th><th>Después</th><th>Target</th><th>Diferencia</th></tr></thead>
                                    <tbody>
                                        {plan.reconciliationBefore.map(before => {
                                            const after = projectedRows.find(row => row.accountId === before.accountId && row.instrumentId === before.instrumentId) ?? before
                                            return (
                                                <tr key={`${before.accountId}-${before.instrumentId}`} className="border-t text-center">
                                                    <td className="p-2 text-left">{before.accountName}</td><td>{before.symbol}</td>
                                                    <td className="font-mono">{formatQty(before.currentQty)}</td>
                                                    <td className="font-mono">{formatQty(after.currentQty)}</td>
                                                    <td className="font-mono">{formatQty(after.targetQty)}</td>
                                                    <td className={after.status === 'ok' ? 'text-emerald-500 font-mono' : 'text-amber-500 font-mono'}>{formatQty(after.diffQty)}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {plan.warnings.length > 0 && (
                            <section className="space-y-1">
                                <h3 className="font-medium text-sm">Warnings del dry-run</h3>
                                <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
                                    {plan.warnings.map(warning => <li key={warning}>{warning}</li>)}
                                </ul>
                            </section>
                        )}

                        <section className="rounded-lg border border-amber-500/25 p-3 space-y-3">
                            <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
                                <span>Entiendo que se marcarán {selectedCandidateIds.size} movimientos como reemplazados y se crearán {selectedProposed.length} patas nuevas. Se descargará un backup antes de aplicar.</span>
                            </label>
                            {hasUnclassifiedSelected && <p className="text-xs text-amber-500">Clasificá cualquier ajuste seleccionado antes de aplicar.</p>}
                            <Button onClick={handleApply} disabled={!confirmed || hasUnclassifiedSelected || isApplying}>
                                <ShieldCheck className="h-4 w-4 mr-2" /> {isApplying ? 'Aplicando…' : 'Aplicar reparación'}
                            </Button>
                        </section>
                    </>
                )}

                {result?.ok && plan && (
                    <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm space-y-2">
                        <div className="flex items-center gap-2 font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Reparación local aplicada</div>
                        <p>{result.supersededCount} reemplazados · {result.createdCount} creados · backup {result.backupFileName}</p>
                        <p className="text-xs font-mono break-all">operationIds: {result.operationIds.join(', ') || '—'}</p>
                        {result.errors?.map(message => <p key={message} className="text-amber-600">{message}</p>)}
                        <Button
                            variant="outline"
                            onClick={() => navigate('/movements', { state: { movementFilters: { search: plan.id, datePreset: 'all', status: 'all' } } })}
                        >
                            Ver movimientos del plan <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                        <p className="text-xs text-muted-foreground">Después revisá Mis Activos y, si NEXO sigue sin precio, cargá un precio manual.</p>
                        {!rollbackResult?.ok && (
                            <div className="mt-3 border-t border-emerald-500/20 pt-3 space-y-2">
                                <label className="flex items-start gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={rollbackConfirmed}
                                        onChange={event => setRollbackConfirmed(event.target.checked)}
                                        className="mt-0.5"
                                    />
                                    <span>Entiendo que el rollback anulará las patas nuevas y reactivará los legacy de este plan. Se descargará otro backup.</span>
                                </label>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleRollback}
                                    disabled={!rollbackConfirmed || isRollingBack}
                                >
                                    <Undo2 className="h-4 w-4 mr-2" /> {isRollingBack ? 'Revirtiendo…' : 'Revertir esta reparación'}
                                </Button>
                            </div>
                        )}
                        {rollbackResult?.ok && (
                            <div className="mt-3 border-t border-emerald-500/20 pt-3">
                                <p className="font-medium">Rollback aplicado: {rollbackResult.voidedCount} patas nuevas anuladas y {rollbackResult.reactivatedCount} legacy reactivados.</p>
                                <p className="text-xs">Backup: {rollbackResult.backupFileName}</p>
                                {rollbackResult.errors?.map(message => <p key={message} className="text-amber-600">{message}</p>)}
                            </div>
                        )}
                    </section>
                )}
            </CardContent>
        </Card>
    )
}
