
import { useState, useEffect } from 'react'
import { Pencil, Check, X, TrendingUp, Wallet } from 'lucide-react'
import { Account } from '@/domain/types'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'
import { computeYieldMetrics } from '@/domain/yield/accrual'
import { db } from '@/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useQueryClient } from '@tanstack/react-query'

interface YieldSummaryCardProps {
    account: Account
    balanceArs: number
    balanceUsd: number
    fxOfficial: number // Sell Rate
}

export function YieldSummaryCard({ account, balanceArs, balanceUsd, fxOfficial }: YieldSummaryCardProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()

    const [isEditing, setIsEditing] = useState(false)
    const [tnaInput, setTnaInput] = useState('0')
    const [isSaving, setIsSaving] = useState(false)

    // Optimistic TNA state
    const [effectiveTna, setEffectiveTna] = useState(account.cashYield?.tna || 0)

    // Sync state if prop changes (e.g. initial load or external update)
    // But prioritize local state if we just edited it? 
    // Actually, if query invalidates, prop updates. We should sync.
    useEffect(() => {
        setEffectiveTna(account.cashYield?.tna || 0)
    }, [account.cashYield?.tna])

    useEffect(() => {
        setTnaInput(effectiveTna.toString())
    }, [effectiveTna])

    // Metrics
    const metrics = computeYieldMetrics(balanceArs, effectiveTna)
    const isRemunerada = effectiveTna > 0

    const handleSave = async () => {
        const newTna = parseFloat(tnaInput)
        if (isNaN(newTna) || newTna < 0) {
            toast({
                title: 'Valor inválido',
                description: 'La TNA debe ser un número positivo.',
                variant: 'destructive' as any
            })
            return
        }

        setIsSaving(true)
        // Optimistic Update
        setEffectiveTna(newTna)
        setIsEditing(false)

        try {
            await db.accounts.update(account.id, {
                cashYield: {
                    ...account.cashYield,
                    tna: newTna,
                    enabled: true,
                    currency: 'ARS',
                    compounding: 'DAILY' as const
                }
            })

            // Invalidate to refresh data across app
            await queryClient.invalidateQueries({ queryKey: ['accounts'] })

            toast({
                title: 'TNA Actualizada',
                description: `Nueva Tasa Nominal Anual: ${newTna}%`,
            })
        } catch (e) {
            console.error(e)
            // Revert on error
            setEffectiveTna(account.cashYield?.tna || 0)
            toast({ title: 'Error', description: 'No se pudo actualizar la TNA.', variant: 'destructive' as any })
        } finally {
            setIsSaving(false)
        }
    }

    const cancelEdit = () => {
        setTnaInput(effectiveTna.toString())
        setIsEditing(false)
    }

    // Helper for Dual Currency Display
    const DualAmount = ({ ars, label, className = '' }: { ars: number, label?: string, className?: string }) => {
        const usd = ars / fxOfficial
        return (
            <div className={`flex flex-col ${className}`}>
                {label && <span className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{label}</span>}
                <span className="font-mono text-white font-medium">
                    {formatMoneyARS(ars)}
                </span>
                <span className="text-xs font-mono text-slate-500">
                    {formatMoneyUSD(usd)} (Oficial)
                </span>
            </div>
        )
    }

    return (
        <div className="bg-slate-900/50 border border-indigo-500/20 rounded-xl p-4 mb-4 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 p-20 bg-indigo-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                        {isRemunerada ? <TrendingUp className="w-5 h-5" /> : <Wallet className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-white flex items-center gap-2">
                            {isRemunerada ? 'Cuenta Remunerada' : 'Efectivo'}
                            {isRemunerada && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-indigo-500/30 text-indigo-400">
                                    {effectiveTna}% TNA
                                </Badge>
                            )}
                        </h3>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            {!isEditing ? (
                                <>
                                    {isRemunerada && <span>TEA: {formatPercent(metrics.tea)}</span>}
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/10 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide flex items-center gap-1"
                                    >
                                        <Pencil className="w-3 h-3" /> {isRemunerada ? 'Editar Tasa' : 'Configurar TNA'}
                                    </button>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="uppercase tracking-wider text-[10px] text-muted-foreground font-medium">TNA</span>
                                    <Input
                                        value={tnaInput}
                                        onChange={e => setTnaInput(e.target.value)}
                                        className="h-6 w-16 text-xs bg-slate-950 border-slate-700"
                                        autoFocus
                                    />
                                    <span className="text-xs">%</span>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={handleSave} disabled={isSaving}>
                                        <Check className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-slate-400" onClick={cancelEdit}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                {/* Capital ARS */}
                {balanceArs > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-slate-500 uppercase tracking-wider block">Capital (Pesos)</span>
                        <DualAmount ars={balanceArs} />
                    </div>
                )}

                {/* Capital USD (Displayed if exists) */}
                {balanceUsd > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-sky-500/70 uppercase tracking-wider block">Capital (Dólares)</span>
                        <div className="flex flex-col">
                            <span className="font-mono text-white font-medium">
                                {formatMoneyUSD(balanceUsd)}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                                ≈ {formatMoneyARS(balanceUsd * fxOfficial)} (Oficial)
                            </span>
                        </div>
                    </div>
                )}

                {/* Projections (Only if Remunerada) */}
                {isRemunerada && (
                    <>
                        {/* Tomorrow (No changes requested, keeping existing) */}
                        <div className="space-y-1 relative group">
                            <span className="text-xs text-emerald-500/80 uppercase tracking-wider block">Interés Mañana</span>
                            <div className="flex flex-col">
                                <span className="font-mono text-emerald-400 font-medium">
                                    +{formatMoneyARS(metrics.interestTomorrow)}
                                </span>
                                <span className="text-xs font-mono text-emerald-500/50">
                                    +{formatMoneyUSD(metrics.interestTomorrow / fxOfficial)}
                                </span>
                            </div>
                        </div>

                        {/* 30 Days (Expanded) */}
                        <div className="space-y-1">
                            <span className="text-xs text-indigo-400/80 uppercase tracking-wider block whitespace-nowrap">Proyección 30d</span>
                            {/* Interest */}
                            <div className="flex justify-between items-baseline gap-2">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Interés</span>
                                <div className="text-right leading-tight">
                                    <span className="font-mono text-emerald-400 font-medium block text-xs">
                                        +{formatMoneyARS(metrics.proj30d)}
                                    </span>
                                    <span className="text-[10px] font-mono text-emerald-500/50 block">
                                        +{formatMoneyUSD(metrics.proj30d / fxOfficial)}
                                    </span>
                                </div>
                            </div>
                            {/* Total */}
                            <div className="flex justify-between items-baseline gap-2 mt-1 pt-1 border-t border-white/5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
                                <div className="text-right leading-tight">
                                    <span className="font-mono text-white font-medium block text-xs">
                                        {formatMoneyARS(balanceArs + metrics.proj30d)}
                                    </span>
                                    <span className="text-[10px] font-mono text-sky-500 block">
                                        {formatMoneyUSD((balanceArs + metrics.proj30d) / fxOfficial)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 1 Year (Expanded) */}
                        <div className="space-y-1">
                            <span className="text-xs text-indigo-400/80 uppercase tracking-wider block whitespace-nowrap">Proyección 1 Año</span>
                            {/* Interest */}
                            <div className="flex justify-between items-baseline gap-2">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Interés</span>
                                <div className="text-right leading-tight">
                                    <span className="font-mono text-emerald-400 font-medium block text-xs">
                                        +{formatMoneyARS(metrics.proj1y)}
                                    </span>
                                    <span className="text-[10px] font-mono text-emerald-500/50 block">
                                        +{formatMoneyUSD(metrics.proj1y / fxOfficial)}
                                    </span>
                                </div>
                            </div>
                            {/* Total */}
                            <div className="flex justify-between items-baseline gap-2 mt-1 pt-1 border-t border-white/5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</span>
                                <div className="text-right leading-tight">
                                    <span className="font-mono text-white font-medium block text-xs">
                                        {formatMoneyARS(balanceArs + metrics.proj1y)}
                                    </span>
                                    <span className="text-[10px] font-mono text-sky-500 block">
                                        {formatMoneyUSD((balanceArs + metrics.proj1y) / fxOfficial)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
