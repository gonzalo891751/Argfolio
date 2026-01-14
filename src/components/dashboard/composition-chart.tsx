import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Legend,
    Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatPercent } from '@/lib/utils'

const COLORS = [
    'hsl(243, 75%, 59%)', // Primary (indigo)
    'hsl(142, 76%, 36%)', // Success (green)
    'hsl(38, 92%, 50%)',  // Warning (amber)
    'hsl(262, 83%, 58%)', // Purple
    'hsl(199, 89%, 48%)', // Cyan
    'hsl(0, 84%, 60%)',   // Red
    'hsl(173, 80%, 40%)', // Teal
]

interface ChartDataItem {
    name: string
    value: number
    category?: string
}

interface CompositionChartProps {
    data: ChartDataItem[]
}

export function CompositionChart({ data }: CompositionChartProps) {
    const chartData = data.map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
    }))

    const total = chartData.reduce((sum, item) => sum + item.value, 0)

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Composición</CardTitle>
            </CardHeader>
            <CardContent>
                {chartData.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Sin datos
                    </div>
                ) : (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload?.length) {
                                            const item = payload[0].payload
                                            const percent = ((item.value / total) * 100)
                                            return (
                                                <div className="bg-popover border rounded-lg shadow-lg p-3">
                                                    <p className="text-sm font-medium">{item.name}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {formatCurrency(item.value, 'ARS')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {formatPercent(percent, { showSign: false })}
                                                    </p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                />
                                <Legend
                                    layout="vertical"
                                    align="right"
                                    verticalAlign="middle"
                                    iconType="circle"
                                    iconSize={8}
                                    formatter={(value) => (
                                        <span className="text-xs text-muted-foreground">{value}</span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
