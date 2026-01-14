import { useQuery } from '@tanstack/react-query'
import { useMovements } from './use-movements'
import { useInstruments, useAccounts } from './use-instruments'
import { useFxRates } from './use-fx-rates'
import { useCryptoPrices } from './use-crypto-prices'
import {
    computeHoldings,
    computeCashBalances,
    computeRealizedPnL,
    computeTotals,
} from '@/domain/portfolio'
import type { PortfolioTotals, FxType } from '@/domain/types'

// Mock prices for Phase 2 (will be replaced with real API in Phase 3)
const mockPrices: Record<string, number> = {
    btc: 97500,
    eth: 3450,
    usdt: 1,
    usdc: 1,
    aapl: 178.50,
    googl: 141.80,
    meli: 1685,
    tsla: 248.50,
    msft: 378.90,
    ars: 1,
    usd: 1,
}

function getUserPreferences(): { baseFx: FxType; stableFx: FxType } {
    const stored = localStorage.getItem('argfolio-fx-preference')
    return {
        baseFx: (stored as FxType) || 'MEP',
        stableFx: 'CRIPTO',
    }
}

export function useComputedPortfolio() {
    const { data: movements = [] } = useMovements()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const { data: fxRates } = useFxRates()

    // Extract unique symbols for crypto fetching (Phase 3.2)
    const cryptoSymbols = Array.from(new Set(
        instrumentsList
            .filter(i => i.category === 'CRYPTO' || i.category === 'STABLE')
            .map(i => i.symbol)
    ))

    // Always fetch USDT/USDC to have defaults just in case
    if (!cryptoSymbols.includes('USDT')) cryptoSymbols.push('USDT')
    if (!cryptoSymbols.includes('USDC')) cryptoSymbols.push('USDC')

    const { data: cryptoPrices = {} } = useCryptoPrices(cryptoSymbols)

    return useQuery({
        queryKey: ['portfolio', 'computed', movements.length, instrumentsList.length, fxRates?.updatedAtISO, cryptoPrices],
        queryFn: (): PortfolioTotals | null => {
            if (!fxRates || instrumentsList.length === 0 || accountsList.length === 0) {
                return null
            }

            const instruments = new Map(instrumentsList.map((i) => [i.id, i]))
            const accounts = new Map(accountsList.map((a) => [a.id, a]))

            // Merge mock prices (stocks) with real crypto prices
            // Priority: Real Crypto > Mock
            const pricesMap = new Map<string, number>()

            // Add mocks first
            Object.entries(mockPrices).forEach(([k, v]) => pricesMap.set(k.toUpperCase(), v)) // Ensure mock keys are upper to match symbols

            // Add real crypto prices (using symbol as key, e.g. "BTC")
            // We need to map instrument ID to price? 
            // computeTotals expects currentPrices key to be instrumentId or symbol?
            // Checking computeTotals -> it uses aggregatedMap.get(h.instrumentId) -> const price = currentPrices.get(h.instrumentId)
            // Wait, computeHoldings uses instrumentId. 
            // So currentPrices map keys must be INSTRUMENT IDs.

            // Correction: We need to map Symbol Price -> Instrument ID Price
            // Iterate instruments, find price for its symbol, set in map.

            instrumentsList.forEach(instr => {
                const sym = instr.symbol.toUpperCase()

                // MOCKS (Direct symbol match in mockPrices keys)
                if (mockPrices[instr.symbol.toLowerCase()]) {  // mock keys are lower case in file
                    pricesMap.set(instr.id, mockPrices[instr.symbol.toLowerCase()])
                }

                // REAL CRYPTO
                const realPrice = cryptoPrices[sym]
                if (realPrice !== undefined && (instr.category === 'CRYPTO' || instr.category === 'STABLE')) {
                    pricesMap.set(instr.id, realPrice)
                }
            })

            const { baseFx, stableFx } = getUserPreferences()

            // Compute holdings
            const holdings = computeHoldings(movements, instruments, accounts)

            // Compute cash balances
            const cashBalances = computeCashBalances(movements, accounts)

            // Compute realized PnL
            const realizedPnLResult = computeRealizedPnL(movements, instruments, fxRates, baseFx)

            // Compute totals
            const totals = computeTotals({
                holdings,
                currentPrices: pricesMap,
                fxRates,
                baseFx,
                stableFx,
                cashBalances,
                realizedPnL: realizedPnLResult.totalNative,
            })

            return totals
        },
        enabled: !!fxRates && instrumentsList.length > 0 && accountsList.length > 0,
    })
}

export function useMockPrices() {
    return useQuery({
        queryKey: ['prices', 'mock'],
        queryFn: () => new Map(Object.entries(mockPrices)),
        staleTime: Infinity,
    })
}
