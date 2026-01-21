import { Account, AccountKind } from '@/domain/types'

// -----------------------------------------------------------------------------
// Account Inference & Sorting
// -----------------------------------------------------------------------------

export const KNOWN_EXCHANGES = [
    'binance', 'bybit', 'okx', 'kraken', 'coinbase', 'bitso',
    'lemon', 'belo', 'buenbit', 'ripio', 'fiwind', 'satoshitango'
]

export const KNOWN_BROKERS = [
    'cocos', 'iol', 'balanz', 'bull market', 'bmb', 'allaria', 'ppi', 'portfolio personal'
]

export const KNOWN_WALLETS = [
    'efectivo', 'caja', 'colchon', 'fisico', 'billetera', 'mercadopago', 'mp'
]

/**
 * Infers the account kind based on its name if the explicit kind is generic or missing.
 */
export function inferAccountKind(name: string, currentKind: AccountKind): AccountKind {
    // If it's already specific, trust it (unless it's OTHER/BANK which might be default)
    if (currentKind !== 'BANK' && currentKind !== 'OTHER') return currentKind

    const n = name.toLowerCase()

    if (KNOWN_EXCHANGES.some(ex => n.includes(ex))) return 'EXCHANGE'
    if (KNOWN_BROKERS.some(br => n.includes(br))) return 'BROKER'
    if (KNOWN_WALLETS.some(w => n.includes(w))) return 'WALLET'

    return currentKind
}

interface ScoredAccount {
    account: Account
    score: number
}

/**
 * Sorts accounts based on the asset class context.
 * For CRYPTO: Exchanges > Brokers > Banks
 * For STOCK/CEDEAR: Brokers > Banks > Exchanges
 */
export function sortAccountsForAssetClass(accounts: Account[], assetClass: string): Account[] {
    const isCrypto = assetClass === 'crypto' || assetClass === 'stable'
    const isStock = assetClass === 'cedear' || assetClass === 'stock' || assetClass === 'fci'

    // Sort by Score (Higher is better)
    const scored: ScoredAccount[] = accounts.map(acc => {
        let score = 0
        const kind = inferAccountKind(acc.name, acc.kind)

        if (isCrypto) {
            if (kind === 'EXCHANGE') score = 3
            else if (kind === 'BROKER') score = 2 // Some brokers have crypto
            else if (kind === 'WALLET') score = 1
            else score = 0
        } else if (isStock) {
            if (kind === 'BROKER') score = 3
            else if (kind === 'BANK') score = 2 // Banks have FCIs/Stocks
            else score = 0
        } else {
            // Default (Currency/PF)
            if (kind === 'BANK') score = 2
            else if (kind === 'WALLET') score = 2
            else score = 1
        }

        // Secondary sort: Name alphabetical
        // We invert the score for sorting so 3 comes before 0
        return { account: acc, score }
    })

    return scored
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            return a.account.name.localeCompare(b.account.name)
        })
        .map(s => s.account)
}

// -----------------------------------------------------------------------------
// Price / Total Calculation Logic
// -----------------------------------------------------------------------------

export function calculateUnitPrice(total: number, quantity: number): number {
    if (!quantity || quantity === 0) return 0
    return total / quantity
}

export function calculateTotal(price: number, quantity: number): number {
    return price * quantity
}

export function sanitizeFloat(val: number | undefined): number {
    if (val === undefined || val === null || isNaN(val) || !isFinite(val)) return 0
    return val
}
