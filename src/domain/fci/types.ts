/**
 * FCI Domain Types
 * Fondos Comunes de Inversión data structures
 */

export type FciCategory =
    | 'Money Market'
    | 'Renta Fija'
    | 'Renta Mixta'
    | 'Renta Variable'
    | 'Infraestructura'
    | 'Otros'

export type FciCurrency = 'ARS' | 'USD'

export type FciTerm = 'T+0' | 'T+1' | 'T+2' | 'T+3' | null

export interface FciFund {
    id: string
    name: string
    manager: string
    category: FciCategory
    currency: FciCurrency
    vcp: number
    vcpPer1000?: number // Raw value from source (per 1000 units)
    date: string // YYYY-MM-DD
    variation1d: number | null // decimal: 0.0123 => 1.23%
    term: FciTerm
    techSheetUrl: string | null
}

export interface FciFundResponse {
    asOf: string // ISO timestamp
    items: FciFund[]
}

/**
 * ArgentinaDatos raw response structure
 */
export interface ArgentinaDatosFciItem {
    fondo: string
    fecha: string
    vcp: number
    cpi?: number
    patrimonio?: number
    horizonte?: string
    // Some fields may vary by category
}
