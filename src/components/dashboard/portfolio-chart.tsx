import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { Camera, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'

interface ChartDataPoint {
    date: string
    value: number
}

interface PortfolioChartProps {
    data: ChartDataPoint[]
    hasData: boolean
    isLoading?: boolean
}

export function PortfolioChart({ data, hasData, isLoading }: PortfolioChartProps) {
    const navigate = useNavigate()

    const chartData = data.map((point) => ({
        ...point,
        label: new Date(point.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
    }))

    return (
        <Card className="col-span-full lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Valor del Portfolio
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                {isLoading ? (
                    <Skeleton className="h-64 w-full" />
                ) : !hasData || chartData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                        <Camera className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-center mb-4">
                            Guardá tu primer snapshot para ver la evolución de tu portfolio
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => navigate('/history')}
                        >
                            Ir a Historial
                        </Button>
                    </div>
                ) : (
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tick={{ fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-muted-foreground"
                                />
                                <YAxis
                                    tick={{ fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => formatCurrency(value, 'ARS', { compact: true })}
                                    className="text-muted-foreground"
                                    width={70}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload?.length) {
                                            const value = payload[0].value as number
                                            return (
                                                <div className="bg-popover border rounded-lg shadow-lg p-3">
                                                    <p className="text-sm font-medium">{formatCurrency(value, 'ARS')}</p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
