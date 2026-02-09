import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@/domain/types'
import { normalizeSnapshot } from './snapshot-utils'

describe('snapshot-utils normalizeSnapshot', () => {
    it('keeps legacy snapshots readable by defaulting source=legacy', () => {
        const legacySnapshot = {
            id: 'snapshot-1',
            dateLocal: '2026-02-08',
            totalARS: 1000,
            totalUSD: 1,
            fxUsed: { usdArs: 1000, type: 'MEP' },
            createdAtISO: '2026-02-08T12:00:00.000Z',
        } as Snapshot

        const normalized = normalizeSnapshot(legacySnapshot)
        expect(normalized.source).toBe('legacy')
        expect(normalized.totalARS).toBe(1000)
    })

    it('preserves source=v2 for new snapshots', () => {
        const snapshotV2: Snapshot = {
            id: 'snapshot-v2-2026-02-09',
            dateLocal: '2026-02-09',
            totalARS: 2500,
            totalUSD: 2.1,
            fxUsed: { usdArs: 1190, type: 'MEP' },
            source: 'v2',
            createdAtISO: '2026-02-09T12:00:00.000Z',
        }

        const normalized = normalizeSnapshot(snapshotV2)
        expect(normalized.source).toBe('v2')
    })
})
