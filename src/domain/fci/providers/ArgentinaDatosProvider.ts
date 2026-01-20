/**
 * FCI Provider — ArgentinaDatos
 * 
 * Fetches FCI data from api.argentinadatos.com and normalizes it
 * to our internal FciFund format.
 */

import type { FciFund, FciCategory, FciCurrency, FciTerm, ArgentinaDatosFciItem } from '../types'

// Category mapping from API endpoints
const CATEGORY_ENDPOINTS: { endpoint: string; category: FciCategory; term: FciTerm }[] = [
    { endpoint: 'mercadoDinero', category: 'Money Market', term: 'T+0' },
    { endpoint: 'rentaFija', category: 'Renta Fija', term: 'T+1' },
    { endpoint: 'rentaMixta', category: 'Renta Mixta', term: 'T+2' },
    { endpoint: 'rentaVariable', category: 'Renta Variable', term: 'T+2' },
    { endpoint: 'otros', category: 'Otros', term: 'T+3' },
]

const BASE_URL = 'https://api.argentinadatos.com/v1/finanzas/fci'

/**
 * Generate deterministic ID from fund properties
 */
function generateFundId(name: string, manager: string, currency: FciCurrency, category: FciCategory): string {
    const slug = `${name}-${manager}-${currency}-${category}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    return slug.slice(0, 64)
}

/**
 * Parse fund name to extract manager and clean name
 * ArgentinaDatos format: "FONDO NOMBRE - GESTORA" or similar patterns
 */
function parseFundName(rawName: string): { name: string; manager: string } {
    // Common patterns:
    // "Alpha Ahorro Pesos - Clase A" -> try to extract gestora from known patterns
    // "GALILEO RENTA FIJA PLUS" -> Manager might be "GALILEO"

    // Simple heuristic: first word is often the manager
    const parts = rawName.trim().split(/\s+/)
    if (parts.length === 0) {
        return { name: rawName, manager: 'Desconocido' }
    }

    // Common Argentine fund managers to detect
    const knownManagers = [
        'GALICIA', 'SANTANDER', 'BBVA', 'BALANZ', 'CONSULTATIO', 'SCHRODER',
        'FIMA', 'SUPERVIELLE', 'INDUSTRIAL', 'DELTA', 'MACRO', 'ADCAP',
        'BULL', 'COMPASS', 'GALILEO', 'ALPHA', 'TORONTO', 'SBS', 'MEGAINVER',
        'PELLEGRINI', 'ALLARIA', 'PREMIER', 'PIMCO', 'BACS', 'QUINQUELA',
        'MBI', 'AXIS', 'ICBC', 'COHEN', 'PIRAMIDE', 'PATAGONIA', 'FIRST',
        'LOMBARD', 'RIO', 'PUENTE', 'MAX', 'GAINVEST', 'RAVA'
    ]

    const firstWord = parts[0].toUpperCase()
    const manager = knownManagers.find(m => firstWord.includes(m)) || parts[0]

    return {
        name: rawName.trim(),
        manager: manager.charAt(0).toUpperCase() + manager.slice(1).toLowerCase()
    }
}

/**
 * Detect currency from fund name
 * USD funds usually have "DOLAR", "USD", "DOLLAR" in name
 */
function detectCurrency(name: string): FciCurrency {
    const upper = name.toUpperCase()
    if (upper.includes('DOLAR') || upper.includes('USD') || upper.includes('DOLLAR')) {
        return 'USD'
    }
    return 'ARS'
}

/**
 * Fetch a single category from ArgentinaDatos
 */
async function fetchCategoryData(
    endpoint: string,
    category: FciCategory,
    term: FciTerm
): Promise<FciFund[]> {
    try {
        const url = `${BASE_URL}/${endpoint}/ultimo`
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Argfolio/1.0'
            }
        })

        if (!response.ok) {
            console.warn(`FCI fetch failed for ${endpoint}: ${response.status}`)
            return []
        }

        const data: ArgentinaDatosFciItem[] = await response.json()

        if (!Array.isArray(data)) {
            console.warn(`FCI data not array for ${endpoint}`)
            return []
        }

        return data.map((item, idx) => {
            const { name, manager } = parseFundName(item.fondo)
            const currency = detectCurrency(item.fondo)

            // ArgentinaDatos provides VCP per 1000 shares (CAFCI convention)
            // We normalize to Unit VCP for display consistency
            const rawVcp = Number(item.vcp ?? 0)
            const vcpUnit = rawVcp / 1000

            // Debug log once to verify scaling
            if (idx === 0 && endpoint === 'rentaMixta') {
                console.debug(`[FCI] Normalizing VCP: raw=${rawVcp} (per 1000) -> unit=${vcpUnit}`)
            }

            return {
                id: generateFundId(name, manager, currency, category),
                name,
                manager,
                category,
                currency,
                vcp: vcpUnit || 0, // Avoid NaN
                vcpPer1000: rawVcp,
                date: item.fecha ?? new Date().toISOString().split('T')[0],
                variation1d: null, // ArgentinaDatos ultimo endpoint doesn't provide variation
                term,
                techSheetUrl: null
            }
        })
    } catch (error) {
        console.error(`Error fetching FCI category ${endpoint}:`, error)
        return []
    }
}

/**
 * Fetch all FCI data from ArgentinaDatos
 */
export async function fetchAllFci(): Promise<{ asOf: string; items: FciFund[] }> {
    // Fetch all categories in parallel
    const results = await Promise.all(
        CATEGORY_ENDPOINTS.map(({ endpoint, category, term }) =>
            fetchCategoryData(endpoint, category, term)
        )
    )

    // Flatten all results
    const items = results.flat()

    return {
        asOf: new Date().toISOString(),
        items
    }
}
