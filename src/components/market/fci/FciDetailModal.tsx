/**
 * FCI Detail Modal Component
 * 
 * Shows detailed fund information with sparkline visualization.
 */

import { useEffect } from 'react'
import { X, TrendingUp, TrendingDown, Clock, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { formatVcp, formatVariation, formatDateAR, generateSparkline } from './fciFormatters'
import type { FciFund } from '@/domain/fci/types'

export interface FciDetailModalProps {
    fund: FciFund
    onClose: () => void
}

export function FciDetailModal({ fund, onClose }: FciDetailModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    const variation = fund.variation1d
    const isPositive = variation != null && variation > 0
    const isNegative = variation != null && variation < 0

    // Generate deterministic sparkline from fund id
    const sparklineData = generateSparkline(fund.id)
    const minVal = Math.min(...sparklineData)
    const maxVal = Math.max(...sparklineData)

    return (
        <div className="fixed inset-0 z-50" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Content */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg p-4">
                <div
                    className="glass-panel bg-card rounded-2xl shadow-2xl overflow-hidden border relative animate-in fade-in zoom-in-95"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Modal Header */}
                    <div className="p-6 border-b border-border/50 relative">
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-2 rounded-full hover:bg-muted transition"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <div className="flex items-start gap-4 mb-1">
                            <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center text-xl font-display font-bold text-muted-foreground">
                                {fund.manager.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0 pr-8">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-mono text-primary uppercase tracking-wider">
                                        {fund.manager}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                                        {fund.currency}
                                    </span>
                                </div>
                                <h2 className="font-display text-xl font-bold text-foreground leading-tight truncate">
                                    {fund.name}
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div className="p-6 space-y-6">
                        {/* Main KPI */}
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">
                                    Valor Cuotaparte
                                </div>
                                <div className="font-mono text-3xl font-medium text-foreground tracking-tight">
                                    {formatVcp(fund.vcp, fund.currency)}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    al {formatDateAR(fund.date)}
                                </div>
                                {fund.vcpPer1000 != null && (
                                    <div className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                                        x1000: {formatVcp(fund.vcpPer1000, fund.currency)}
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <div
                                    className={cn(
                                        "inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-bold border",
                                        isPositive && "bg-success/10 border-success/20 text-success",
                                        isNegative && "bg-destructive/10 border-destructive/20 text-destructive",
                                        !isPositive && !isNegative && "bg-muted border-border text-muted-foreground"
                                    )}
                                >
                                    {isPositive && <TrendingUp className="h-4 w-4" />}
                                    {isNegative && <TrendingDown className="h-4 w-4" />}
                                    <span>{formatVariation(variation)}</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Variación diaria
                                </div>
                            </div>
                        </div>

                        {/* Sparkline */}
                        <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
                            <div className="flex justify-between items-end h-24 gap-1">
                                {sparklineData.map((val, i) => {
                                    // Normalize height between 20% and 100%
                                    const heightPct = 20 + ((val - minVal) / (maxVal - minVal || 1)) * 80
                                    return (
                                        <div
                                            key={i}
                                            className="w-full rounded-t-sm bg-primary/40 hover:bg-primary transition-all"
                                            style={{
                                                height: `${heightPct}%`,
                                                animationDelay: `${i * 50}ms`,
                                            }}
                                        />
                                    )
                                })}
                            </div>
                            <div className="flex justify-between mt-2 text-[10px] font-mono text-muted-foreground uppercase">
                                <span>Hace 12 meses</span>
                                <span>Hoy</span>
                            </div>
                        </div>

                        {/* Meta Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">
                                    Plazo de Rescate
                                </div>
                                <div className="text-foreground font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <span>{fund.term || '—'}</span>
                                </div>
                            </div>
                            <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                                <div className="text-xs text-muted-foreground mb-1">
                                    Categoría
                                </div>
                                <div className="text-foreground font-medium truncate">
                                    {fund.category}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 border-t border-border/50 bg-muted/20 flex gap-3">
                        <Button variant="outline" className="flex-1">
                            Ficha Técnica (PDF)
                        </Button>
                        <Button className="flex-1 gap-2">
                            <Plus className="h-4 w-4" />
                            Agregar a Mis Activos
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
