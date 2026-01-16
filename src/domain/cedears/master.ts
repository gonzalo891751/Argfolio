import comafiMaster from '@/data/cedears/comafi-master.json'

export interface CedearMasterItem {
    ticker: string
    name: string
    ratioText: string
    ratio: number
    market?: string
    underlyingType?: string
    country?: string
    industry?: string
    // Add other fields as needed from JSON
}

// Helper to parse ratioText "A:B" -> multiplier = B/A
// A = Cedears, B = Underlying
// Example: "20:1" -> 20 Cedears = 1 Underlying. Multiplier = 1/20 = 0.05.
// ARS Price = USD * FX * (1/20) = USD * FX / 20.
// So 'ratio' in JSON usually means 'A' (Cedears per 1 Underlying).
// If ratioText is "3:2" -> 3 Cedears = 2 Underlying. Multiplier = 2/3.
// ARS Price = USD * FX * (2/3).
// Current 'ratio' field in JSON seems to be just 'A' or the division result?
// Let's assume JSON 'ratio' corresponds to 'A' if B is 1.
// To be safe, let's parse ratioText.

function parseRatio(ratioText: string): number {
    if (!ratioText) return 1
    const parts = ratioText.split(':')
    if (parts.length === 2) {
        const a = parseFloat(parts[0])
        const b = parseFloat(parts[1])
        if (!isNaN(a) && !isNaN(b) && a !== 0) {
            // calculated ratio (multiplier) = B / A
            // But wait, the pricing formula in cedears-theoretical.ts is:
            // lastPriceArs = (quote.priceUsd * fxRate) / item.ratio
            // If item.ratio is 'A' (e.g. 20), this assumes B=1.
            // If ratio is 3:2, item.ratio would need to be 1.5 (A/B) for division? Or 0.66 (B/A) for multiplication?
            // (Usd * Fx) * (B/A) = (Usd * Fx) * (2/3)
            // (Usd * Fx) / (A/B) = (Usd * Fx) / (3/2) = (Usd * Fx) / 1.5
            // So 'ratio' property used in division should be A/B.
            return a / b
        }
    }
    // Fallback try parsing as single number
    const val = parseFloat(ratioText)
    return isNaN(val) ? 1 : val
}

// Cast and enhance
const CEDEARS = (comafiMaster as any[]).map(item => ({
    ...item,
    ratio: parseRatio(item.ratioText), // Ensure ratio is (A/B) for division logic: ARS = (USD*FX) / Ratio
})) as CedearMasterItem[]

// Sort by ticker for consistency
CEDEARS.sort((a, b) => a.ticker.localeCompare(b.ticker))

export function getCedearMaster(): CedearMasterItem[] {
    return CEDEARS
}

export function getCedearByTicker(ticker: string): CedearMasterItem | undefined {
    return CEDEARS.find(c => c.ticker === ticker.toUpperCase())
}

// Index for fast lookup
const CEDEAR_MAP = new Map<string, CedearMasterItem>()
CEDEARS.forEach(c => {
    CEDEAR_MAP.set(c.ticker.toUpperCase(), c)
})

export function getCedearMeta(ticker: string): CedearMasterItem | null {
    if (!ticker) return null
    return CEDEAR_MAP.get(ticker.toUpperCase()) || null
}

export function getCedearRatio(ticker: string): number | null {
    const meta = getCedearMeta(ticker)
    return meta ? meta.ratio : null
}

export function listCedears(): CedearMasterItem[] {
    return CEDEARS
}

/**
 * Heuristic to guess if a ticker is a CEDEAR based on master list.
 */
export function isKnownCedear(ticker: string): boolean {
    return CEDEAR_MAP.has(ticker.toUpperCase())
}
