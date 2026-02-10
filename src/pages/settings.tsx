import { useRef, useState, type ChangeEvent } from 'react'
import { Sun, Moon, Monitor, RefreshCw, DollarSign, AlertTriangle, RotateCcw, Download, Upload, Cloud } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { useAutoRefresh } from '@/hooks/use-auto-refresh'
import { resetDatabase } from '@/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { useTrackCash } from '@/hooks/use-preferences'
import { exportLocalBackup, importLocalBackup, parseBackupJson } from '@/domain/sync/local-backup'
import { getSyncToken, isRemoteSyncEnabled, setSyncToken } from '@/sync/remote-sync'

type FxPreference = 'MEP' | 'CCL'

interface SyncPushResponse {
    ok: boolean
    counts: {
        accounts: number
        movements: number
        instruments: number
        snapshots?: number
    }
    ignored?: string[]
    durationMs?: number
}

interface ApiErrorBody {
    error?: string
    details?: unknown
    hint?: string
}

export function SettingsPage() {
    const { theme, setTheme } = useTheme()
    const { isAutoRefreshEnabled, setAutoRefreshEnabled } = useAutoRefresh()
    const queryClient = useQueryClient()

    const [fxPreference, setFxPreference] = useState<FxPreference>(() => {
        return (localStorage.getItem('argfolio-fx-preference') as FxPreference) || 'MEP'
    })
    const [isResetting, setIsResetting] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isPushingToCloud, setIsPushingToCloud] = useState(false)
    const [syncTokenInput, setSyncTokenInput] = useState(() => getSyncToken())
    const importInputRef = useRef<HTMLInputElement | null>(null)

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

    const handleExportBackup = async () => {
        setIsExporting(true)
        try {
            const payload = await exportLocalBackup()
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const date = new Date().toISOString().slice(0, 10)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `argfolio-backup-${date}.json`
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            URL.revokeObjectURL(url)
            alert('Backup exportado correctamente')
        } catch (error) {
            console.error('Error exporting backup:', error)
            alert('No se pudo exportar el backup')
        } finally {
            setIsExporting(false)
        }
    }

    const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setIsImporting(true)
        try {
            const text = await file.text()
            const payload = parseBackupJson(text)
            const result = await importLocalBackup(payload)

            queryClient.invalidateQueries({ queryKey: ['accounts'] })
            queryClient.invalidateQueries({ queryKey: ['instruments'] })
            queryClient.invalidateQueries({ queryKey: ['movements'] })
            queryClient.invalidateQueries({ queryKey: ['snapshots'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio'] })

            alert(
                `Importación completada.\n` +
                `Cuentas: ${result.accounts}\n` +
                `Instrumentos: ${result.instruments}\n` +
                `Movimientos: ${result.movements}\n` +
                `Snapshots: ${result.snapshots}`
            )
        } catch (error: any) {
            console.error('Error importing backup:', error)
            alert(error?.message || 'No se pudo importar el backup')
        } finally {
            event.target.value = ''
            setIsImporting(false)
        }
    }

    const handleSaveSyncToken = () => {
        setSyncToken(syncTokenInput)
        const hasToken = syncTokenInput.trim().length > 0
        alert(hasToken ? 'Token de Sync guardado.' : 'Token de Sync eliminado.')
    }

    const handlePushAllToD1 = async () => {
        setIsPushingToCloud(true)
        try {
            const syncToken = getSyncToken()
            if (!syncToken) {
                alert('Falta Token de Sync. Configuralo en Settings antes de subir a D1.')
                return
            }

            const payload = await exportLocalBackup()

            const response = await fetch('/api/sync/push', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${syncToken}`,
                },
                body: JSON.stringify(payload),
            })

            const rawBody = await response.text()
            let parsedBody: ApiErrorBody | SyncPushResponse | null = null
            const bodyText = rawBody.trim().length > 0 ? rawBody.slice(0, 2000) : '(empty body)'
            if (rawBody.trim().length > 0) {
                try {
                    parsedBody = JSON.parse(rawBody) as ApiErrorBody | SyncPushResponse
                } catch {
                    parsedBody = null
                }
            }

            if (!response.ok) {
                if (response.status === 401) {
                    const body = parsedBody as ApiErrorBody | null
                    const detailsValue = body?.details == null
                        ? ''
                        : typeof body.details === 'string'
                            ? body.details
                            : JSON.stringify(body.details)
                    const detailsText = detailsValue.length > 0 ? `\nDetails: ${detailsValue}` : ''
                    alert(
                        'No autorizado (HTTP 401).\n' +
                        'Token de Sync faltante o invalido. Revisalo en Settings.\n' +
                        detailsText +
                        `\nBody: ${bodyText}`
                    )
                    return
                }

                if (response.status === 403) {
                    const body = parsedBody as ApiErrorBody | null
                    const errorText = typeof body?.error === 'string' ? body.error : 'Forbidden'
                    const detailsValue = body?.details == null
                        ? ''
                        : typeof body.details === 'string'
                            ? body.details
                            : JSON.stringify(body.details)
                    const detailsText = detailsValue.length > 0 ? `\nDetails: ${detailsValue}` : ''
                    const hintText = typeof body?.hint === 'string'
                        ? `\nHint: ${body.hint}`
                        : '\nHint: Write gate OFF: set ARGFOLIO_SYNC_WRITE_ENABLED=1 y redeploy.'
                    alert(
                        `No se pudo subir a D1 (HTTP 403).\n` +
                        'Write gate OFF: set ARGFOLIO_SYNC_WRITE_ENABLED=1 y redeploy.\n' +
                        `Error: ${errorText}` +
                        detailsText +
                        hintText +
                        `\nBody: ${bodyText}`
                    )
                    return
                }

                const body = parsedBody as ApiErrorBody | null
                const errorText = typeof body?.error === 'string' ? body.error : 'unknown_error'
                const detailsValue = body?.details == null
                    ? ''
                    : typeof body.details === 'string'
                        ? body.details
                        : JSON.stringify(body.details)
                const detailsText = detailsValue.length > 0 ? `\nDetails: ${detailsValue}` : ''
                const hintText = typeof body?.hint === 'string' ? `\nHint: ${body.hint}` : ''
                alert(
                    `No se pudo subir a D1 (HTTP ${response.status}).\n` +
                    `Error: ${errorText}` +
                    detailsText +
                    hintText +
                    `\nBody: ${bodyText}`
                )
                return
            }

            const result = parsedBody as SyncPushResponse | null
            if (!result?.counts) {
                alert('Subida completada, pero la API no devolvió conteos.')
                return
            }

            const ignoredText = Array.isArray(result.ignored) && result.ignored.length > 0
                ? `\nIgnorado: ${result.ignored.join(', ')}`
                : ''

            alert(
                `Subida completada a D1.\n` +
                `Cuentas: ${result.counts.accounts}\n` +
                `Movimientos: ${result.counts.movements}\n` +
                `Instrumentos: ${result.counts.instruments}` +
                (typeof result.counts.snapshots === 'number' ? `\nSnapshots: ${result.counts.snapshots}` : '') +
                (typeof result.durationMs === 'number' ? `\nDuracion: ${result.durationMs}ms` : '') +
                ignoredText
            )
        } catch (error) {
            console.error('Error pushing backup to D1:', error)
            alert('No se pudo subir a D1 por un error de red. Los datos locales siguen intactos.')
        } finally {
            setIsPushingToCloud(false)
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

            {/* Backup + Sync */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        Backup y sincronización
                    </CardTitle>
                    <CardDescription>
                        Exportá/Importá tus datos locales y controlá el estado del sync remoto.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                        <p className="text-sm font-medium">
                            Sync remoto: {isRemoteSyncEnabled() ? 'Activado' : 'Desactivado'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Flag: `VITE_ARGFOLIO_REMOTE_SYNC=1` para bootstrap desde API + escritura remota con fallback local.
                        </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2">
                        <p className="text-sm font-medium">Token de Sync</p>
                        <p className="text-xs text-muted-foreground">
                            Se envÃ­a como `Authorization: Bearer &lt;token&gt;` en `/api/sync/*`.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Input
                                type="password"
                                value={syncTokenInput}
                                onChange={(event) => setSyncTokenInput(event.target.value)}
                                placeholder="PegÃ¡ ARGFOLIO_SYNC_TOKEN"
                                className="min-w-[240px] flex-1"
                            />
                            <Button
                                variant="outline"
                                onClick={handleSaveSyncToken}
                                disabled={isPushingToCloud}
                            >
                                Guardar token
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            onClick={handleExportBackup}
                            disabled={isExporting}
                        >
                            <Download className={cn('h-4 w-4 mr-2', isExporting && 'animate-pulse')} />
                            {isExporting ? 'Exportando...' : 'Exportar JSON'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => importInputRef.current?.click()}
                            disabled={isImporting}
                        >
                            <Upload className={cn('h-4 w-4 mr-2', isImporting && 'animate-pulse')} />
                            {isImporting ? 'Importando...' : 'Importar JSON'}
                        </Button>
                    </div>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={handleImportBackup}
                    />
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2">
                        <p className="text-sm font-medium">Sync a la nube (D1)</p>
                        <p className="text-xs text-muted-foreground">
                            Empuja todo el backup local a D1 en una sola operacion.
                            Requiere `ARGFOLIO_SYNC_WRITE_ENABLED=1`.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Nota: localhost y producción no comparten IndexedDB/origin. Si en producción aparece vacío,
                            exportá JSON en localhost e importalo acá antes de subir a D1.
                        </p>
                        <Button
                            variant="default"
                            onClick={handlePushAllToD1}
                            disabled={isPushingToCloud || isExporting || isImporting}
                        >
                            <Cloud className={cn('h-4 w-4 mr-2', isPushingToCloud && 'animate-spin')} />
                            {isPushingToCloud ? 'Subiendo todo...' : 'Subir todo a D1'}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Importación en modo merge seguro: upsert por `id` (sin duplicar).
                    </p>
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
