import { useMemo } from 'react'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertCircle } from 'lucide-react'
import type { ColumnMapping, ImportDefaults } from '@/domain/import'
import type { MovementType, Currency } from '@/domain/types'

interface ColumnMapperProps {
    headers: string[]
    previewRows: string[][]
    mapping: ColumnMapping
    onMappingChange: (mapping: ColumnMapping) => void
    defaults: ImportDefaults
    onDefaultsChange: (defaults: ImportDefaults) => void
}

const FIELD_LABELS: Record<keyof ColumnMapping, { label: string; required: boolean }> = {
    datetime: { label: 'Fecha y Hora', required: false },
    date: { label: 'Fecha', required: true },
    time: { label: 'Hora', required: false },
    type: { label: 'Tipo', required: false }, // Made optional
    symbol: { label: 'Símbolo / Ticker', required: true },
    account: { label: 'Cuenta', required: true },
    quantity: { label: 'Cantidad', required: true },
    unitPrice: { label: 'Precio Unitario', required: true },
    tradeCurrency: { label: 'Moneda', required: false }, // Made optional
    totalAmount: { label: 'Monto Total', required: false },
    feeAmount: { label: 'Comisión', required: false },
    feeCurrency: { label: 'Moneda Comisión', required: false },
    fxAtTrade: { label: 'Tipo de Cambio', required: false },
    notes: { label: 'Notas', required: false },
}

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = [
    'date',
    'symbol',
    'account',
    'quantity',
    'unitPrice',
]

const TYPE_OPTIONS: { value: MovementType; label: string }[] = [
    { value: 'BUY', label: 'Compra (Buy)' },
    { value: 'SELL', label: 'Venta (Sell)' },
    { value: 'DEPOSIT', label: 'Depósito' },
    { value: 'WITHDRAW', label: 'Retiro' },
]

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
    { value: 'USD', label: 'USD' },
    { value: 'ARS', label: 'ARS' },
    { value: 'USDT', label: 'USDT' },
    { value: 'USDC', label: 'USDC' },
]

export function ColumnMapper({
    headers,
    previewRows,
    mapping,
    onMappingChange,
    defaults,
    onDefaultsChange,
}: ColumnMapperProps) {
    const columnOptions = useMemo(() => {
        return [
            { value: '', label: '— No mapear —' },
            ...headers.map((h, i) => ({ value: String(i), label: h || `Columna ${i + 1}` })),
        ]
    }, [headers])

    const handleChange = (field: keyof ColumnMapping, value: string) => {
        const idx = value === '' ? undefined : parseInt(value, 10)
        onMappingChange({
            ...mapping,
            [field]: idx,
        })
    }

    const mappedCount = useMemo(() => {
        return REQUIRED_FIELDS.filter((f) => mapping[f] !== undefined).length
    }, [mapping])

    const isComplete = mappedCount === REQUIRED_FIELDS.length

    return (
        <div className="space-y-6">
            {/* Defaults Configuration */}
            <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Valores por defecto</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label>Tipo de operación (si no se mapea)</Label>
                            <Select
                                options={TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                                value={defaults.type || 'BUY'}
                                onChange={(e) => onDefaultsChange({ ...defaults, type: e.target.value as MovementType })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Moneda (si no se mapea)</Label>
                            <Select
                                options={CURRENCY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                                value={defaults.currency || 'USD'}
                                onChange={(e) => onDefaultsChange({ ...defaults, currency: e.target.value as Currency })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Status */}
            <div className="flex items-center gap-2">
                {isComplete ? (
                    <>
                        <CheckCircle className="h-5 w-5 text-success" />
                        <span className="text-success font-medium">Mapeo completo</span>
                        <span className="text-sm text-muted-foreground ml-2">
                            (Se usarán valores por defecto para campos opcionales no mapeados)
                        </span>
                    </>
                ) : (
                    <>
                        <AlertCircle className="h-5 w-5 text-warning" />
                        <span className="text-warning font-medium">
                            {mappedCount}/{REQUIRED_FIELDS.length} campos mínimos requeridos
                        </span>
                    </>
                )}
            </div>

            {/* Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => {
                    const config = FIELD_LABELS[field]
                    const value = mapping[field]
                    const isDefaulted = (field === 'type' && mapping.type === undefined) ||
                        (field === 'tradeCurrency' && mapping.tradeCurrency === undefined)

                    return (
                        <div key={field} className="space-y-1.5">
                            <Label className="flex items-center gap-2">
                                {config.label}
                                {config.required && (
                                    <Badge variant="secondary" className="text-xs">
                                        Requerido
                                    </Badge>
                                )}
                                {!config.required && isDefaulted && (
                                    <span className="text-xs text-muted-foreground italic">
                                        (Usará defecto)
                                    </span>
                                )}
                            </Label>
                            <Select
                                options={columnOptions}
                                value={value !== undefined ? String(value) : ''}
                                onChange={(e) => handleChange(field, e.target.value)}
                            />
                        </div>
                    )
                })}
            </div>

            {/* Preview Table */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Vista previa (primeras 5 filas)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50">
                                    {headers.map((h, i) => (
                                        <th key={i} className="p-2 text-left font-medium text-muted-foreground">
                                            {h || `Col ${i + 1}`}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows.slice(0, 5).map((row, ri) => (
                                    <tr key={ri} className="border-b last:border-0">
                                        {row.map((cell, ci) => (
                                            <td key={ci} className="p-2 max-w-[150px] truncate">
                                                {cell}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
