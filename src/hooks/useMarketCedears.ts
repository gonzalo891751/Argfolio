/**
 * useMarketCedears hook
 * 
 * Fetches REAL CEDEAR ARS prices from PPI provider (scraped data)
 * and underlying USD prices from Stooq for subyacente column.
 */

import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCedearMaster } from '@/domain/cedears/master'
import { useInstruments } from './use-instruments'
import { useFxRates } from './use-fx-rates'

export interface MarketCedearItem {
    kind: 'cedear'
    ticker: string
    name: string
    lastPriceArs: number | null       // CEDEAR price in ARS (REAL from PPI)
    lastPriceUsd: number | null       // CEDEAR price in USD (via MEP)
    changePct1d: number | null        // CEDEAR daily change % (from PPI)
    volume: number | null
    ratioText: string | null
    ratio: number | null
    lastQuoteTime: string | null
    source: 'PPI' | 'THEORETICAL' | 'MASTER'
    underlyingUsd: number | null      // subyacente USD price (from Stooq)
    cclImplicit: number | null        // CCL implícito calculated
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

    // Process in chunks
    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        const chunk = tickers.slice(i, i + CHUNK_SIZE)
        try {
            const params = new URLSearchParams()
            params.set('ticker', chunk.join(','))

            const res = await fetch(`/api/market/underlying?${params.toString()}`)
            if (!res.ok) continue

            const data = await res.json()
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                    // Sanity check: underlying price should be < 100,000 USD
                    if (item.priceUsd > 0 && item.priceUsd < 100000) {
                        results.set(item.ticker.toUpperCase(), {
                            ticker: item.ticker,
                            priceUsd: item.priceUsd,
                            changePct1d: item.changePct1d ?? null
                        })
                    }
                })
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

    const allCedears = useMemo(() => getCedearMaster(), [])

    // 1. Fetch ALL PPI prices (cached for 2 min to match server)
    const { data: ppiPrices, isLoading: isPpiLoading } = useQuery({
        queryKey: ['cedears', 'ppi', 'all'],
        queryFn: fetchPpiCedears,
        staleTime: 2 * 60 * 1000,
        refetchInterval: 5 * 60 * 1000,
    })

    // 2. Filter based on mode
    const filtered = useMemo(() => {
        let list = allCedears
        if (mode === 'my') {
            const myTickers = new Set(
                instruments
                    .filter(i => i.category === 'CEDEAR')
                    .map(i => i.symbol.toUpperCase())
            )
            list = allCedears.filter(c => myTickers.has(c.ticker.toUpperCase()))
        } else if (mode === 'top') {
            // "top" usually means by volume, but since we default to all or sort later...
            // If just "top" requested, we can still return a larger slice or let pagination handle it.
            // But if user requested specifically "top", generally we return everything and let UI sort.
            // However, the original logic sliced to 50.
            // The user request "Que el merge con el master list cubra el 100%" implies we should pass ALL.
            list = allCedears
        } else {
            list = allCedears
        }
        return list
    }, [allCedears, mode, instruments])

    // 3. Enrich with PPI prices
    const enriched = useMemo(() => {
        const mepRate = fxRates?.mep ?? 0

        return filtered.map(item => {
            const ppi = ppiPrices?.get(item.ticker.toUpperCase())

            const lastPriceArs = ppi?.lastPriceArs ?? null
            let changePct1d = ppi?.changePct1d ?? null
            const volume = ppi?.volume ?? null
            const source: 'PPI' | 'MASTER' = ppi ? 'PPI' : 'MASTER'

            // Calculation fallback for variation?
            // "si changePct1d != null => usarlo; else si lastPriceArs && prevClose => calc"
            if (changePct1d === null && lastPriceArs !== null && ppi?.prevClose) {
                if (ppi.prevClose > 0) {
                    changePct1d = ((lastPriceArs / ppi.prevClose) - 1) * 100
                }
            }

            // Calculate lastPriceUsd via MEP
            let lastPriceUsd: number | null = null
            if (lastPriceArs != null && mepRate > 0) {
                lastPriceUsd = lastPriceArs / mepRate
            }

            return {
                master: item,
                lastPriceArs,
                lastPriceUsd,
                changePct1d,
                volume,
                source,
            }
        })
    }, [filtered, ppiPrices, fxRates?.mep])

    // 4. Sort
    const sorted = useMemo(() => {
        const sortedList = [...enriched]
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
                    valA = a.master.ticker
                    valB = b.master.ticker
            }

            // Treat nulls as very small for DESC or very very small/large for ASC
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
    }, [enriched, sort, dir])

    // 5. Paginate
    const pagedSlice = useMemo(() => {
        const start = (page - 1) * pageSize
        return sorted.slice(start, start + pageSize)
    }, [sorted, page, pageSize])

    // 6. Fetch underlying USD for visible slice only
    const tickersForUnderlying = useMemo(() => {
        return pagedSlice.map(item => item.master.ticker)
    }, [pagedSlice])

    const { data: underlyingPrices, isLoading: isUnderlyingLoading } = useQuery({
        queryKey: ['cedears', 'underlying', tickersForUnderlying.join(',')],
        queryFn: () => fetchUnderlyingPrices(tickersForUnderlying),
        enabled: tickersForUnderlying.length > 0,
        staleTime: 5 * 60 * 1000,
    })

    // 7. Final merge
    const rows: MarketCedearItem[] = useMemo(() => {
        return pagedSlice.map(item => {
            const underlying = underlyingPrices?.get(item.master.ticker.toUpperCase())
            const underlyingUsd = underlying?.priceUsd ?? null

            // Calculate CCL implícito: (cedearArs * ratio) / underlyingUsd
            let cclImplicit: number | null = null
            if (item.lastPriceArs != null && underlyingUsd != null && underlyingUsd > 0 && item.master.ratio) {
                cclImplicit = (item.lastPriceArs * item.master.ratio) / underlyingUsd
            }

            return {
                kind: 'cedear' as const,
                ticker: item.master.ticker,
                name: item.master.name,
                lastPriceArs: item.lastPriceArs,
                lastPriceUsd: item.lastPriceUsd,
                changePct1d: item.changePct1d,
                volume: item.volume,
                ratioText: item.master.ratioText,
                ratio: item.master.ratio,
                lastQuoteTime: null,
                source: item.source,
                underlyingUsd,
                cclImplicit,
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
