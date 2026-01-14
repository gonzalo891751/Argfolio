import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

const COLORS = [
    'hsl(243, 75%, 59%)', // Primary
    'hsl(243, 75%, 65%)',
    'hsl(243, 75%, 70%)',
    'hsl(243, 75%, 75%)',
    'hsl(243, 75%, 80%)',
]

interface PositionItem {
    symbol: string
    name: string
    value: number
}

interface TopPositionsChartProps {
    data: PositionItem[]
}

export function TopPositionsChart({ data }: TopPositionsChartProps) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Top Posiciones</CardTitle>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        Sin posiciones
                    </div>
                ) : (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={data}
                                layout="vertical"
                                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                            >
                                <XAxis
                                    type="number"
                                    hide
                                />
                                <YAxis
                                    type="category"
                                    dataKey="symbol"
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={60}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload?.length) {
                                            const item = payload[0].payload as PositionItem
                                            return (
                                                <div className="bg-popover border rounded-lg shadow-lg p-3">
                                                    <p className="text-sm font-medium">{item.name}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {formatCurrency(item.value, 'ARS')}
                                                    </p>
                                                </div>
                                            )
                                        }
                                        return null
                                    }}
                                    cursor={{ fill: 'hsl(var(--muted))' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {data.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
