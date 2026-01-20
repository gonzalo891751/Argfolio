/**
 * useFciPrices Hook
 * 
 * Maps FCI instrument IDs to current VCP prices from market data.
 */

import { useMemo } from 'react'
import { useMarketFci } from '@/hooks/useMarketFci'
import { generateFciSlug } from '@/pages/movements/components/FciTypeahead'

export interface FciPrice {
    vcp: number
    date: string
    changePct?: number // Percentage 1.5 = 1.5%
    currency: 'ARS' | 'USD'
    name: string
    manager: string
    category: string
}

export function useFciPrices() {
    const { items, isLoading, asOf } = useMarketFci()

    const priceMap = useMemo(() => {
        const map = new Map<string, FciPrice>()

        for (const fund of items) {
            const id = generateFciSlug(fund)
            map.set(id, {
                vcp: fund.vcp,
                date: fund.date,
                changePct: fund.variation1d != null ? fund.variation1d * 100 : undefined,
                currency: fund.currency,
                name: fund.name,
                manager: fund.manager,
                category: fund.category
            })
        }

        return map
    }, [items])

    return {
        priceMap,
        isLoading,
        asOf,
        getPrice: (instrumentId: string) => priceMap.get(instrumentId)
    }
}
