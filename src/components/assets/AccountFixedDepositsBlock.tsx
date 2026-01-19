
import { useState } from 'react'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'
import { PFPosition } from '@/domain/pf/types'
import { Hourglass, ArrowDownToLine, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCreateMovement } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'
import type { Movement } from '@/domain/types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AccountFixedDepositsBlockProps {
    accountId: string
    positions: PFPosition[]
    fxOfficial: number
}

export function AccountFixedDepositsBlock({ accountId: _accountId, positions, fxOfficial }: AccountFixedDepositsBlockProps) {
    const createMovement = useCreateMovement()
    const { toast } = useToast()

    // Modal State
    const [rescuePF, setRescuePF] = useState<PFPosition | null>(null)
    const [rescueAmount, setRescueAmount] = useState<string>('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleOpenRescue = (pf: PFPosition) => {
        setRescuePF(pf)
        setRescueAmount(pf.expectedTotalARS.toString()) // Default to total
    }

    const handleConfirmRescue = async () => {
        if (!rescuePF) return

        try {
            setIsSubmitting(true)
            const amount = parseFloat(rescueAmount) || rescuePF.expectedTotalARS

            const redemption: Movement = {
                id: crypto.randomUUID(),
                datetimeISO: new Date().toISOString(),
                type: 'SELL',
                assetClass: 'pf',
                accountId: rescuePF.accountId, // Ensure same account
                tradeCurrency: 'ARS',
                quantity: 1,
                unitPrice: amount,
                totalAmount: amount,
                netAmount: amount,
                totalARS: amount,
                totalUSD: amount / fxOfficial,

                // Stable ID Metadata
                pf: {
                    kind: 'redeem',
                    pfId: rescuePF.movementId,
                    redeemedARS: amount,
                    redeemedAtISO: new Date().toISOString(),
                    bank: rescuePF.bank,
                    alias: rescuePF.alias
                },

                assetName: 'Rescate Plazo Fijo',
                ticker: rescuePF.bank,
                notes: `Rescate automático PF ${rescuePF.alias || ''}`
            }

            await createMovement.mutateAsync(redemption)

            toast({
                title: "Rescate registrado exitosamente",
                description: `Se acreditaron ${formatMoneyARS(amount)} en Liquidez.`,
            })

            setRescuePF(null)
        } catch (error) {
            console.error(error)
            toast({
                title: "Error al registrar rescate",
                description: "Por favor intente nuevamente.",
                variant: 'destructive' as any
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    if (positions.length === 0) return null

    return (
        <div className="mb-4">
            {/* Header / Label inside account */}
            <div className="flex items-center gap-2 mb-2 px-1">
                <Hourglass className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Plazos Fijos / Frascos</span>
                <Badge variant="outline" className="text-[10px] items-center px-1.5 py-0 h-4 border-amber-500/30 text-amber-500 bg-amber-500/5">
                    {positions.length}
                </Badge>
            </div>

            <div className="border rounded-xl overflow-hidden bg-slate-900/30 border-amber-500/10 shadow-sm relative">
                {/* Decorative glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                <div className="overflow-x-auto">
                    <table className="w-full text-sm relative z-10">
                        <thead className="bg-amber-500/5 border-b border-amber-500/10">
                            <tr>
                                <th className="text-left p-4 font-medium text-amber-500/80 w-[200px]">Producto</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Capital</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">TNA</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">TEA</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Plazo</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Vencimiento</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Interés Est.</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Total a Cobrar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {positions.map((pf) => {
                                const maturityDate = new Date(pf.maturityTs)
                                const isMaturityNear = (maturityDate.getTime() - Date.now()) < (3 * 24 * 60 * 60 * 1000)

                                return (
                                    <tr
                                        key={pf.id}
                                        className="hover:bg-amber-500/5 transition-colors group relative"
                                    >
                                        {/* Producto */}
                                        <td className="p-4 align-top">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white max-w-[150px] truncate" title={pf.bank}>
                                                        {pf.bank}
                                                    </span>
                                                    {pf.status === 'matured' && (
                                                        <Badge variant="outline" className="text-[10px] uppercase bg-amber-500/10 text-amber-500 border-amber-500/30 px-1 py-0 h-5">
                                                            Vencido
                                                        </Badge>
                                                    )}
                                                </div>
                                                {pf.alias && (
                                                    <span className="text-xs text-slate-400 italic">"{pf.alias}"</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Capital */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col items-end">
                                                <span className="font-numeric font-medium text-slate-300">
                                                    {formatMoneyARS(pf.principalARS)}
                                                </span>
                                                <span className="text-xs font-mono text-sky-500/70">
                                                    ≈ {formatMoneyUSD(pf.principalARS / (pf.initialFx || fxOfficial))}
                                                </span>
                                            </div>
                                        </td>

                                        {/* TNA */}
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric text-slate-300">
                                                {formatPercent(pf.tna / 100)}
                                            </span>
                                        </td>

                                        {/* TEA (New) */}
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric text-slate-300">
                                                {formatPercent(pf.tea / 100)}
                                            </span>
                                        </td>

                                        {/* Plazo */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col items-end">
                                                <span className="font-numeric text-white">{pf.termDays}d</span>
                                                <span className="text-xs text-slate-500">
                                                    {new Date(pf.startTs).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Vencimiento */}
                                        <td className="p-4 text-right align-top">
                                            <span className={isMaturityNear || pf.status === 'matured' ? "text-amber-400 font-bold" : "text-white"}>
                                                {maturityDate.toLocaleDateString('es-AR')}
                                            </span>
                                        </td>

                                        {/* Interés Est. */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col items-end">
                                                <span className="font-numeric font-medium text-emerald-400">
                                                    +{formatMoneyARS(pf.expectedInterestARS)}
                                                </span>
                                                <span className="text-xs font-mono text-emerald-500/70">
                                                    ≈ {formatMoneyUSD(pf.expectedInterestARS / fxOfficial)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Total a Cobrar */}
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col items-end gap-2">
                                                <div>
                                                    <span className="font-numeric font-bold text-amber-400 text-lg block">
                                                        {formatMoneyARS(pf.expectedTotalARS)}
                                                    </span>
                                                    <div className="text-xs font-mono text-amber-500/70 text-right">
                                                        ≈ {formatMoneyUSD(pf.expectedTotalARS / fxOfficial)}
                                                    </div>
                                                </div>

                                                {/* Action Button */}
                                                {(pf.status === 'matured' || isMaturityNear) && (
                                                    <Button
                                                        size="sm"
                                                        variant={pf.status === 'matured' ? "default" : "secondary"}
                                                        className={pf.status === 'matured' ? "bg-indigo-600 hover:bg-indigo-500 text-white h-7 text-xs shadow-lg shadow-indigo-500/20" : "h-6 text-[10px] opacity-70 hover:opacity-100 hidden group-hover:inline-flex"}
                                                        onClick={() => handleOpenRescue(pf)}
                                                    >
                                                        <ArrowDownToLine className="w-3 h-3 mr-1.5" />
                                                        {pf.status === 'matured' ? "Rescatar" : "Rescatar"}
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Rescue Dialog */}
            <Dialog open={!!rescuePF} onOpenChange={(open) => !open && setRescuePF(null)}>
                <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-display text-white">Registrar Rescate</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Confirme la acreditación de su Plazo Fijo.
                        </DialogDescription>
                    </DialogHeader>

                    {rescuePF && (
                        <div className="grid gap-4 py-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Monto a Acreditar (ARS)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    value={rescueAmount}
                                    onChange={(e) => setRescueAmount(e.target.value)}
                                    className="font-numeric text-lg bg-slate-950/50 border-slate-700 focus:border-indigo-500 h-12"
                                />
                                <p className="text-xs text-slate-500 text-right">
                                    Original estimado: {formatMoneyARS(rescuePF.expectedTotalARS)}
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setRescuePF(null)} className="hover:bg-slate-800 text-slate-400 hover:text-white">
                            Cancelar
                        </Button>
                        <Button onClick={handleConfirmRescue} disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[100px]">
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
