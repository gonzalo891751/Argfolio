import { useQuery } from '@tanstack/react-query'
import { useMovements } from './use-movements'
import { useInstruments, useAccounts } from './use-instruments'
import { useFxRates } from './use-fx-rates'
import { useCryptoPrices } from './use-crypto-prices'
import { useManualPrices } from './use-manual-prices'
import { useCedearPrices } from './use-cedear-prices'
import { useFciPrices } from './useFciPrices'
import {
    computeHoldings,
    computeCashLedger,
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

function normalizeFciNameKey(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
}

function getUserPreferences(): { baseFx: FxType; stableFx: FxType; cedearAuto: boolean; trackCash: boolean } {
    const storedFx = localStorage.getItem('argfolio-fx-preference')
    const storedCedear = localStorage.getItem('argfolio-settings-cedear-auto')
    const storedTrackCash = localStorage.getItem('argfolio.trackCash')

    return {
        baseFx: (storedFx as FxType) || 'MEP',
        stableFx: 'CRIPTO',
        cedearAuto: storedCedear !== 'false', // Default ON
        trackCash: storedTrackCash === 'true', // Default OFF
    }
}

export function useComputedPortfolio() {
    const { data: movements = [] } = useMovements()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const { data: fxRates } = useFxRates()
    const { priceMap: manualPrices } = useManualPrices()

    const { cedearAuto, trackCash } = getUserPreferences()

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
    const { data: cedearPrices = {} } = useCedearPrices(cedearAuto)

    // Fetch FCI Prices
    const { priceMap: fciPrices } = useFciPrices()

    return useQuery({
        queryKey: ['portfolio', 'computed', movements.length, instrumentsList.length, fxRates?.updatedAtISO, cryptoPrices, cedearPrices, manualPrices, fciPrices, cedearAuto, trackCash],
        queryFn: (): PortfolioTotals | null => {
            if (!fxRates || instrumentsList.length === 0 || accountsList.length === 0) {
                return null
            }

            const instruments = new Map(instrumentsList.map((i) => [i.id, i]))
            const accounts = new Map(accountsList.map((a) => [a.id, a]))

            // Merge mock prices (stocks) with real crypto prices
            // Priority: Manual > Auto CEDEAR > Real Crypto > Mock
            const pricesMap = new Map<string, number>()

            // Add mocks first
            Object.entries(mockPrices).forEach(([k, v]) => pricesMap.set(k.toUpperCase(), v)) // Ensure mock keys are upper to match symbols

            // Add real crypto prices (using symbol as key, e.g. "BTC")
            // We need to map instrument ID to price? 
            // computeTotals expects currentPrices key to be instrumentId or symbol?
            // Checking computeTotals -> it uses aggregatedMap.get(h.instrumentId) -> const price = currentPrices.get(h.instrumentId)
            // Wait, computeHoldings uses instrumentId. 
            // So currentPrices map keys must be INSTRUMENT IDs.

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

                // AUTO CEDEAR (PPI)
                // Only if enabled and category is CEDEAR
                if (cedearAuto && instr.category === 'CEDEAR') {
                    const cedearPrice = cedearPrices[sym] // keys are tickers in CEDEAR map
                    if (cedearPrice) {
                        pricesMap.set(instr.id, cedearPrice.lastPriceArs)
                    }
                }

                // MANUAL PRICES (CEDEARs, Stocks)
                // Overrides everything if present
                if (manualPrices.has(instr.id)) {
                    pricesMap.set(instr.id, manualPrices.get(instr.id)!)
                }
            })

            // Add FCI Prices
            if (fciPrices && fciPrices.size > 0) {
                // Build index by (normalized name + currency) to handle legacy/imported instrumentIds
                // that don't match the current `generateFciSlug()` scheme.
                const byNameCurrency = new Map<string, number>()
                for (const p of fciPrices.values()) {
                    if (!p?.vcp || p.vcp <= 0) continue
                    const key = `${normalizeFciNameKey(p.name)}|${p.currency}`
                    if (!byNameCurrency.has(key)) byNameCurrency.set(key, p.vcp)
                }

                // Attach FCI prices to actual instrument IDs (computeTotals expects instrumentId keys).
                for (const instr of instrumentsList) {
                    if (instr.category !== 'FCI') continue

                    let vcp: number | null = null

                    // 1) Exact match (new scheme)
                    const direct = fciPrices.get(instr.id)
                    if (direct?.vcp && direct.vcp > 0) vcp = direct.vcp

                    // 2) Name+currency match (legacy/import instruments)
                    if (!vcp) {
                        const cur = instr.nativeCurrency === 'USD' ? 'USD' : 'ARS'
                        const key = `${normalizeFciNameKey(instr.name)}|${cur}`
                        vcp = byNameCurrency.get(key) ?? null
                    }

                    // 3) If instrumentId looks like "fci:manager|name|curr", try parsing name segment
                    if (!vcp && instr.id.startsWith('fci:') && instr.id.includes('|')) {
                        const parts = instr.id.split('|')
                        if (parts.length >= 2) {
                            const rawName = parts[1].replace(/-/g, ' ')
                            const cur = (parts[2] || '').toUpperCase() === 'USD' ? 'USD' : 'ARS'
                            const key = `${normalizeFciNameKey(rawName)}|${cur}`
                            vcp = byNameCurrency.get(key) ?? null
                        }
                    }

                    if (vcp && vcp > 0) {
                        pricesMap.set(instr.id, vcp)
                    }
                }
            }

            // Build price changes map (Phase 2.1)
            // Gather changePct from providers
            const priceChangesMap = new Map<string, number>()
            instrumentsList.forEach(instr => {
                const sym = instr.symbol.toUpperCase()

                // CEDEARS
                if (instr.category === 'CEDEAR' && cedearPrices[sym]) {
                    const change = (cedearPrices[sym] as any).changePct
                    if (typeof change === 'number') {
                        priceChangesMap.set(instr.id, change)
                    }
                }
            })

            // Add FCI Changes
            if (fciPrices && fciPrices.size > 0) {
                const byNameCurrencyChange = new Map<string, number>()
                for (const p of fciPrices.values()) {
                    if (typeof p.changePct !== 'number' || !Number.isFinite(p.changePct)) continue
                    const key = `${normalizeFciNameKey(p.name)}|${p.currency}`
                    if (!byNameCurrencyChange.has(key)) byNameCurrencyChange.set(key, p.changePct)
                }

                for (const instr of instrumentsList) {
                    if (instr.category !== 'FCI') continue

                    let changePct: number | null = null

                    const direct = fciPrices.get(instr.id)
                    if (typeof direct?.changePct === 'number' && Number.isFinite(direct.changePct)) {
                        changePct = direct.changePct
                    }

                    if (changePct == null) {
                        const cur = instr.nativeCurrency === 'USD' ? 'USD' : 'ARS'
                        const key = `${normalizeFciNameKey(instr.name)}|${cur}`
                        changePct = byNameCurrencyChange.get(key) ?? null
                    }

                    if (changePct == null && instr.id.startsWith('fci:') && instr.id.includes('|')) {
                        const parts = instr.id.split('|')
                        if (parts.length >= 2) {
                            const rawName = parts[1].replace(/-/g, ' ')
                            const cur = (parts[2] || '').toUpperCase() === 'USD' ? 'USD' : 'ARS'
                            const key = `${normalizeFciNameKey(rawName)}|${cur}`
                            changePct = byNameCurrencyChange.get(key) ?? null
                        }
                    }

                    if (changePct != null) {
                        priceChangesMap.set(instr.id, changePct)
                    }
                }
            }

            const { baseFx, stableFx } = getUserPreferences()

            // Compute holdings
            const holdings = computeHoldings(movements, instruments, accounts)

            // Compute cash balances (only if tracking cash is enabled)
            const trackCash = getUserPreferences().trackCash
            const cashLedger = trackCash ? computeCashLedger(movements) : { balances: new Map(), openingBalances: new Map() }

            // Compute realized PnL
            const realizedPnLResult = computeRealizedPnL(movements, fxRates, baseFx)

            // Compute totals
            const totals = computeTotals({
                holdings,
                currentPrices: pricesMap,
                priceChanges: priceChangesMap,
                fxRates,
                baseFx,
                stableFx,
                cashBalances: cashLedger.balances,
                openingBalances: cashLedger.openingBalances,
                accountsById: accounts,
                realizedPnLArs: realizedPnLResult.realizedArs,
                realizedPnLUsd: realizedPnLResult.realizedUsd,
                realizedPnLByAccount: realizedPnLResult.byAccount,
            })

            return totals
        },
        enabled: !!fxRates && instrumentsList.length > 0 && accountsList.length > 0,
        // Prevent UI flicker (and scroll reset) when queryKey changes due to FX/price refresh.
        // We keep the previous computed snapshot until the new one is ready.
        placeholderData: (prev) => prev,
    })
}

export function useMockPrices() {
    return useQuery({
        queryKey: ['prices', 'mock'],
        queryFn: () => new Map(Object.entries(mockPrices)),
        staleTime: Infinity,
    })
}
