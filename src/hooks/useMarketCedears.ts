/**
 * useMarketCedears hook
 * 
 * Fetches REAL CEDEAR ARS prices from PPI provider (scraped data)
 * AND underlying USD prices from Stooq for subyacente column/CCL calculation.
 * 
 * Strategy:
 * 1. Fetch ALL PPI items (~395).
 * 2. Fetch Master list (Comafi).
 * 3. Union: Tickeres = PPI | Master.
 * 4. Paginate the Union.
 * 5. Fetch Underlying USD for the visible page only.
 * 6. Merge & Calculate implicit CCL, etc.
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCedearMaster, type CedearMasterItem } from '@/domain/cedears/master'
import { useInstruments } from './use-instruments'
import { useFxRates } from './use-fx-rates'

export interface MarketCedearItem {
    kind: 'cedear'
    ticker: string
    name: string
    lastPriceArs: number | null       // CEDEAR price in ARS (REAL from PPI)
    lastPriceUsd: number | null       // CEDEAR price in USD (via MEP)
    changePct1d: number | null        // CEDEAR daily change % (PPI or calc)
    volume: number | null
    ratioText: string | null
    ratio: number | null
    lastQuoteTime: string | null
    source: 'PPI' | 'MASTER'
    underlyingUsd: number | null      // subyacente USD price (from Stooq)
    cclImplicit: number | null        // CCL implícito calculated
    isPpiOnly: boolean                // If true, not in Comafi master
}

export interface UseMarketCedearsOptions {
    page?: number
    pageSize?: number
    sort?: string
    dir?: 'asc' | 'desc'
    mode?: 'top' | 'all' | 'my'
}

// Interface matching PPI provider response
interface PpiCedearQuote {
    ticker: string
    name: string
    lastPriceArs: number
    changePct1d: number | null
    volume: number | null
    ratioText: string | null
    ratio: number | null
    prevClose: number | null
    lastQuoteTime: string | null
}

interface PpiResponse {
    source: string
    updatedAt: string
    total: number
    page: number
    pageSize: number
    data: PpiCedearQuote[]
}

// Fetch ALL CEDEAR prices from PPI (uses server-side scraped data)
async function fetchPpiCedears(): Promise<Map<string, PpiCedearQuote>> {
    try {
        const res = await fetch('/api/market/cedears?pageSize=1000&mode=all')
        if (!res.ok) {
            console.warn('PPI fetch failed:', res.status)
            return new Map()
        }
        const data: PpiResponse = await res.json()
        const map = new Map<string, PpiCedearQuote>()
        data.data.forEach(item => {
            // Sanity check: price should be reasonable (< 1,000,000 ARS)
            // AND strictly > 0.
            if (item.lastPriceArs > 0 && item.lastPriceArs < 1000000) {
                map.set(item.ticker.toUpperCase(), item)
            }
        })
        console.log(`[CEDEARS] PPI loaded ${map.size} items`)
        return map
    } catch (e) {
        console.error('Failed to fetch PPI cedears:', e)
        return new Map()
    }
}

// Fetch underlying USD prices from Stooq proxy (batched)
interface UnderlyingQuote {
    ticker: string
    priceUsd: number
    changePct1d: number | null
}

async function fetchUnderlyingPrices(tickers: string[]): Promise<Map<string, UnderlyingQuote>> {
    if (tickers.length === 0) return new Map()

    const CHUNK_SIZE = 50
    const results = new Map<string, UnderlyingQuote>()

    // Determine underlying symbol logic:
    // Usually same as ticker. If it has dot (BRK.B), fetchProxy handles it or we send as is.
    // Stooq proxy expects "BRK.B" and converts to "BRK-B.US".
    // We just send the CEDEAR ticker as the underlying ticker key.

    // Process in chunks
    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        const chunk = tickers.slice(i, i + CHUNK_SIZE)
        try {
            const params = new URLSearchParams()
            params.set('ticker', chunk.join(','))

            const res = await fetch(`/api/market/underlying?${params.toString()}`)
            if (!res.ok) {
                console.warn(`[Underlying] Fetch failed ${res.status}: ${res.statusText}`)
                continue
            }

            const data = await res.json()
            const items = data.items || data.data || []

            if (Array.isArray(items)) {
                items.forEach((item: any) => {
                    // Sanity check: underlying price should be < 100,000 USD
                    if (item.priceUsd > 0 && item.priceUsd < 100000) {
                        results.set(item.ticker.toUpperCase(), {
                            ticker: item.ticker,
                            priceUsd: item.priceUsd,
                            changePct1d: item.changePct1d ?? null
                        })
                    }
                })
                console.log(`[Underlying] Received ${items.length} prices for chunk`)
            } else {
                console.warn('[Underlying] Invalid response format', data)
            }
        } catch (e) {
            console.error('Failed to fetch underlying chunk', e)
        }
    }

    return results
}

export function useMarketCedears(options: UseMarketCedearsOptions = {}) {
    const { page = 1, pageSize = 50, sort = 'ticker', dir = 'asc', mode = 'top' } = options

    const { data: instruments = [] } = useInstruments()
    const { data: fxRates } = useFxRates()
    const queryClient = useQueryClient()

    const masterList = useMemo(() => getCedearMaster(), [])
    const masterMap = useMemo(() => {
        const map = new Map<string, CedearMasterItem>()
        masterList.forEach(m => map.set(m.ticker.toUpperCase(), m))
        return map
    }, [masterList])

    // 1. Fetch ALL PPI prices (cached for 2 min to match server)
    const { data: ppiPrices, isLoading: isPpiLoading } = useQuery({
        queryKey: ['cedears', 'ppi', 'all'],
        queryFn: fetchPpiCedears,
        staleTime: 2 * 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
    })

    // 2. Build Union List (PPI + Master)
    const unionList = useMemo(() => {
        const ppiSet = new Set(ppiPrices?.keys() || [])
        const masterSet = new Set(masterMap.keys())
        const allTickers = new Set([...ppiSet, ...masterSet])

        const list: MarketCedearItem[] = []

        allTickers.forEach(ticker => {
            const master = masterMap.get(ticker)
            const ppi = ppiPrices?.get(ticker)

            // Flag if PPI only (e.g. SPY, QQQ if not in master)
            const isPpiOnly = !master && !!ppi

            // Name preference: Master > PPI > Ticker
            const name = master?.name ?? ppi?.name ?? ticker

            // Ratio preference: Master > PPI
            const ratio = master?.ratio ?? ppi?.ratio ?? null
            const ratioText = master?.ratioText ?? ppi?.ratioText ?? (ratio ? `${ratio}:1` : null)

            // Prices from PPI
            const lastPriceArs = ppi?.lastPriceArs ?? null
            let changePct1d = ppi?.changePct1d ?? null
            const volume = ppi?.volume ?? null
            const prevClose = ppi?.prevClose ?? null
            const lastQuoteTime = ppi?.lastQuoteTime ?? null

            // VAR% Fallback: if null/0, calculate from prevClose
            // E.g. last=11850, prev=11380 -> +4.13%
            if ((changePct1d === null || changePct1d === 0) && lastPriceArs && prevClose && prevClose > 0) {
                const calc = ((lastPriceArs / prevClose) - 1) * 100
                // Sanity check: if calc is huge (>50%) or tiny (<0.01%), maybe ignore?
                // But normally it's correct.
                if (Math.abs(calc) > 0.001 && Math.abs(calc) < 100) {
                    changePct1d = calc
                }
            }

            // USD (MEP)
            const mepRate = fxRates?.mep ?? 0
            let lastPriceUsd: number | null = null
            if (lastPriceArs != null && mepRate > 0) {
                lastPriceUsd = lastPriceArs / mepRate
            }

            list.push({
                kind: 'cedear' as const,
                ticker,
                name,
                lastPriceArs,
                lastPriceUsd,
                changePct1d,
                volume,
                ratio,
                ratioText,
                lastQuoteTime,
                source: ppi ? 'PPI' : 'MASTER',
                underlyingUsd: null, // Filled later
                cclImplicit: null,   // Filled later
                isPpiOnly
            })
        })

        return list
    }, [masterMap, ppiPrices, fxRates?.mep])

    // 3. Filter based on mode
    const filtered = useMemo(() => {
        let list = unionList
        if (mode === 'my') {
            const myTickers = new Set(
                instruments
                    .filter(i => i.category === 'CEDEAR')
                    .map(i => i.symbol.toUpperCase())
            )
            list = unionList.filter(c => myTickers.has(c.ticker.toUpperCase()))
        }
        // "top": currently we don't strictly filter to top 50, we let pagination sort/show.
        // We return everything.
        return list
    }, [unionList, mode, instruments])

    // 4. Sort
    const sorted = useMemo(() => {
        const sortedList = [...filtered]
        sortedList.sort((a, b) => {
            let valA: any
            let valB: any

            switch (sort) {
                case 'lastPriceArs':
                case 'lastPrice':
                    valA = a.lastPriceArs
                    valB = b.lastPriceArs
                    break
                case 'changePct1d':
                case 'changePct':
                    valA = a.changePct1d
                    valB = b.changePct1d
                    break
                case 'volume':
                    valA = a.volume
                    valB = b.volume
                    break
                default:
                    valA = a.ticker
                    valB = b.ticker
            }

            // Treat nulls
            const NULL_VAL = dir === 'asc' ? Infinity : -Infinity
            if (valA == null) valA = NULL_VAL
            if (valB == null) valB = NULL_VAL

            if (valA === valB) return 0

            if (typeof valA === 'string' && typeof valB === 'string') {
                return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
            }
            return dir === 'asc' ? valA - valB : valB - valA
        })
        return sortedList
    }, [filtered, sort, dir])

    // 5. Paginate
    const pagedSlice = useMemo(() => {
        const start = (page - 1) * pageSize
        return sorted.slice(start, start + pageSize)
    }, [sorted, page, pageSize])

    // 6. Fetch underlying USD for visible slice only
    const tickersForUnderlying = useMemo(() => {
        // Only fetch if we have a priceArs to calculate CCL with?
        // Or fetch anyway for the column display.
        return pagedSlice.map(item => item.ticker)
    }, [pagedSlice])

    const { data: underlyingPrices, isLoading: isUnderlyingLoading } = useQuery({
        queryKey: ['cedears', 'underlying', tickersForUnderlying.join(',')],
        queryFn: () => fetchUnderlyingPrices(tickersForUnderlying),
        enabled: tickersForUnderlying.length > 0,
        staleTime: 5 * 60 * 1000,
    })

    // 7. Enrich with Underlying & Derived
    const rows: MarketCedearItem[] = useMemo(() => {
        return pagedSlice.map(item => {
            // Find underlying: exact match first
            // Note: fetchUnderlyingPrices returns map keyed by normalized ticker (usually same as request)
            const underlyingItem = underlyingPrices?.get(item.ticker.toUpperCase())
            const underlyingUsd = underlyingItem?.priceUsd ?? null

            // Calculate CCL implícito: (cedearArs * ratio) / underlyingUsd
            let cclImplicit: number | null = null
            if (item.lastPriceArs != null && underlyingUsd != null && underlyingUsd > 0 && item.ratio) {
                cclImplicit = (item.lastPriceArs * item.ratio) / underlyingUsd
            }

            return {
                ...item,
                underlyingUsd, // Now populated
                cclImplicit,   // Now populated
            }
        })
    }, [pagedSlice, underlyingPrices])

    const refetch = () => {
        queryClient.invalidateQueries({ queryKey: ['cedears', 'ppi'] })
        queryClient.invalidateQueries({ queryKey: ['cedears', 'underlying'] })
        queryClient.invalidateQueries({ queryKey: ['fxRates'] })
    }

    return {
        rows,
        total: sorted.length,
        page,
        pageSize,
        isLoading: isPpiLoading,
        isPricesLoading: isPpiLoading || isUnderlyingLoading,
        error: null,
        dataUpdatedAt: Date.now(),
        refetch,
    }
}
