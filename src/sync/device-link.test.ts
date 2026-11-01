import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ token: 'old-token', bootstrap: { ok: true, offline: false } as { ok: boolean; offline: boolean; status?: number } }))

vi.mock('./remote-sync', () => ({
    getSyncToken: () => state.token,
    setSyncToken: (value: string) => { state.token = value.trim() },
    bootstrapRemoteSync: vi.fn(async () => state.bootstrap),
    isRemoteSyncEnabled: () => true,
}))
vi.mock('@/db/schema', () => ({ db: { movements: { count: async () => 0 } } }))

import { buildDeviceLink, connectDevice, readLinkToken } from './device-link'
import { bootstrapRemoteSync } from './remote-sync'

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
    beforeEach(() => {
        state.token = 'old-token'
        vi.mocked(bootstrapRemoteSync).mockClear()
    })

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

describe('connectDevice with data only on this device', () => {
    const withLocal = (count: number, answer?: boolean, keepTokenOnDecline?: boolean) => ({
        countLocalMovements: async () => count,
        keepTokenOnDecline,
        ...(answer === undefined ? {} : { confirmReplace: vi.fn(() => answer) }),
    })

    beforeEach(() => {
        state.token = ''
        state.bootstrap = { ok: true, offline: false }
        vi.mocked(bootstrapRemoteSync).mockClear()
    })

    it('never replaces it without asking, and stays unconnected', async () => {
        expect(await connectDevice('tok', withLocal(12))).toBe('declined')
        expect(bootstrapRemoteSync).not.toHaveBeenCalled()
        expect(state.token).toBe('')
    })

    it('keeps it when the answer is no (no token saved: the next start would download)', async () => {
        const options = withLocal(12, false)
        expect(await connectDevice('tok', options)).toBe('declined')
        expect(options.confirmReplace).toHaveBeenCalledWith(12)
        expect(bootstrapRemoteSync).not.toHaveBeenCalled()
        expect(state.token).toBe('')
    })

    it('saves only the token when asked to (Configuración, to upload this device)', async () => {
        expect(await connectDevice('tok', withLocal(12, false, true))).toBe('saved')
        expect(bootstrapRemoteSync).not.toHaveBeenCalled()
        expect(state.token).toBe('tok')
    })

    it('downloads when the answer is yes', async () => {
        expect(await connectDevice('tok', withLocal(12, true))).toBe('ok')
        expect(bootstrapRemoteSync).toHaveBeenCalledTimes(1)
        expect(state.token).toBe('tok')
    })

    it('does not ask on an empty device', async () => {
        const options = withLocal(0, false)
        expect(await connectDevice('tok', options)).toBe('ok')
        expect(options.confirmReplace).not.toHaveBeenCalled()
    })
})
