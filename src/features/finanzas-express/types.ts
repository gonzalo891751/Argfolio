/** Matches the localStorage 'budget_fintech' JSON shape exactly */

export interface UsdItem {
    id: string
    desc: string
    amount: number
}

export interface Payment {
    id: string
    amount: number
}

export interface Card {
    id: string
    name: string
    totalArs: number
    usdItems: UsdItem[]
    payments: Payment[]
    feeArsBase?: number
    feeVatRate?: number
    showFee?: boolean
}

export interface Service {
    id: string
    name: string
    amount: number
    discount?: number
    paid?: boolean
}

export interface PlannedExpense {
    id: string
    name: string
    amount: number
    paid?: boolean
}

export interface Income {
    id: string
    name: string
    amount: number
}

export interface LedgerEvent {
    type: 'pay_card' | 'pay_service' | 'pay_plan'
    cardId?: string
    itemId?: string
    amount: number
    snapshot?: Partial<Card>
    ts: number
}

export interface BudgetState {
    fxOficial: number
    fxCompra: number
    fxVenta: number
    fxLoading?: boolean
    cards: Card[]
    services: Service[]
    planned: PlannedExpense[]
    savings: number
    incomes: Income[]
    events: LedgerEvent[]
}
