/**
 * Favorites Storage Utility
 * Persists market favorites to localStorage with typed keys.
 */

export type AssetKind = 'cedears' | 'crypto' | 'fci'

const STORAGE_KEYS: Record<AssetKind, string> = {
    cedears: 'argfolio:favs:cedears',
    crypto: 'argfolio:favs:crypto',
    fci: 'argfolio:fci:favorites',
}

/**
 * Get favorites for a given asset kind.
 */
export function getFavorites(kind: AssetKind): Set<string> {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS[kind])
        if (!stored) return new Set()
        const parsed = JSON.parse(stored)
        return new Set(Array.isArray(parsed) ? parsed : [])
    } catch {
        return new Set()
    }
}

/**
 * Set favorites for a given asset kind.
 */
export function setFavorites(kind: AssetKind, ids: Set<string> | string[]): void {
    const arr = Array.isArray(ids) ? ids : [...ids]
    localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(arr))
}

/**
 * Toggle a favorite and persist. Returns the new state (true = now favorited).
 */
export function toggleFavorite(kind: AssetKind, id: string): boolean {
    const favorites = getFavorites(kind)
    const isFavorited = favorites.has(id)

    if (isFavorited) {
        favorites.delete(id)
    } else {
        favorites.add(id)
    }

    setFavorites(kind, favorites)
    return !isFavorited
}

/**
 * Check if an asset is favorited.
 */
export function isFavorite(kind: AssetKind, id: string): boolean {
    return getFavorites(kind).has(id)
}
