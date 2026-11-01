/**
 * Shown on an empty device that is not connected to the cloud: the data
 * probably lives on another device. Scan the QR from that device, or paste
 * the code.
 */

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { connectDevice, replaceLocalDataQuestion } from '@/sync/device-link'
import { invalidateSyncedData } from '@/hooks/use-remote-sync'

export function ConnectDeviceCard({ className }: { className?: string }) {
    const queryClient = useQueryClient()
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const onConnect = async () => {
        setError(null)
        setBusy(true)
        const result = await connectDevice(code, {
            confirmReplace: count => window.confirm(replaceLocalDataQuestion(count)),
        })
        setBusy(false)
        if (result === 'ok') {
            invalidateSyncedData(queryClient)
            return
        }
        if (result === 'declined') {
            setError('No se conectó: este dispositivo se queda con sus datos.')
            return
        }
        setError(result === 'invalid'
            ? 'Ese código no es correcto. Copialo de nuevo desde Configuración en tu otro dispositivo.'
            : 'No se pudo conectar. Revisá la conexión a internet y probá de nuevo.')
    }

    return (
        <section className={cn('space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6', className)}>
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Smartphone className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold">¿Ya usás Argfolio en otro dispositivo?</h2>
                    <p className="text-sm text-muted-foreground">
                        Tus datos están guardados en la nube, pero este dispositivo todavía no está conectado.
                    </p>
                </div>
            </div>

            <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>En la compu donde ya ves tus datos, abrí <span className="font-medium">Configuración → Usar en otro dispositivo</span>.</li>
                <li>Escaneá el código QR con la cámara de este celular. Listo.</li>
            </ol>

            <div className="space-y-2">
                <p className="text-sm text-muted-foreground">O pegá el código de sincronización:</p>
                <div className="flex gap-2">
                    <input
                        type="password"
                        autoComplete="off"
                        className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Código de sincronización"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                        aria-label="Código de sincronización"
                    />
                    <button
                        type="button"
                        onClick={onConnect}
                        disabled={busy || !code.trim()}
                        className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        Conectar
                    </button>
                </div>
                {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            </div>
        </section>
    )
}
