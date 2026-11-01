/**
 * Connect another device (e.g. the phone) to the same data.
 *
 * Every device needs the sync token to download the data from D1. The
 * connected device shows a link (and QR) that carries the token in the URL
 * fragment: browsers never send the fragment to the server, and the app
 * removes it from the address bar as soon as it reads it.
 */

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

export type ConnectResult = 'ok' | 'invalid' | 'offline'

/**
 * Save the token and download the data. A token the server rejects is not
 * kept, so a typo never leaves the device half connected.
 */
export async function connectDevice(token: string): Promise<ConnectResult> {
    const trimmed = token.trim()
    if (!trimmed) return 'invalid'
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
