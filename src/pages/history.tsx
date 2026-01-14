import { useState } from 'react'
import { Camera, Trash2, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSnapshots, useSaveSnapshot, useDeleteSnapshot } from '@/hooks/use-snapshots'
import { formatCurrency } from '@/lib/utils'
import { DeleteConfirmDialog } from '@/components/movements/DeleteConfirmDialog'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'

export function HistoryPage() {
    const { data: snapshots = [], isLoading } = useSnapshots()
    const saveSnapshot = useSaveSnapshot()
    const deleteSnapshot = useDeleteSnapshot()
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)

    const handleSaveSnapshot = async () => {
        setSaveError(null)
        try {
            await saveSnapshot.mutateAsync('MEP')
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Error al guardar')
        }
    }

    const handleDelete = async () => {
        if (deleteId) {
            await deleteSnapshot.mutateAsync(deleteId)
            setDeleteId(null)
        }
    }

    // Prepare chart data (reverse to show oldest first)
    const chartData = [...snapshots]
        .reverse()
        .map((s) => ({
            date: new Date(s.dateLocal).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
            totalARS: s.totalARS,
            totalUSD: s.totalUSD,
        }))

    const formatDate = (dateLocal: string) => {
        return new Date(dateLocal).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Historial</h1>
                    <p className="text-muted-foreground">Evolución de tu patrimonio a lo largo del tiempo</p>
                </div>
                <Button
                    variant="gradient"
                    onClick={handleSaveSnapshot}
                    disabled={saveSnapshot.isPending}
                >
                    <Camera className="h-4 w-4 mr-2" />
                    {saveSnapshot.isPending ? 'Guardando...' : 'Guardar Snapshot de Hoy'}
                </Button>
            </div>

            {saveError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    {saveError}
                </div>
            )}

            {/* Chart */}
            {snapshots.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Evolución del Portfolio
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="hsl(var(--border))"
                                        opacity={0.5}
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 12 }}
                                        stroke="hsl(var(--muted-foreground))"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 12 }}
                                        stroke="hsl(var(--muted-foreground))"
                                        tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'hsl(var(--card))',
                                            borderColor: 'hsl(var(--border))',
                                            borderRadius: '8px',
                                        }}
                                        formatter={(value: number) => [formatCurrency(value, 'ARS'), 'Total ARS']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="totalARS"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={2}
                                        fill="url(#historyGradient)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Snapshots Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Snapshots Guardados</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : snapshots.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground">
                            <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Sin snapshots</p>
                            <p className="text-sm">Guardá un snapshot para empezar a trackear la evolución de tu portfolio</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/50">
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Fecha</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Total ARS</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Total USD</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">FX Usado</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground w-[100px]">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshots.map((s) => (
                                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="p-4 font-medium">{formatDate(s.dateLocal)}</td>
                                            <td className="p-4 text-right font-numeric">{formatCurrency(s.totalARS, 'ARS')}</td>
                                            <td className="p-4 text-right font-numeric text-muted-foreground">
                                                {formatCurrency(s.totalUSD, 'USD')}
                                            </td>
                                            <td className="p-4 text-right">
                                                <Badge variant="secondary">
                                                    {s.fxUsed.type} @ {s.fxUsed.usdArs.toFixed(0)}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteId(s.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <DeleteConfirmDialog
                open={!!deleteId}
                onOpenChange={(open) => !open && setDeleteId(null)}
                onConfirm={handleDelete}
                title="¿Eliminar snapshot?"
                description="Esta acción no se puede deshacer."
            />
        </div>
    )
}
