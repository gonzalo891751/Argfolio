/**
 * "Usar en otro dispositivo": a QR and a link that connect a phone (or another
 * computer) to the same data. Only on a device that is already connected.
 */

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, QrCode, Smartphone } from 'lucide-react'
import { getSyncToken, isRemoteSyncEnabled } from '@/sync/remote-sync'
import { buildDeviceLink } from '@/sync/device-link'

export function OtherDeviceCard() {
    const [token] = useState(() => getSyncToken())
    const [show, setShow] = useState(false)
    const [qr, setQr] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const link = token ? buildDeviceLink(window.location.origin, token) : ''

    useEffect(() => {
        if (!show || !link) return
        let cancelled = false
        QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
            .then(url => { if (!cancelled) setQr(url) })
            .catch(() => { if (!cancelled) setQr(null) })
        return () => { cancelled = true }
    }, [show, link])

    if (!isRemoteSyncEnabled()) return null

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(false)
        }
    }

    return (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Smartphone className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold">Usar en otro dispositivo</h2>
                    <p className="text-sm text-muted-foreground">
                        Conectá tu celular u otra compu para ver los mismos datos.
                    </p>
                </div>
            </div>

            {!token ? (
                <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                    Este dispositivo todavía no está conectado a la nube. Cargá el token de sync más abajo (Sync remoto) para poder conectar otros.
                </p>
            ) : !show ? (
                <button
                    type="button"
                    onClick={() => setShow(true)}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                    <QrCode className="h-4 w-4" /> Mostrar código QR
                </button>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                        <div className="rounded-xl bg-white p-2">
                            {qr ? <img src={qr} alt="Código QR para conectar otro dispositivo" className="h-48 w-48" /> : <div className="h-48 w-48 animate-pulse rounded bg-muted" />}
                        </div>
                        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                            <li>Abrí la cámara del celular y apuntá al código.</li>
                            <li>Tocá el enlace que aparece: se abre Argfolio y baja tus datos.</li>
                            <li>Si no tenés cámara a mano, copiá el enlace y abrilo en el otro dispositivo.</li>
                        </ol>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={onCopy} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
                            {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
                            {copied ? 'Copiado' : 'Copiar enlace'}
                        </button>
                        <button type="button" onClick={() => { setShow(false); setQr(null) }} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                            Ocultar
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        El enlace da acceso a tus datos: no lo compartas ni lo publiques.
                    </p>
                </div>
            )}
        </section>
    )
}
