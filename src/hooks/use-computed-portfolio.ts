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
import { buildPriceCacheKey, resolvePriceWithCache } from '@/domain/prices/price-cache'
import { missingPrice, okPrice } from '@/domain/prices/price-result'

function normalizeFciNameKey(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ')
}

function getPriceTtlMs(category: string): number {
    switch (category) {
        case 'CRYPTO':
        case 'STABLE':
            return 60 * 60 * 1000 // 1h
        case 'CEDEAR':
            return 12 * 60 * 60 * 1000 // 12h
        case 'FCI':
            return 36 * 60 * 60 * 1000 // 36h
        default:
            return 24 * 60 * 60 * 1000 // 24h
    }
}

function getUserPreferences(): { baseFx: FxType; stableFx: FxType; cedearAuto: boolean; trackCash: boolean } {
    const storedFx = localStorage.getItem('argfolio-fx-preference')
    const storedCedear = localStorage.getItem('argfolio-settings-cedear-auto')
    const storedTrackCash = localStorage.getItem('argfolio.trackCash')

    return {
        baseFx: (storedFx as FxType) || 'MEP',
        stableFx: 'CRIPTO',
        cedearAuto: storedCedear !== 'false', // Default ON
        trackCash: storedTrackCash !== 'false', // Default ON
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

            const pricesMap = new Map<string, number>()
            const now = Date.now()
            const nowISO = new Date(now).toISOString()

            // Priority: Manual > live providers > last known cached.
            instrumentsList.forEach(instr => {
                const sym = instr.symbol.toUpperCase()
                let live = missingPrice('missing')

                if (manualPrices.has(instr.id)) {
                    live = okPrice(manualPrices.get(instr.id)!, 'manual', nowISO, 'high')
                } else if ((instr.category === 'CRYPTO' || instr.category === 'STABLE') && typeof cryptoPrices[sym] === 'number') {
                    live = okPrice(cryptoPrices[sym], 'coingecko', null, 'high')
                } else if (cedearAuto && instr.category === 'CEDEAR') {
                    const quote = cedearPrices[sym]
                    if (quote && Number.isFinite(quote.lastPriceArs) && quote.lastPriceArs > 0) {
                        live = okPrice(quote.lastPriceArs, 'PPI', quote.updatedAt, 'high')
                    }
                }

                const resolved = resolvePriceWithCache(
                    buildPriceCacheKey(instr.category, instr.id),
                    live,
                    { ttlMs: getPriceTtlMs(instr.category), now }
                )
                if (resolved.price != null) {
                    pricesMap.set(instr.id, resolved.price)
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

                    const live = vcp && vcp > 0
                        ? okPrice(vcp, 'fci_latest', null, 'high')
                        : missingPrice('fci_latest')
                    const resolved = resolvePriceWithCache(
                        buildPriceCacheKey(instr.category, instr.id),
                        live,
                        { ttlMs: getPriceTtlMs(instr.category), now }
                    )

                    if (resolved.price != null) {
                        pricesMap.set(instr.id, resolved.price)
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
