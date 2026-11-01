/**
 * Connect another device (e.g. the phone) to the same data.
 *
 * Every device needs the sync token to download the data from D1. The
 * connected device shows a link (and QR) that carries the token in the URL
 * fragment: browsers never send the fragment to the server, and the app
 * removes it from the address bar as soon as it reads it.
 */

import { db } from '@/db/schema'
import { bootstrapRemoteSync, getSyncToken, isRemoteSyncEnabled, setSyncToken } from './remote-sync'

const PARAM = 'vincular'

/** Sync is on but this device has no token: its data lives on another device. */
export function needsDeviceConnection(): boolean {
    return isRemoteSyncEnabled() && getSyncToken().length === 0
}

export function buildDeviceLink(origin: string, token: string): string {
    return `${origin.replace(/\/$/, '')}/inicio#${PARAM}=${encodeURIComponent(token.trim())}`
}

/** Token carried by a device link, or null. */
export function readLinkToken(hash: string): string | null {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash
    const value = new URLSearchParams(raw).get(PARAM)?.trim()
    return value ? value : null
}

/** Remove the token from the address bar (and from this history entry). */
export function stripLinkFromUrl(): void {
    if (typeof window === 'undefined') return
    const { pathname, search } = window.location
    window.history.replaceState(window.history.state, '', `${pathname}${search}`)
}

/**
 * - ok: token accepted and the data downloaded
 * - saved: token saved, nothing downloaded (keepTokenOnDecline)
 * - declined: nothing changed; this device keeps its own data and stays unconnected
 * - invalid: the server rejected the token (the previous one is restored)
 * - offline: could not reach the server (the token is kept)
 */
export type ConnectResult = 'ok' | 'saved' | 'declined' | 'invalid' | 'offline'

export interface ConnectOptions {
    /**
     * Downloading replaces this device's data with the cloud's. When the
     * device already has movements, it only happens if this answers true.
     */
    confirmReplace?: (localMovements: number) => boolean | Promise<boolean>
    /**
     * Keep the token when the replacement is declined (Configuración: the user
     * is setting up sync to upload this device's data). Otherwise nothing is
     * saved, because with a token the next app start downloads anyway.
     */
    keepTokenOnDecline?: boolean
    /** For tests */
    countLocalMovements?: () => Promise<number>
}

/**
 * Save the token and download the data. A token the server rejects is not
 * kept, so a typo never leaves the device half connected, and data that only
 * lives on this device is never replaced without asking. The token is stored
 * only after that answer.
 */
export async function connectDevice(token: string, options: ConnectOptions = {}): Promise<ConnectResult> {
    const trimmed = token.trim()
    if (!trimmed) return 'invalid'

    const localMovements = await (options.countLocalMovements ?? (() => db.movements.count()))()
    if (localMovements > 0) {
        const replace = options.confirmReplace ? await options.confirmReplace(localMovements) : false
        if (!replace) {
            if (!options.keepTokenOnDecline) return 'declined'
            setSyncToken(trimmed)
            return 'saved'
        }
    }

    const previous = getSyncToken()
    setSyncToken(trimmed)
    const result = await bootstrapRemoteSync(true, { quiet: true })
    if (result.ok) return 'ok'
    if (result.status === 401) {
        setSyncToken(previous)
        return 'invalid'
    }
    return 'offline'
}

/** Text for the confirm dialog shown before replacing this device's data. */
export function replaceLocalDataQuestion(localMovements: number): string {
    return `Este dispositivo ya tiene ${localMovements} movimientos guardados.\n\n`
        + '¿Reemplazarlos por los datos de la nube?\n\n'
        + 'Cancelar: este dispositivo se queda con sus datos.'
}
