import { useState } from 'react'
import { Sun, Moon, Monitor, RefreshCw, DollarSign, AlertTriangle, RotateCcw } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { resetDatabase } from '@/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useTrackCash } from '@/hooks/use-preferences'

type FxPreference = 'MEP' | 'CCL'

export function SettingsPage() {
    const { theme, setTheme } = useTheme()
    const { isAutoRefreshEnabled, setAutoRefreshEnabled } = useAutoRefresh()
    const queryClient = useQueryClient()

    const [fxPreference, setFxPreference] = useState<FxPreference>(() => {
        return (localStorage.getItem('argfolio-fx-preference') as FxPreference) || 'MEP'
    })
    const [isResetting, setIsResetting] = useState(false)

    const handleFxChange = (pref: FxPreference) => {
        setFxPreference(pref)
        localStorage.setItem('argfolio-fx-preference', pref)
        // Invalidate portfolio to recalculate with new FX
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
    }

    const handleResetData = async () => {
        if (!confirm('¿Estás seguro? Esto eliminará todos los movimientos y datos guardados.')) {
            return
        }

        setIsResetting(true)
        try {
            await resetDatabase()
            // Invalidate all queries
            queryClient.invalidateQueries()
            alert('Datos reiniciados correctamente')
        } catch (error) {
            console.error('Error resetting database:', error)
            alert('Error al reiniciar los datos')
        } finally {
            setIsResetting(false)
        }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold">Configuración</h1>
                <p className="text-muted-foreground">Personalizá tu experiencia en Argfolio</p>
            </div>

            {/* Theme */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Apariencia</CardTitle>
                    <CardDescription>Seleccioná el tema de la aplicación</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <ThemeButton
                            icon={Sun}
                            label="Claro"
                            isActive={theme === 'light'}
                            onClick={() => setTheme('light')}
                        />
                        <ThemeButton
                            icon={Moon}
                            label="Oscuro"
                            isActive={theme === 'dark'}
                            onClick={() => setTheme('dark')}
                        />
                        <ThemeButton
                            icon={Monitor}
                            label="Sistema"
                            isActive={theme === 'system'}
                            onClick={() => setTheme('system')}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* FX Conversion */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Tipo de cambio
                    </CardTitle>
                    <CardDescription>
                        Elegí qué cotización usar para convertir USD a ARS
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Button
                            variant={fxPreference === 'MEP' ? 'default' : 'outline'}
                            onClick={() => handleFxChange('MEP')}
                            className="flex-1"
                        >
                            Dólar MEP
                        </Button>
                        <Button
                            variant={fxPreference === 'CCL' ? 'default' : 'outline'}
                            onClick={() => handleFxChange('CCL')}
                            className="flex-1"
                        >
                            Dólar CCL
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                        Esta configuración afecta la conversión de activos en USD a pesos en todo el dashboard.
                    </p>
                </CardContent>
            </Card>

            {/* Auto refresh */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Actualización de datos
                    </CardTitle>
                    <CardDescription>Configurá la frecuencia y origen de las actualizaciones</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Habilitar auto-refresh</p>
                            <p className="text-sm text-muted-foreground">
                                {isAutoRefreshEnabled
                                    ? 'Los datos se actualizan automáticamente cada 5 min'
                                    : 'Actualizá manualmente con el botón "Actualizar"'}
                            </p>
                        </div>
                        <Switch
                            checked={isAutoRefreshEnabled}
                            onCheckedChange={setAutoRefreshEnabled}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Precios CEDEAR automáticos (PPI)</p>
                            <p className="text-sm text-muted-foreground">
                                Obtener cotizaciones de CEDEARs automáticamente desde PPI
                            </p>
                        </div>
                        <CedearToggle />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Trackear liquidez/caja</p>
                            <p className="text-sm text-muted-foreground">
                                Habilitar seguimiento de efectivo (USD/ARS/etc). Si está desactivado, el dashboard mostrará "Modo simple".
                            </p>
                        </div>
                        <TrackCashToggle />
                    </div>
                </CardContent>
            </Card>

            {/* Reset Data */}
            <Card className="border-destructive/30">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Zona de peligro
                    </CardTitle>
                    <CardDescription>
                        Acciones irreversibles que afectan todos tus datos
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">Reiniciar datos de demo</p>
                            <p className="text-sm text-muted-foreground">
                                Elimina todos los movimientos, snapshots y deudas, y recarga los datos de demo
                            </p>
                        </div>
                        <Button
                            variant="destructive"
                            onClick={handleResetData}
                            disabled={isResetting}
                        >
                            <RotateCcw className={cn('h-4 w-4 mr-2', isResetting && 'animate-spin')} />
                            {isResetting ? 'Reiniciando...' : 'Reiniciar'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* About */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Acerca de Argfolio</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p>Versión: 0.2.0 (Phase 2)</p>
                        <p>
                            Argfolio es un tracker de inversiones diseñado para el mercado argentino. Seguí tus
                            Cedears, criptomonedas, stablecoins, FCIs, plazos fijos y deudas en un solo lugar.
                        </p>
                        <p className="pt-2 text-xs">
                            Phase 2: Movements CRUD + Portfolio Engine + Local Persistence (IndexedDB)
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}


function CedearToggle() {
    const queryClient = useQueryClient()
    const [enabled, setEnabled] = useState(() => {
        const stored = localStorage.getItem('argfolio-settings-cedear-auto')
        return stored !== 'false'
    })

    const handleToggle = (checked: boolean) => {
        setEnabled(checked)
        localStorage.setItem('argfolio-settings-cedear-auto', String(checked))
        queryClient.invalidateQueries({ queryKey: ['portfolio'] })
        queryClient.invalidateQueries({ queryKey: ['cedears'] })
    }

    return (
        <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
        />
    )
}

function TrackCashToggle() {
    const { trackCash, setTrackCash } = useTrackCash()

    return (
        <Switch
            checked={trackCash}
            onCheckedChange={setTrackCash}
        />
    )
}

function ThemeButton({
    icon: Icon,
    label,
    isActive,
    onClick,
}: {
    icon: typeof Sun
    label: string
    isActive: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all min-w-[100px]',
                isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
        >
            <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
            <span className={cn('text-sm font-medium', isActive ? 'text-primary' : '')}>
                {label}
            </span>
        </button>
    )
}
