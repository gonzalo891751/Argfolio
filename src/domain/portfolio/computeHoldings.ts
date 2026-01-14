import type { Movement, Instrument, Account, Holding } from '@/domain/types'

interface HoldingKey {
    instrumentId: string
    accountId: string
}

interface HoldingAccumulator {
    quantity: number
    costBasisNative: number
}

/**
 * Compute holdings from movements using weighted average cost method.
 * Groups by instrument + account.
 */
export function computeHoldings(
    movements: Movement[],
    instruments: Map<string, Instrument>,
    accounts: Map<string, Account>
): Holding[] {
    // Sort movements by datetime ascending
    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    // Accumulate holdings per instrument+account
    const holdingsMap = new Map<string, HoldingAccumulator>()

    for (const mov of sorted) {
        if (!mov.instrumentId) continue // Skip pure cash movements

        const key = `${mov.instrumentId}::${mov.accountId}`

        if (!holdingsMap.has(key)) {
            holdingsMap.set(key, { quantity: 0, costBasisNative: 0 })
        }

        const holding = holdingsMap.get(key)!
        const qty = mov.quantity ?? 0
        const price = mov.unitPrice ?? 0

        switch (mov.type) {
            case 'BUY':
            case 'TRANSFER_IN':
            case 'DIVIDEND':
            case 'INTEREST':
                // Add to position
                holding.quantity += qty
                holding.costBasisNative += qty * price
                break

            case 'SELL':
            case 'TRANSFER_OUT':
                // Reduce position proportionally (weighted average)
                if (holding.quantity > 0) {
                    const avgCost = holding.costBasisNative / holding.quantity
                    const reduceQty = Math.min(qty, holding.quantity)
                    holding.quantity -= reduceQty
                    holding.costBasisNative -= reduceQty * avgCost
                }
                break

            case 'FEE':
                // Fees reduce cost basis (increase effective cost)
                // Or we can track separately - for now, ignore in holdings
                break
        }

        // Prevent negative quantities from rounding errors
        if (holding.quantity < 0.00000001) {
            holding.quantity = 0
            holding.costBasisNative = 0
        }
    }

    // Convert to Holding objects
    const holdings: Holding[] = []

    for (const [key, acc] of holdingsMap.entries()) {
        if (acc.quantity <= 0) continue

        const [instrumentId, accountId] = key.split('::')
        const instrument = instruments.get(instrumentId)
        const account = accounts.get(accountId)

        if (!instrument || !account) continue

        holdings.push({
            instrumentId,
            accountId,
            instrument,
            account,
            quantity: acc.quantity,
            costBasisNative: acc.costBasisNative,
            avgCostNative: acc.costBasisNative / acc.quantity,
        })
    }

    return holdings
}

/**
 * Compute cash balances (ARS, USD, stablecoins) from movements.
 */
export function computeCashBalances(
    movements: Movement[],
    accounts: Map<string, Account>
): Map<string, Map<string, number>> {
    // Map<accountId, Map<currency, balance>>
    const balances = new Map<string, Map<string, number>>()

    const sorted = [...movements].sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    for (const mov of sorted) {
        if (!balances.has(mov.accountId)) {
            balances.set(mov.accountId, new Map())
        }

        const accountBalances = balances.get(mov.accountId)!
        const currency = mov.tradeCurrency
        const current = accountBalances.get(currency) ?? 0

        switch (mov.type) {
            case 'DEPOSIT':
                accountBalances.set(currency, current + mov.totalAmount)
                break

            case 'WITHDRAW':
                accountBalances.set(currency, current - mov.totalAmount)
                break

            case 'BUY':
                // Deduct cash when buying
                accountBalances.set(currency, current - mov.totalAmount)
                break

            case 'SELL':
                // Add cash when selling
                accountBalances.set(currency, current + mov.totalAmount)
                break

            case 'FEE':
                const feeCurrency = mov.feeCurrency ?? currency
                const feeBalance = accountBalances.get(feeCurrency) ?? 0
                accountBalances.set(feeCurrency, feeBalance - (mov.feeAmount ?? 0))
                break

            case 'DIVIDEND':
            case 'INTEREST':
                accountBalances.set(currency, current + mov.totalAmount)
                break
        }
    }

    return balances
}
