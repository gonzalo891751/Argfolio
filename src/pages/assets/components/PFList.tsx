
import { formatMoneyARS, formatPercent } from '@/lib/format'
import { PFPosition } from '@/domain/pf/types'
import { Hourglass } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PFListProps {
    positions: PFPosition[]
}

export function PFList({ positions }: PFListProps) {
    if (positions.length === 0) return null

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-amber-500/10 to-transparent p-4 rounded-xl border border-amber-500/20">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-amber-100">
                        <Hourglass className="w-5 h-5 text-amber-500" />
                        Plazos Fijos
                        <Badge variant="outline" className="text-xs font-normal text-amber-500 border-amber-500/30">
                            {positions.length} activos
                        </Badge>
                    </h2>
                    <p className="text-xs text-amber-500/70 mt-1">
                        Inversiones activas a cobrar
                    </p>
                </div>
            </div>

            <div className="border rounded-xl overflow-hidden bg-background/50 shadow-sm border-amber-500/10">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-amber-500/5 border-b border-amber-500/10">
                            <tr>
                                <th className="text-left p-4 font-medium text-amber-500/80 w-[240px]">Banco / Entidad</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Capital</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">TNA</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Plazo</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Vencimiento</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Interés Est.</th>
                                <th className="text-right p-4 font-medium text-amber-500/80">Total a Cobrar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {positions.map((pf) => {
                                const maturityDate = new Date(pf.maturityTs)
                                const isMaturityNear = (maturityDate.getTime() - Date.now()) < (3 * 24 * 60 * 60 * 1000) // 3 days

                                return (
                                    <tr
                                        key={pf.id}
                                        className="hover:bg-amber-500/5 transition-colors group"
                                    >
                                        <td className="p-4 align-top">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-white">{pf.bank}</span>
                                                {pf.alias && (
                                                    <span className="text-xs text-slate-400 italic">"{pf.alias}"</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric font-medium text-slate-300">
                                                {formatMoneyARS(pf.principalARS)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric text-slate-300">
                                                {formatPercent(pf.tna / 100)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <div className="flex flex-col items-end">
                                                <span className="font-numeric text-white">{pf.termDays} días</span>
                                                <span className="text-xs text-slate-500">
                                                    desde {new Date(pf.startTs).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <span className={isMaturityNear ? "text-amber-400 font-bold" : "text-white"}>
                                                {maturityDate.toLocaleDateString('es-AR')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric font-medium text-emerald-400">
                                                +{formatMoneyARS(pf.expectedInterestARS)}
                                            </span>
                                            <span className="text-[10px] text-slate-500 block uppercase">
                                                TEA {pf.tea.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-4 text-right align-top">
                                            <span className="font-numeric font-bold text-amber-400 text-lg">
                                                {formatMoneyARS(pf.expectedTotalARS)}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
