export interface PFPosition {
    id: string
    bank: string
    alias?: string
    principalARS: number
    termDays: number
    tna: number
    tea: number
    startTs: string // ISO date
    maturityTs: string // ISO date
    expectedInterestARS: number
    expectedTotalARS: number
    status: 'active' | 'matured'
    movementId: string // Link to the creation movement
    initialFx?: number // Historical FX at constitution
}

export type BankSuggestion = {
    id: string
    name: string
}

export const BANK_SUGGESTIONS: BankSuggestion[] = [
    { id: 'bna', name: 'Banco Nación' },
    { id: 'galicia', name: 'Galicia' },
    { id: 'macro', name: 'Macro' },
    { id: 'santander', name: 'Santander' },
    { id: 'bbva', name: 'BBVA' },
    { id: 'ciudad', name: 'Banco Ciudad' },
    { id: 'provincia', name: 'Banco Provincia' },
    { id: 'brubank', name: 'Brubank' },
    { id: 'uala', name: 'Ualá' },
    { id: 'mp', name: 'MercadoPago' },
    { id: 'nx', name: 'Naranja X' },
    { id: 'reba', name: 'Reba' },
    { id: 'delsol', name: 'Banco del Sol' },
    { id: 'hipotecario', name: 'Hipotecario' },
    { id: 'icbc', name: 'ICBC' },
    { id: 'hsbc', name: 'HSBC' },
    { id: 'patagonia', name: 'Banco Patagonia' },
    { id: 'supervielle', name: 'Supervielle' },
    { id: 'nx', name: 'Naranja X' },
    { id: 'frascos', name: 'Frascos (Naranja X)' },
]
