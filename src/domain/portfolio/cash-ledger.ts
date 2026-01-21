import type { Movement, Currency } from '@/domain/types'

export interface CashLedgerResult {
    balances: Map<string, Map<Currency, number>>
    openingBalances: Map<string, Map<Currency, number>>
}

interface CashDelta {
    currency: Currency
    amount: number
}

const EPSILON = 1e-8

function ensureAccountMap(
    map: Map<string, Map<Currency, number>>,
    accountId: string
): Map<Currency, number> {
    if (!map.has(accountId)) {
        map.set(accountId, new Map())
    }
    return map.get(accountId)!
}

function resolveTradeCurrency(mov: Movement): Currency {
    if (mov.tradeCurrency) return mov.tradeCurrency
    if (mov.fee?.currency) return mov.fee.currency
    if (mov.feeCurrency) return mov.feeCurrency
    if (mov.totalUSD && mov.totalUSD !== 0) return 'USD'
    return 'ARS'
}

function resolveFee(mov: Movement, fallbackCurrency: Currency): { amount: number; currency: Currency } | null {
    const rawAmount = mov.fee?.amount ?? mov.feeAmount
    if (rawAmount == null || !Number.isFinite(rawAmount) || rawAmount === 0) return null
    const amount = rawAmount
    const currency = mov.fee?.currency ?? mov.feeCurrency ?? fallbackCurrency
    return { amount, currency }
}

function resolveGrossAmount(mov: Movement, tradeCurrency: Currency): number {
    if (Number.isFinite(mov.totalAmount)) return mov.totalAmount
    if (Number.isFinite(mov.netAmount)) return mov.netAmount ?? 0
    const qty = mov.quantity ?? 0
    const price = mov.unitPrice ?? 0
    if (Number.isFinite(qty) && Number.isFinite(price) && qty !== 0 && price !== 0) {
        return qty * price
    }
    if (tradeCurrency === 'ARS' && Number.isFinite(mov.totalARS)) return mov.totalARS ?? 0
    if (tradeCurrency === 'USD' && Number.isFinite(mov.totalUSD)) return mov.totalUSD ?? 0
    return 0
}

function resolveNetAmount(mov: Movement, tradeCurrency: Currency, isBuySide: boolean): number {
    if (Number.isFinite(mov.netAmount)) return mov.netAmount ?? 0
    const gross = resolveGrossAmount(mov, tradeCurrency)
    const fee = resolveFee(mov, tradeCurrency)
    if (fee && fee.currency === tradeCurrency) {
        return isBuySide ? gross + fee.amount : gross - fee.amount
    }
    return gross
}

function resolveUsdQuantity(mov: Movement): number {
    if (Number.isFinite(mov.quantity)) return mov.quantity ?? 0
    if (Number.isFinite(mov.totalUSD)) return mov.totalUSD ?? 0
    return 0
}

function getMovementCashDeltas(mov: Movement): CashDelta[] {
    const deltas: CashDelta[] = []
    const tradeCurrency = resolveTradeCurrency(mov)

    const settlementMode = mov.meta?.fixedDeposit?.settlementMode
    const skipPfSellCash = mov.assetClass === 'pf' && mov.type === 'SELL' && settlementMode === 'manual'

    switch (mov.type) {
        case 'DEPOSIT': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'WITHDRAW': {
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'INTEREST':
        case 'DIVIDEND': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'FEE': {
            const fee = resolveFee(mov, tradeCurrency)
            const amount = fee?.amount ?? resolveNetAmount(mov, tradeCurrency, true)
            const currency = fee?.currency ?? tradeCurrency
            deltas.push({ currency, amount: -amount })
            break
        }
        case 'BUY': {
            if (skipPfSellCash) break
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'SELL': {
            if (skipPfSellCash) break
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'TRANSFER_IN':
        case 'DEBT_ADD': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'TRANSFER_OUT':
        case 'DEBT_PAY': {
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'BUY_USD': {
            const arsAmount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -arsAmount })
            const usdAmount = resolveUsdQuantity(mov)
            if (usdAmount !== 0) {
                deltas.push({ currency: 'USD', amount: usdAmount })
            }
            break
        }
        case 'SELL_USD': {
            const arsAmount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount: arsAmount })
            const usdAmount = resolveUsdQuantity(mov)
            if (usdAmount !== 0) {
                deltas.push({ currency: 'USD', amount: -usdAmount })
            }
            break
        }
    }

    const fee = resolveFee(mov, tradeCurrency)
    if (fee && fee.currency !== tradeCurrency) {
        deltas.push({ currency: fee.currency, amount: -fee.amount })
    }

    return deltas.filter(delta => Number.isFinite(delta.amount) && Math.abs(delta.amount) > EPSILON)
}

export function computeCashLedger(movements: Movement[]): CashLedgerResult {
    const balances = new Map<string, Map<Currency, number>>()
    const minBalances = new Map<string, Map<Currency, number>>()

    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    for (const mov of sorted) {
        const deltas = getMovementCashDeltas(mov)
        if (deltas.length === 0) continue

        for (const delta of deltas) {
            const accountBalances = ensureAccountMap(balances, mov.accountId)
            const current = accountBalances.get(delta.currency) ?? 0
            const next = current + delta.amount
            accountBalances.set(delta.currency, next)

            const accountMin = ensureAccountMap(minBalances, mov.accountId)
            const prevMin = accountMin.get(delta.currency)
            const nextMin = prevMin === undefined ? Math.min(0, next) : Math.min(prevMin, next)
            accountMin.set(delta.currency, nextMin)
        }
    }

    const openingBalances = new Map<string, Map<Currency, number>>()

    for (const [accountId, accountBalances] of balances) {
        for (const [currency, balance] of accountBalances) {
            const minBalance = minBalances.get(accountId)?.get(currency) ?? 0
            const opening = minBalance < 0 ? -minBalance : 0
            if (opening > 0) {
                const accountOpenings = ensureAccountMap(openingBalances, accountId)
                accountOpenings.set(currency, opening)
                accountBalances.set(currency, balance + opening)
            }
        }
    }

    return { balances, openingBalances }
}

export function computeCashBalances(movements: Movement[]): Map<string, Map<Currency, number>> {
    return computeCashLedger(movements).balances
}
