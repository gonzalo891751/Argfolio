export type PriceStatus = 'ok' | 'missing' | 'estimated' | 'stale'
export type PriceConfidence = 'high' | 'medium' | 'low'

export interface PriceResult {
    price: number | null
    status: PriceStatus
    source: string
    asOf: string | null
    confidence?: PriceConfidence
}

interface PriceResultInput {
    price?: number | null
    status?: PriceStatus
    source?: string
    asOf?: string | null
    confidence?: PriceConfidence
}

function isValidPositivePrice(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function normalizeAsOf(asOf?: string | null): string | null {
    if (!asOf) return null
    const parsed = Date.parse(asOf)
    if (!Number.isFinite(parsed)) return null
    return new Date(parsed).toISOString()
}

export function createPriceResult(input: PriceResultInput): PriceResult {
    const normalizedPrice = isValidPositivePrice(input.price) ? input.price : null
    const requestedStatus = input.status ?? (normalizedPrice != null ? 'ok' : 'missing')
    const normalizedStatus: PriceStatus = normalizedPrice != null ? requestedStatus : 'missing'

    return {
        price: normalizedPrice,
        status: normalizedStatus,
        source: input.source?.trim() || 'unknown',
        asOf: normalizeAsOf(input.asOf),
        confidence: input.confidence,
    }
}

export function okPrice(
    price: number,
    source: string,
    asOf?: string | null,
    confidence: PriceConfidence = 'high'
): PriceResult {
    return createPriceResult({
        price,
        status: 'ok',
        source,
        asOf,
        confidence,
    })
}

export function missingPrice(source = 'missing', asOf?: string | null): PriceResult {
    return createPriceResult({
        price: null,
        status: 'missing',
        source,
        asOf,
    })
}
