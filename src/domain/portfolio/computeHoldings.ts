import type { Movement, Instrument, Account, Holding } from '@/domain/types'





import { buildFifoLots } from './fifo'

/**
 * Compute holdings from movements using FIFO/PEPS method for cost basis.
 * Groups by instrument + account.
 */
export function computeHoldings(
    movements: Movement[],
    instruments: Map<string, Instrument>,
    accounts: Map<string, Account>
): Holding[] {
    // 1. Group movements by instrument+account
    const groups = new Map<string, Movement[]>()

    for (const mov of movements) {
        if (!mov.instrumentId) continue
        const key = `${mov.instrumentId}::${mov.accountId}`
        if (!groups.has(key)) {
            groups.set(key, [])
        }
        groups.get(key)!.push(mov)
    }

    const holdings: Holding[] = []

    // 2. Process each group with FIFO engine
    for (const [key, groupMovements] of groups.entries()) {
        const [instrumentId, accountId] = key.split('::')
        const instrument = instruments.get(instrumentId)
        const account = accounts.get(accountId)

        if (!instrument || !account) continue

        // Build FIFO lots for this group
        const result = buildFifoLots(groupMovements)

        if (result.totalQuantity <= 0.00000001) continue

        holdings.push({
            instrumentId,
            accountId,
            instrument,
            account,
            quantity: result.totalQuantity,
            costBasisNative: result.totalCostNative,
            costBasisArs: result.totalCostArs,
            costBasisUsd: result.totalCostUsd,
            // Averages
            avgCostNative: result.totalCostNative / result.totalQuantity,
            avgCostArs: result.totalCostArs / result.totalQuantity,
            avgCostUsd: result.totalCostUsd / result.totalQuantity,
            avgCostUsdEq: result.totalCostUsd / result.totalQuantity, // Same as avgCostUsd for FIFO
        })
    }

    return holdings
}

/**
 * Compute cash balances (ARS, USD, stablecoins) from movements.
 */
export function computeCashBalances(
    movements: Movement[]
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
