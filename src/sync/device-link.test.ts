import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ token: 'old-token', bootstrap: { ok: true, offline: false } as { ok: boolean; offline: boolean; status?: number } }))

vi.mock('./remote-sync', () => ({
    getSyncToken: () => state.token,
    setSyncToken: (value: string) => { state.token = value.trim() },
    bootstrapRemoteSync: vi.fn(async () => state.bootstrap),
    isRemoteSyncEnabled: () => true,
}))

import { buildDeviceLink, connectDevice, readLinkToken } from './device-link'

describe('device link', () => {
    it('carries the token in the fragment and reads it back', () => {
        const link = buildDeviceLink('https://argfolio.pages.dev/', ' a+b/c=d ')
        expect(link).toBe('https://argfolio.pages.dev/inicio#vincular=a%2Bb%2Fc%3Dd')
        expect(readLinkToken(new URL(link).hash)).toBe('a+b/c=d')
    })

    it('ignores other fragments', () => {
        expect(readLinkToken('#pesos')).toBeNull()
        expect(readLinkToken('')).toBeNull()
        expect(readLinkToken('#vincular=')).toBeNull()
    })
})

describe('connectDevice', () => {
    beforeEach(() => { state.token = 'old-token' })

    it('keeps the token when the server accepts it', async () => {
        state.bootstrap = { ok: true, offline: false }
        expect(await connectDevice(' new-token ')).toBe('ok')
        expect(state.token).toBe('new-token')
    })

    it('restores the previous token when the server rejects it', async () => {
        state.bootstrap = { ok: false, offline: true, status: 401 }
        expect(await connectDevice('typo')).toBe('invalid')
        expect(state.token).toBe('old-token')
    })

    it('keeps the token when the network fails (it may be right)', async () => {
        state.bootstrap = { ok: false, offline: true }
        expect(await connectDevice('maybe')).toBe('offline')
        expect(state.token).toBe('maybe')
    })

    it('rejects an empty code without calling the server', async () => {
        expect(await connectDevice('   ')).toBe('invalid')
        expect(state.token).toBe('old-token')
    })
})
