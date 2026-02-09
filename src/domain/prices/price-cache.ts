import { createPriceResult, type PriceResult } from './price-result'

const PRICE_CACHE_KEY = 'argfolio.priceCache.v1'

interface PriceCacheEntry {
    price: number
    source: string
    asOf: string | null
    cachedAtISO: string
    confidence?: 'high' | 'medium' | 'low'
}

type PriceCacheStore = Record<string, PriceCacheEntry>

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

function canUseStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStore(): PriceCacheStore {
    if (!canUseStorage()) return {}

    try {
        const raw = window.localStorage.getItem(PRICE_CACHE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        return parsed as PriceCacheStore
    } catch {
        return {}
    }
}

function writeStore(store: PriceCacheStore): void {
    if (!canUseStorage()) return
    try {
        window.localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(store))
    } catch {
        // Ignore storage quota errors to avoid blocking valuation.
    }
}

function isValidPrice(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function buildPriceCacheKey(category: string, instrumentId: string): string {
    return `${category}:${instrumentId}`.toUpperCase()
}

export function setLastKnownPrice(cacheKey: string, result: PriceResult, now = Date.now()): void {
    if (!cacheKey || result.status !== 'ok' || !isValidPrice(result.price)) return

    const store = readStore()
    store[cacheKey] = {
        price: result.price,
        source: result.source,
        asOf: result.asOf,
        cachedAtISO: new Date(now).toISOString(),
        confidence: result.confidence,
    }
    writeStore(store)
}

export function getLastKnownPrice(cacheKey: string, ttlMs = DEFAULT_TTL_MS, now = Date.now()): PriceResult | null {
    if (!cacheKey) return null

    const store = readStore()
    const entry = store[cacheKey]
    if (!entry || !isValidPrice(entry.price)) return null

    const cachedAt = Date.parse(entry.cachedAtISO)
    const isStale = !Number.isFinite(cachedAt) || (now - cachedAt > ttlMs)

    return createPriceResult({
        price: entry.price,
        status: isStale ? 'stale' : 'estimated',
        source: entry.source || 'last_known',
        asOf: entry.asOf,
        confidence: isStale ? 'low' : entry.confidence ?? 'medium',
    })
}

export function resolvePriceWithCache(
    cacheKey: string,
    liveResult: PriceResult,
    options?: { ttlMs?: number; now?: number }
): PriceResult {
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
    const now = options?.now ?? Date.now()

    if (liveResult.status === 'ok' && isValidPrice(liveResult.price)) {
        setLastKnownPrice(cacheKey, liveResult, now)
        return liveResult
    }

    const cached = getLastKnownPrice(cacheKey, ttlMs, now)
    if (cached) return cached
    return liveResult
}

