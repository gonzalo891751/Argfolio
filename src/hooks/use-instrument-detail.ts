import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMovements } from './use-movements'
import { useInstruments, useAccounts } from './use-instruments'
import { useFxRates } from './use-fx-rates'
import { useMockPrices } from './use-computed-portfolio'
import type { Movement, Instrument, Account, FxType } from '@/domain/types'

// Mock prices lookup by instrument ID
const priceKeyMap: Record<string, string> = {
    btc: 'btc',
    eth: 'eth',
    usdt: 'usdt',
    usdc: 'usdc',
    aapl: 'aapl',
    googl: 'googl',
    meli: 'meli',
    tsla: 'tsla',
    msft: 'msft',
}

export interface BuyLot {
    movementId: string
    date: string
    accountId: string
    accountName: string
    quantity: number
    unitPrice: number
    totalPaid: number
    tradeCurrency: string
    fxAtTrade?: number
    currentValue: number
    lotPnL: number
    lotPnLPercent: number
}

export interface InstrumentDetail {
    instrument: Instrument
    movements: Movement[]
    buyMovements: Movement[]
    sellMovements: Movement[]
    buyLots: BuyLot[]
    holdingSummary: {
        totalQuantity: number
        avgCost: number
        totalInvested: number
        currentPrice: number
        currentValue: number
        unrealizedPnL: number
        unrealizedPnLPercent: number
        realizedPnL: number
    }
    accountBreakdown: Array<{
        accountId: string
        accountName: string
        quantity: number
        costBasis: number
    }>
    isLoading: boolean
}

function getUserPreferences(): { baseFx: FxType; stableFx: FxType } {
    const stored = localStorage.getItem('argfolio-fx-preference')
    return {
        baseFx: (stored as FxType) || 'MEP',
        stableFx: 'CRIPTO',
    }
}

export function useInstrumentDetail(instrumentId: string): InstrumentDetail | null {
    const { data: movements = [], isLoading: movementsLoading } = useMovements()
    const { data: instrumentsList = [], isLoading: instrumentsLoading } = useInstruments()
    const { data: accountsList = [], isLoading: accountsLoading } = useAccounts()
    const { data: fxRates } = useFxRates()
    const { data: pricesMap } = useMockPrices()

    const isLoading = movementsLoading || instrumentsLoading || accountsLoading

    return useMemo(() => {
        if (isLoading || !instrumentId) {
            return null
        }

        const instrument = instrumentsList.find((i) => i.id === instrumentId)
        if (!instrument) {
            return null
        }

        const accountsMap = new Map(accountsList.map((a) => [a.id, a]))

        // Filter movements for this instrument
        const instrumentMovements = movements.filter((m) => m.instrumentId === instrumentId)
        const sortedMovements = [...instrumentMovements].sort(
            (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
        )

        const buyMovements = sortedMovements.filter((m) => m.type === 'BUY' || m.type === 'TRANSFER_IN')
        const sellMovements = sortedMovements.filter((m) => m.type === 'SELL')

        // Get current price
        const priceKey = priceKeyMap[instrumentId] || instrumentId
        const currentPrice = pricesMap?.get(priceKey) ?? 0

        // Compute holding using weighted average
        let totalQuantity = 0
        let totalCostBasis = 0
        let realizedPnL = 0

        // Track per-account holdings
        const accountHoldings = new Map<string, { quantity: number; costBasis: number }>()

        for (const mov of sortedMovements) {
            const qty = mov.quantity ?? 0
            const price = mov.unitPrice ?? 0
            const accountId = mov.accountId

            if (!accountHoldings.has(accountId)) {
                accountHoldings.set(accountId, { quantity: 0, costBasis: 0 })
            }
            const accHolding = accountHoldings.get(accountId)!

            if (mov.type === 'BUY' || mov.type === 'TRANSFER_IN' || mov.type === 'DIVIDEND' || mov.type === 'INTEREST') {
                totalQuantity += qty
                totalCostBasis += qty * price
                accHolding.quantity += qty
                accHolding.costBasis += qty * price
            } else if (mov.type === 'SELL' || mov.type === 'TRANSFER_OUT') {
                if (totalQuantity > 0) {
                    const avgCost = totalCostBasis / totalQuantity
                    const soldQty = Math.min(qty, totalQuantity)
                    const proceeds = soldQty * price
                    const cost = soldQty * avgCost

                    realizedPnL += proceeds - cost

                    totalQuantity -= soldQty
                    totalCostBasis -= soldQty * avgCost

                    // Update account holding
                    if (accHolding.quantity > 0) {
                        const accAvgCost = accHolding.costBasis / accHolding.quantity
                        const accSoldQty = Math.min(qty, accHolding.quantity)
                        accHolding.quantity -= accSoldQty
                        accHolding.costBasis -= accSoldQty * accAvgCost
                    }
                }
            }

            // Prevent negative quantities
            if (totalQuantity < 0.00000001) {
                totalQuantity = 0
                totalCostBasis = 0
            }
            if (accHolding.quantity < 0.00000001) {
                accHolding.quantity = 0
                accHolding.costBasis = 0
            }
        }

        const avgCost = totalQuantity > 0 ? totalCostBasis / totalQuantity : 0
        const currentValue = totalQuantity * currentPrice
        const unrealizedPnL = currentValue - totalCostBasis
        const unrealizedPnLPercent = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0

        // Build buy lots with per-lot PnL
        const buyLots: BuyLot[] = buyMovements.map((mov) => {
            const qty = mov.quantity ?? 0
            const unitPrice = mov.unitPrice ?? 0
            const totalPaid = mov.totalAmount
            const lotCurrentValue = qty * currentPrice
            const lotPnL = lotCurrentValue - totalPaid
            const lotPnLPercent = totalPaid > 0 ? (lotPnL / totalPaid) * 100 : 0
            const account = accountsMap.get(mov.accountId)

            return {
                movementId: mov.id,
                date: mov.datetimeISO,
                accountId: mov.accountId,
                accountName: account?.name ?? 'Unknown',
                quantity: qty,
                unitPrice,
                totalPaid,
                tradeCurrency: mov.tradeCurrency,
                fxAtTrade: mov.fxAtTrade,
                currentValue: lotCurrentValue,
                lotPnL,
                lotPnLPercent,
            }
        })

        // Account breakdown
        const accountBreakdown = Array.from(accountHoldings.entries())
            .filter(([, h]) => h.quantity > 0)
            .map(([accountId, h]) => ({
                accountId,
                accountName: accountsMap.get(accountId)?.name ?? 'Unknown',
                quantity: h.quantity,
                costBasis: h.costBasis,
            }))

        return {
            instrument,
            movements: instrumentMovements,
            buyMovements,
            sellMovements,
            buyLots,
            holdingSummary: {
                totalQuantity,
                avgCost,
                totalInvested: totalCostBasis,
                currentPrice,
                currentValue,
                unrealizedPnL,
                unrealizedPnLPercent,
                realizedPnL,
            },
            accountBreakdown,
            isLoading: false,
        }
    }, [instrumentId, movements, instrumentsList, accountsList, pricesMap, isLoading])
}

/**
 * Get holding quantity for a specific instrument (used for sell validation)
 */
export function useInstrumentHolding(instrumentId: string): number {
    const detail = useInstrumentDetail(instrumentId)
    return detail?.holdingSummary.totalQuantity ?? 0
}
