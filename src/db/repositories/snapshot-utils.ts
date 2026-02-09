import type { Snapshot } from '@/domain/types'

export function normalizeSnapshot(snapshot: Snapshot): Snapshot {
    return {
        ...snapshot,
        source: snapshot.source ?? 'legacy',
    }
}
