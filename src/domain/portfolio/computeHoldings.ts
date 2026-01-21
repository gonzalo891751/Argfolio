import type { Movement, Instrument, Account, Holding } from '@/domain/types'
import { computeAverageCost } from './average-cost'

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

        // Compute Position using Average Cost
        const result = computeAverageCost(groupMovements)

        if (result.quantity <= 0.00000001) continue

        // Resolve Native Basis based on Instrument
        let costBasisNative = 0
        let avgCostNative = 0

        const isArsNative = instrument.nativeCurrency === 'ARS'
        if (isArsNative) {
            costBasisNative = result.costBasisArs
            avgCostNative = result.avgCostArs
        } else {
            // Default to USD for Crypto/Stable/USD
            costBasisNative = result.costBasisUsd
            avgCostNative = result.avgCostUsd
        }

        holdings.push({
            instrumentId,
            accountId,
            instrument,
            account,
            quantity: result.quantity,
            costBasisNative,
            costBasisArs: result.costBasisArs,
            costBasisUsd: result.costBasisUsd,
            // Averages
            avgCostNative,
            avgCostArs: result.avgCostArs,
            avgCostUsd: result.avgCostUsd, // Raw USD Unit Cost
            avgCostUsdEq: result.avgCostUsd, // Historical USD Unit Cost (same as above for Average Cost method)
        })
    }

    return holdings
}
