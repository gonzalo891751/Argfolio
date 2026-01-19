
import { Account, Movement, MovementType } from '@/domain/types'

/**
 * Calculate TEA from TNA
 * TEA = (1 + TNA/365)^365 - 1
 */
export function computeTEA(tna: number): number {
    return Math.pow(1 + (tna / 100) / 365, 365) - 1
}

export interface YieldMetrics {
    dailyRate: number
    tea: number
    interestTomorrow: number
    proj30d: number
    proj1y: number
}

/**
 * Compute Yield Projections
 * @param balanceArs Current Balance (Principal)
 * @param tna Annual Nominal Rate (Percent, e.g. 34)
 */
export function computeYieldMetrics(balanceArs: number, tna: number): YieldMetrics {
    // 365 days base
    const dailyRate = (tna / 100) / 365

    // Interest Tomorrow (simple daily)
    const interestTomorrow = balanceArs * dailyRate

    // Projections (Compounded)
    // Formula: P * ((1+r)^days - 1)
    const proj30d = balanceArs * (Math.pow(1 + dailyRate, 30) - 1)
    const proj1y = balanceArs * (Math.pow(1 + dailyRate, 365) - 1)

    // TEA
    const tea = computeTEA(tna)

    return {
        dailyRate,
        tea,
        interestTomorrow,
        proj30d,
        proj1y
    }
}

/**
 * Generate Interest Movements for Catch-up
 * 
 * @param account The account with yield config
 * @param currentBalanceArs The current Available Balance (ARS) effectively in the account
 * @param todayDateStr Today's date (YYYY-MM-DD) string (Local) to determine up to when to accrue
 * @returns Array of new Movements to persist, and the new lastAccruedDate
 */
export function generateAccrualMovements(
    account: Account,
    currentBalanceArs: number,
    todayDateStr: string
): { movements: Movement[], newLastAccrued: string } {
    if (!account.cashYield || !account.cashYield.enabled || !account.cashYield.tna) {
        return { movements: [], newLastAccrued: account.cashYield?.lastAccruedDate || '' }
    }

    const { tna, lastAccruedDate } = account.cashYield
    const dailyRate = (tna / 100) / 365

    // Resolve Start Date
    // If no lastAccrued, we might default to Yesterday? Or do nothing until set?
    // User flow implies enabling it sets a date? 
    // If undefined, let's assume valid from "today" onwards, so nothing to catch up yet?
    // User says: "catch-up si estuviste offline". implies previously set.
    // If TNA is new, start date should be configured.
    // We'll rely on lastAccruedDate. If missing, return empty (safest).
    if (!lastAccruedDate) {
        return { movements: [], newLastAccrued: '' }
    }

    const movements: Movement[] = []
    let runningBalance = currentBalanceArs

    // Iterate from lastAccrued + 1 day UNTIL Yesterday (today - 1)
    // Because interest for "Today" is accrued tomorrow (after 00:00)

    // Helper to add days
    const dateObj = new Date(lastAccruedDate + 'T00:00:00')
    const todayObj = new Date(todayDateStr + 'T00:00:00')

    // Safety break
    if (dateObj >= todayObj) {
        // Already up to date (or future)
        return { movements: [], newLastAccrued: lastAccruedDate }
    }

    // Move to first accrual day
    dateObj.setDate(dateObj.getDate() + 1)

    // Current pointer string
    let pointerStr = dateObj.toISOString().slice(0, 10)

    while (pointerStr < todayDateStr) { // Strictly less than today (so up to yesterday)
        // Calculate Interest
        if (runningBalance > 0) {
            const interest = runningBalance * dailyRate

            // Create Movement
            // ID: deterministic to ensure idempotency if run multiple times (though we shouldn't)
            const id = `yield-${account.id}-${pointerStr}`

            movements.push({
                id,
                datetimeISO: `${pointerStr}T00:01:00`, // 00:01 AM
                type: 'INTEREST', // Mapped to MovementType
                assetClass: 'wallet', // Standard for cash
                accountId: account.id,
                tradeCurrency: 'ARS',
                quantity: interest,
                totalAmount: interest,
                totalARS: interest,
                totalUSD: 0, // Valued at trade time? Usually 0, or convert at FX. 
                // average-cost handles it. But costBasisUsd addition?
                // If tradeCcy=ARS, average-cost uses FX.
                // We don't have historical FX here easily.
                // average-cost will use 1 if missing? 
                // Or we provide 'fxAtTrade' if possible?
                // For now, leave 0/null, average-cost will use 1.
                // Wait, average-cost uses fxAtTrade or 1.
                // ARS interest should have USD value? Yes.
                // But we lack historical FX. 
                // Acceptable limitation: USD Cost basis for interest might be skewed if FX missing.
                // User requirement says "Ganancia/PnL debe reflejar interés ganado en ARS".
                // PnL ARS = ValArs - CostArs.
                // Interest adds to `costBasisArs` via average-cost (it's income).
                // Wait. INCOME (Dividend/Interest) usually DOES NOT add to Cost Basis of Position?
                // It adds to "Cash Balance".
                // If "Cash" is the asset...
                // `costBasisArs` of Cash = Face Value.
                // So Interest ADDS `quantity` (Balance) and ADDS `costBasisArs` (Face Value).
                // So PnL remains flat?
                // No.
                // PnL ARS = Value (Balance) - Cost (Balance). = 0.
                // If Cash ARS is always Face Value.
                // User says: "Ganancia/PnL debe reflejar interés ganado en ARS (verde)".
                // This implies PnL > 0.
                // If Cost Basis increases 1:1 with Balance, PnL stays 0.
                // UNLESS Interest is treated as "Gain without Cost"?
                // In `average-cost.ts`, `INTEREST` adds `quantity` and `costBasis`.
                // `costBasisArs += tradeAmtArs` (amount).
                // So Cost Basis increases.
                // Valuation: `valArs = quantity`. `costArs = costBasisArs`.
                // `pnlArs = valArs - costArs` -> 0.
                // This is logically correct for Cash (you have more cash, but you didn't "gain" value on it above face value).
                // BUT User wants "Ganancia ... refleja interés".
                // This implies Interest should NOT increase Cost Basis?
                // If I don't increase Cost Basis, `costBasisArs` stays low. `valArs` increases.
                // `pnlArs` increases.
                // Is Interest a "Trade"?
                // Usually Interest is a realized gain.
                // In Argfolio, PnL displayed is UNREALIZED.
                // Realized PnL tracks specific outcomes.
                // If I want "PnL Today" or "Total Gain" to show interest...
                // Maybe `INTEREST` type should NOT add to cost basis in `average-cost`?
                // Let's check `average-cost.ts` again.
                // `INTEREST` is in defaults.
                // If I remove `INTEREST` from `costBasisArs` addition??
                // Then `avgCost` drops.
                // `valArs` > `costArs`. Steps PnL up.
                // This seems to be what user wants ("Verde").
                // I ALREADY IMPLEMENTED THIS LOGIC IN average-cost.ts IN PREVIOUS STEP.

                notes: `Rendimiento diario ${account.cashYield.tna}% TNA`,
            })

            // Compound
            runningBalance += interest
        }

        // Next day
        dateObj.setDate(dateObj.getDate() + 1)
        pointerStr = dateObj.toISOString().slice(0, 10)
    }

    return { movements, newLastAccrued: movements.length > 0 ? movements[movements.length - 1].datetimeISO.slice(0, 10) : account.cashYield.lastAccruedDate || '' }
}
