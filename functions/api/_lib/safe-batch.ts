export function isPromiseLike(value: unknown): boolean {
    return !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function'
}

export function isPreparedStatement(value: unknown): value is D1PreparedStatement {
    if (!value || typeof value !== 'object' || isPromiseLike(value)) return false
    const candidate = value as { bind?: unknown; run?: unknown; first?: unknown; all?: unknown }
    return typeof candidate.bind === 'function' &&
        typeof candidate.run === 'function' &&
        typeof candidate.first === 'function' &&
        typeof candidate.all === 'function'
}

export function filterBatchStatements(
    rawStatements: Array<D1PreparedStatement | null | undefined>
): D1PreparedStatement[] {
    return rawStatements
        .filter(Boolean)
        .filter((statement): statement is D1PreparedStatement => isPreparedStatement(statement))
}

export function getChunksCount(totalStatements: number, chunkSize = 50): number {
    if (totalStatements <= 0 || chunkSize <= 0) return 0
    return Math.ceil(totalStatements / chunkSize)
}

export async function safeBatch(
    db: D1Database,
    rawStatements: Array<D1PreparedStatement | null | undefined>,
    chunkSize = 50
): Promise<D1Result[]> {
    const safeChunkSize = chunkSize > 0 ? chunkSize : 50
    const statements = filterBatchStatements(rawStatements)
    if (statements.length === 0) {
        return []
    }

    const results: D1Result[] = []
    for (let index = 0; index < statements.length; index += safeChunkSize) {
        const chunk = statements.slice(index, index + safeChunkSize)
        if (chunk.length === 0) continue
        const batchResults = await db.batch(chunk)
        if (Array.isArray(batchResults) && batchResults.length > 0) {
            results.push(...batchResults)
        }
    }

    return results
}
