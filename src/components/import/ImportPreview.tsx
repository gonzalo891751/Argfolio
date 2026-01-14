import { useState } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import type { ValidationResult } from '@/domain/import'
import type { AssetCategory, Currency } from '@/domain/types'

interface ImportPreviewProps {
    validation: ValidationResult
    onCreateInstruments: (symbols: Set<string>, category: AssetCategory, currency: Currency) => Promise<void>
    onCreateAccounts: (names: Set<string>) => Promise<void>
}

const categoryOptions = [
    { value: 'CRYPTO', label: 'Cripto' },
    { value: 'CEDEAR', label: 'Cedear' },
    { value: 'STABLE', label: 'Stablecoin' },
    { value: 'FCI', label: 'FCI' },
]

const currencyOptions = [
    { value: 'USD', label: 'USD' },
    { value: 'ARS', label: 'ARS' },
    { value: 'USDT', label: 'USDT' },
]

export function ImportPreview({
    validation,
    onCreateInstruments,
    onCreateAccounts,
}: ImportPreviewProps) {
    const [showInstrumentDialog, setShowInstrumentDialog] = useState(false)
    const [showAccountDialog, setShowAccountDialog] = useState(false)
    const [instrumentCategory, setInstrumentCategory] = useState<AssetCategory>('CRYPTO')
    const [instrumentCurrency, setInstrumentCurrency] = useState<Currency>('USD')
    const [isCreating, setIsCreating] = useState(false)

    const { summary, unknownSymbols, unknownAccounts, invalidRows, oversellWarnings } = validation

    const handleCreateInstruments = async () => {
        setIsCreating(true)
        try {
            await onCreateInstruments(unknownSymbols, instrumentCategory, instrumentCurrency)
            setShowInstrumentDialog(false)
        } finally {
            setIsCreating(false)
        }
    }

    const handleCreateAccounts = async () => {
        setIsCreating(true)
        try {
            await onCreateAccounts(unknownAccounts)
            setShowAccountDialog(false)
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{summary.total}</p>
                        <p className="text-sm text-muted-foreground">Total filas</p>
                    </CardContent>
                </Card>
                <Card className={summary.valid > 0 ? 'border-success/30' : ''}>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-success">{summary.valid}</p>
                        <p className="text-sm text-muted-foreground">Válidas</p>
                    </CardContent>
                </Card>
                <Card className={summary.invalid > 0 ? 'border-destructive/30' : ''}>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-destructive">{summary.invalid}</p>
                        <p className="text-sm text-muted-foreground">Con errores</p>
                    </CardContent>
                </Card>
                <Card className={summary.warnings > 0 ? 'border-warning/30' : ''}>
                    <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-warning">{summary.warnings}</p>
                        <p className="text-sm text-muted-foreground">Advertencias</p>
                    </CardContent>
                </Card>
            </div>

            {/* Unknown Symbols */}
            {unknownSymbols.size > 0 && (
                <Card className="border-warning/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            Símbolos desconocidos ({unknownSymbols.size})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Array.from(unknownSymbols).map((s) => (
                                <Badge key={s} variant="secondary">{s}</Badge>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowInstrumentDialog(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Crear instrumentos
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Unknown Accounts */}
            {unknownAccounts.size > 0 && (
                <Card className="border-warning/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            Cuentas desconocidas ({unknownAccounts.size})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2 mb-4">
                            {Array.from(unknownAccounts).map((a) => (
                                <Badge key={a} variant="secondary">{a}</Badge>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAccountDialog(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Crear cuentas
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Invalid Rows */}
            {invalidRows.length > 0 && (
                <Card className="border-destructive/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-destructive" />
                            Filas con errores ({invalidRows.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {invalidRows.slice(0, 10).map(({ row, errors }) => (
                                <div key={row.rowIndex} className="text-sm p-2 bg-destructive/5 rounded">
                                    <span className="font-medium">Fila {row.rowIndex + 2}:</span>{' '}
                                    {errors.join(', ')}
                                </div>
                            ))}
                            {invalidRows.length > 10 && (
                                <p className="text-sm text-muted-foreground">
                                    ... y {invalidRows.length - 10} más
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Oversell Warnings */}
            {oversellWarnings.length > 0 && (
                <Card className="border-warning/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            Advertencias de sobreventa ({oversellWarnings.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {oversellWarnings.slice(0, 5).map(({ row, available, requested }) => (
                                <div key={row.rowIndex} className="text-sm p-2 bg-warning/5 rounded">
                                    <span className="font-medium">Fila {row.rowIndex + 2}:</span>{' '}
                                    {row.symbol} - Intentás vender {requested} pero tenés {available}
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Las ventas se importarán pero pueden generar posiciones negativas.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Success state */}
            {summary.valid > 0 && unknownSymbols.size === 0 && unknownAccounts.size === 0 && (
                <Card className="border-success/30 bg-success/5">
                    <CardContent className="p-4 flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-success" />
                        <div>
                            <p className="font-medium text-success">Listo para importar</p>
                            <p className="text-sm text-muted-foreground">
                                {summary.valid} movimientos serán creados
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Create Instruments Dialog */}
            <Dialog open={showInstrumentDialog} onOpenChange={setShowInstrumentDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Crear instrumentos</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            Se crearán {unknownSymbols.size} instrumentos nuevos:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {Array.from(unknownSymbols).map((s) => (
                                <Badge key={s} variant="outline">{s}</Badge>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Categoría</Label>
                                <Select
                                    options={categoryOptions}
                                    value={instrumentCategory}
                                    onChange={(e) => setInstrumentCategory(e.target.value as AssetCategory)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Moneda nativa</Label>
                                <Select
                                    options={currencyOptions}
                                    value={instrumentCurrency}
                                    onChange={(e) => setInstrumentCurrency(e.target.value as Currency)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInstrumentDialog(false)}>
                            Cancelar
                        </Button>
                        <Button
                            variant="gradient"
                            onClick={handleCreateInstruments}
                            disabled={isCreating}
                        >
                            {isCreating ? 'Creando...' : 'Crear instrumentos'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Accounts Dialog */}
            <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Crear cuentas</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            Se crearán {unknownAccounts.size} cuentas nuevas:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {Array.from(unknownAccounts).map((a) => (
                                <Badge key={a} variant="outline">{a}</Badge>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAccountDialog(false)}>
                            Cancelar
                        </Button>
                        <Button
                            variant="gradient"
                            onClick={handleCreateAccounts}
                            disabled={isCreating}
                        >
                            {isCreating ? 'Creando...' : 'Crear cuentas'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
