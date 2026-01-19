
import { Movement, FxRates } from '@/domain/types'
import { PFPosition } from './types'

export interface PFTotals {
    totalActiveARS: number
    totalActiveUSD: number
    totalMaturedARS: number
    totalMaturedUSD: number
}

export interface PFDerivedState {
    active: PFPosition[]
    matured: PFPosition[]
    closed: PFPosition[] // Rescued or paid
    totals: PFTotals
}

/**
 * Derives PF positions from raw movements.
 * 
 * Logic:
 * 1. Filter BUY movements (Constitutions).
 * 2. Filter SELL movements (Redemptions/Rescues).
 * 3. Match Redemptions to Constitutions (Heuristic: Bank + Date > Start).
 * 4. Categorize as Active, Matured, or Closed (Rescued).
 * 5. Calculate Valuations (ARS + Official USD).
 */
export function derivePFPositions(movements: Movement[] | undefined, fxRates: FxRates | undefined): PFDerivedState {
    const defaultState: PFDerivedState = {
        active: [],
        matured: [],
        closed: [],
        totals: { totalActiveARS: 0, totalActiveUSD: 0, totalMaturedARS: 0, totalMaturedUSD: 0 }
    }

    if (!movements) return defaultState

    const now = new Date()
    // Start of today (00:00) for comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // 1. Identify Constitutions (BUY) and Redemptions (SELL)
    const constitutions = movements.filter(m => m.assetClass === 'pf' && (m.type === 'BUY' || m.type === 'DEPOSIT')) // Usually BUY
    const redemptions = movements.filter(m => m.assetClass === 'pf' && (m.type === 'SELL' || m.type === 'WITHDRAW')) // Usually SELL

    // Official Exchange Rate (Current)
    // Use 'buy' for converting ARS assets to USD? Or 'sell'?
    // Usually to value assets in USD, we use the rate we could get (Sell ARS -> Buy USD). 
    // Wait, Dolar Blue Sell = Price to Buy USD. Dolar Blue Buy = Price to Sell USD.
    // If I have ARS and want USD, I divide by "Venta" (The asking price of the exchange).
    // Prompt says: "USD abajo usando tipo de cambio OFICIAL VENTA ACTUAL" -> fxRates.oficial.sell.
    const currentOfficialSell = fxRates?.oficial.sell || fxRates?.oficial.buy || 1

    // Helper to check if a constitution is redeemed
    const isRedeemed = (constituted: Movement): boolean => {
        // 0. Check explicit Stable ID linkage (New Robust Method)
        const exactMatch = redemptions.some(r => r.pf?.pfId === constituted.id)
        if (exactMatch) return true

        // Fallback: Heuristic (Legacy)
        // Look for a redemption that:
        // 1. Has same Bank (if recorded) or Alias
        // 2. Occurred AFTER start date
        // 3. (Optional) Quantity matching or Note matching? Keep it loose for now.
        return redemptions.some(r => {
            // Skip if this redemption is explicitly linked to ANOTHER PF (avoid false positives)
            if (r.pf?.pfId && r.pf.pfId !== constituted.id) return false

            const rDate = new Date(r.datetimeISO)
            const cDate = new Date(constituted.datetimeISO)

            // Basic checks
            if (rDate < cDate) return false // Impossible to redeem before creation

            // Match Bank
            if (constituted.bank && r.bank && constituted.bank !== r.bank) return false

            // If alias exists, try to match
            // if (constituted.alias && r.alias && constituted.alias !== r.alias) return false (Movement doesn't always have alias on redemption if user didn't enter it, so allow fuzzy)

            // This is a "probable" match. 
            // Since we don't have IDs, we assume any PF Sell "closes" a position if it fits.
            // But we need to avoid closing MULTIPLE positions with one sell if possible?
            // For now, simple Boolean check: if ANY redemption exists for this bank, it might be ambiguous.
            // Let's assume 1:1 is rare to overlap exactly. 
            // We'll proceed with "Is there a redemption for this bank after start date?".
            // Refinement: Maybe check if the redemption is "close" to maturity?
            // User requirement: "Si hoy >= vencimiento y NO existe un movimiento 'Rescatar/Cobro'".
            // This implies checks on redemptions.

            return true
        })
    }

    // Process Constitutions
    constitutions.forEach(m => {
        const startTs = m.startDate || m.datetimeISO
        const startDate = new Date(startTs)
        const termDays = m.termDays || 30
        const maturityDate = new Date(startDate.getTime() + (termDays * 24 * 60 * 60 * 1000))

        // Ensure strictly Date object comparison (ignore time components for maturity check?)
        // Usually maturity is at end of day or start? Let's assume start of maturity day.
        const maturityDay = new Date(maturityDate.getFullYear(), maturityDate.getMonth(), maturityDate.getDate())

        const principal = m.principalARS || m.quantity || 0
        const tna = m.tna || 0

        // Precise TEA Calculation
        // r_period = (tna/100) * (days/365)
        // TEA = (1 + r_period)^(365/days) - 1
        const ratePeriod = (tna / 100) * (termDays / 365)
        const tea = Math.pow(1 + ratePeriod, 365 / termDays) - 1

        // Interest Calc: Principal * (TNA/100) * (Days/365)
        // Standard convention TNA is 365.
        const interest = (principal * (tna / 100) * termDays) / 365
        const total = principal + interest

        const initialFx = m.fx?.rate || m.fxAtTrade || undefined

        const pos: PFPosition = {
            id: m.id, // Use Movement ID as Position ID
            movementId: m.id,
            accountId: m.accountId || 'unknown',
            bank: m.bank || 'Desconocido',
            alias: m.alias,
            principalARS: principal,
            termDays,
            tna,
            tea: tea * 100, // Normalized to %
            startTs: startDate.toISOString(),
            maturityTs: maturityDate.toISOString(),
            expectedInterestARS: interest,
            expectedTotalARS: total,
            status: 'active', // Default, updated below
            initialFx
        }

        // Determine Status
        // 1. Check if Redeemed
        // We need to be careful not to reuse redemptions? (complex). 
        // For simplified "Asset/PF" view, let's just check if *any* valid redemption exists.
        // If the user has 5 PFs at Galicia and 1 Redemption, strictly we don't know which one.
        // But usually people have 1 or 2.
        // Let's implement a greedy matcher outside this loop if we wanted perfect matching.
        // For now: Simple filter.
        if (isRedeemed(m)) {
            // It is closed.
            defaultState.closed.push({ ...pos, status: 'matured' }) // reused type 
            return
        }

        // 2. Check Maturity (Time)
        if (today >= maturityDay) {
            // Matured and NOT redeemed -> Liquidity
            defaultState.matured.push({ ...pos, status: 'matured' })
            defaultState.totals.totalMaturedARS += total
            defaultState.totals.totalMaturedUSD += (total / currentOfficialSell)
        } else {
            // Active
            defaultState.active.push({ ...pos, status: 'active' })
            defaultState.totals.totalActiveARS += total
            defaultState.totals.totalActiveUSD += (total / currentOfficialSell)
        }
    })

    return defaultState
}
