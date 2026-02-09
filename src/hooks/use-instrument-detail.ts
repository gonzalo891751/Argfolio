import { useMemo } from 'react'
import { useMovements } from './use-movements'
import { useInstruments, useAccounts } from './use-instruments'
import { useFxRates } from './use-fx-rates'
import { useCryptoPrices } from './use-crypto-prices'
import { useManualPrices } from './use-manual-prices'
import { calculateValuation } from '@/domain/portfolio/valuation'
import type { Movement, Instrument } from '@/domain/types'
import { buildPriceCacheKey, resolvePriceWithCache } from '@/domain/prices/price-cache'
import { missingPrice, okPrice } from '@/domain/prices/price-result'

function getPriceTtlMs(category: string): number {
    switch (category) {
        case 'CRYPTO':
        case 'STABLE':
            return 60 * 60 * 1000
        case 'CEDEAR':
            return 12 * 60 * 60 * 1000
        case 'FCI':
            return 36 * 60 * 60 * 1000
        default:
            return 24 * 60 * 60 * 1000
    }
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
        avgCost: number // native
        avgCostArs: number
        avgCostUsd: number
        totalInvested: number // native
        totalInvestedArs: number
        totalInvestedUsd: number
        currentPrice: number
        currentValue: number // native
        currentValueArs: number
        currentValueUsd: number
        unrealizedPnL: number // native
        unrealizedPnLPercent: number
        realizedPnL: number
        unrealizedPnL_ARS: number
        unrealizedPnL_USD: number
    }
    accountBreakdown: Array<{
        accountId: string
        accountName: string
        quantity: number
        costBasis: number
    }>
    isLoading: boolean
}

export function useInstrumentDetail(instrumentId: string): InstrumentDetail | null {
    const { data: movements = [], isLoading: movementsLoading } = useMovements()
    const { data: instrumentsList = [], isLoading: instrumentsLoading } = useInstruments()
    const { data: accountsList = [], isLoading: accountsLoading } = useAccounts()
    const { data: fxRates } = useFxRates()
    const { priceMap: manualPrices } = useManualPrices()

    // Determine target instrument and symbol for crypto hooks
    const targetInstrument = instrumentsList.find(i => i.id === instrumentId)
    const cryptoSymbol = targetInstrument?.category === 'CRYPTO' || targetInstrument?.category === 'STABLE' ? targetInstrument.symbol : undefined

    // Always call hooks
    const { data: realCryptoPrices = {} } = useCryptoPrices(cryptoSymbol ? [cryptoSymbol] : [])

    const isLoading = movementsLoading || instrumentsLoading || accountsLoading

    return useMemo(() => {
        if (isLoading || !instrumentId || !fxRates) {
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

        // Resolve Price: manual/real feed, then last known cache (estimated/stale).
        let livePrice = missingPrice('missing')
        const now = Date.now()
        const nowISO = new Date(now).toISOString()

        if (manualPrices.has(instrumentId)) {
            livePrice = okPrice(manualPrices.get(instrumentId)!, 'manual', nowISO, 'high')
        } else if ((instrument.category === 'CRYPTO' || instrument.category === 'STABLE') && cryptoSymbol && typeof realCryptoPrices[cryptoSymbol] === 'number') {
            livePrice = okPrice(realCryptoPrices[cryptoSymbol], 'coingecko', null, 'high')
        }

        const resolvedPrice = resolvePriceWithCache(
            buildPriceCacheKey(instrument.category, instrumentId),
            livePrice,
            { ttlMs: getPriceTtlMs(instrument.category), now }
        )
        const currentPrice = resolvedPrice.price ?? 0

        const isCrypto = instrument.category === 'CRYPTO' || instrument.category === 'STABLE'

        // Compute holding using weighted average and Dual Cost Basis
        let totalQuantity = 0
        let totalCostBasis = 0
        let totalCostBasisArs = 0
        let totalCostBasisUsd = 0
        let realizedPnL = 0

        // Track per-account holdings
        const accountHoldings = new Map<string, { quantity: number; costBasis: number }>()

        for (const mov of sortedMovements) {
            const qty = mov.quantity ?? 0
            const price = mov.unitPrice ?? 0
            const accountId = mov.accountId

            // Native cost for this tx
            const txCostNative = qty * price

            // Dual Cost Calculation
            let txCostArs = 0
            let txCostUsd = 0

            if (mov.tradeCurrency === 'ARS') {
                txCostArs = txCostNative
                // Fallback fx: uses fxAtTrade if available. 
                // If not available, we need a rule. 
                // For CEDEARs (ARS), we divide by MEP.
                // For Crypto (ARS buys), use Cripto FX? Or MEP?
                // Prompt: "if buy in ARS: costARS stored. costUSD = costARS / fxAtTrade (use fx.cripto)" -> for crypto.
                // For CEDEAR: "Convert to USD using MEP".

                const mepRate = fxRates.mep.sell || fxRates.mep.buy || 0
                const cryptoRate = fxRates.cripto?.sell || fxRates.cripto?.buy || 0
                const fxToUse = mov.fxAtTrade || (isCrypto ? cryptoRate : mepRate)
                txCostUsd = fxToUse > 0 ? txCostArs / fxToUse : 0
            } else {
                // USD-like
                txCostUsd = txCostNative
                const mepRate = fxRates.mep.sell || fxRates.mep.buy || 0
                const cryptoRate = fxRates.cripto?.sell || fxRates.cripto?.buy || 0
                const fxToUse = mov.fxAtTrade || (isCrypto ? cryptoRate : mepRate)
                txCostArs = txCostUsd * fxToUse
            }

            if (!accountHoldings.has(accountId)) {
                accountHoldings.set(accountId, { quantity: 0, costBasis: 0 })
            }
            const accHolding = accountHoldings.get(accountId)!

            if (mov.type === 'BUY' || mov.type === 'TRANSFER_IN' || mov.type === 'DIVIDEND' || mov.type === 'INTEREST') {
                totalQuantity += qty
                totalCostBasis += txCostNative
                totalCostBasisArs += txCostArs
                totalCostBasisUsd += txCostUsd

                accHolding.quantity += qty
                accHolding.costBasis += txCostNative
            } else if (mov.type === 'SELL' || mov.type === 'TRANSFER_OUT') {
                if (totalQuantity > 0) {
                    const avgCost = totalCostBasis / totalQuantity
                    const avgCostArs = totalCostBasisArs / totalQuantity
                    const avgCostUsd = totalCostBasisUsd / totalQuantity

                    const soldQty = Math.min(qty, totalQuantity)
                    const proceeds = soldQty * price
                    // For realized PnL, we usually track in Native, but...
                    // Let's stick to native strictly for realizedPnL variable for now as per interface.
                    const cost = soldQty * avgCost

                    if (mov.type === 'SELL') {
                        realizedPnL += proceeds - cost
                    }

                    totalQuantity -= soldQty
                    totalCostBasis -= soldQty * avgCost
                    totalCostBasisArs -= soldQty * avgCostArs
                    totalCostBasisUsd -= soldQty * avgCostUsd

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
                totalCostBasisArs = 0
                totalCostBasisUsd = 0
            }
            if (accHolding.quantity < 0.00000001) {
                accHolding.quantity = 0
                accHolding.costBasis = 0
            }
        }

        const avgCost = totalQuantity > 0 ? totalCostBasis / totalQuantity : 0
        const avgCostArs = totalQuantity > 0 ? totalCostBasisArs / totalQuantity : 0
        const avgCostUsd = totalQuantity > 0 ? totalCostBasisUsd / totalQuantity : 0

        // Valuation
        // Use shared valuation logic
        const valuation = calculateValuation(
            totalQuantity,
            currentPrice,
            instrument.category,
            instrument.nativeCurrency,
            fxRates
        )
        const currentValueArs = valuation.valueArs ?? 0
        const currentValueUsd = valuation.valueUsd ?? 0
        // const calculatedCurrentValueNative = totalQuantity * currentPrice // Native value (keep for legacy consistency if needed)

        // Native PnL (Legacy support)
        const currentValue = totalQuantity * currentPrice
        const unrealizedPnL = currentValue - totalCostBasis
        const unrealizedPnLPercent = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0

        // Dual PnL
        const unrealizedPnL_ARS = currentValueArs - totalCostBasisArs
        const unrealizedPnL_USD = currentValueUsd - totalCostBasisUsd

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
                avgCostArs,
                avgCostUsd,
                totalInvested: totalCostBasis,
                totalInvestedArs: totalCostBasisArs,
                totalInvestedUsd: totalCostBasisUsd,
                currentPrice,
                currentValue,
                currentValueArs,
                currentValueUsd,
                unrealizedPnL,
                unrealizedPnLPercent,
                realizedPnL,
                unrealizedPnL_ARS,
                unrealizedPnL_USD
            },
            accountBreakdown,
            isLoading: false,
        }
    }, [instrumentId, movements, instrumentsList, accountsList, manualPrices, realCryptoPrices, fxRates, isLoading])
}

/**
 * Get holding quantity for a specific instrument (used for sell validation)
 */
export function useInstrumentHolding(instrumentId: string): number {
    const detail = useInstrumentDetail(instrumentId)
    return detail?.holdingSummary.totalQuantity ?? 0
}
