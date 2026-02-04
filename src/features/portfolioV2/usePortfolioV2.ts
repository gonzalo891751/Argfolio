/**
 * usePortfolioV2 Hook
 * 
 * Provides the PortfolioV2 data structure for the new Mis Activos V2 page.
 * Orchestrates data from multiple hooks and transforms via the builder.
 */

import { useMemo } from 'react'
import { useAssetsRows } from '@/features/assets/useAssetsRows'
import { useAccounts } from '@/hooks/use-instruments'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useMovements } from '@/hooks/use-movements'
import { usePF } from '@/hooks/use-pf'
import { buildPortfolioV2, type PFData } from './builder'
import type { PortfolioV2 } from './types'

export interface UsePortfolioV2Options {
    /** Category filter (optional) */
    categoryFilter?: string
    /** Search query (optional) */
    searchQuery?: string
}

export function usePortfolioV2(options: UsePortfolioV2Options = {}): PortfolioV2 | null {
    const { categoryFilter = 'all', searchQuery = '' } = options

    // Fetch data from all sources
    const {
        groupedRows,
        isLoading: assetsLoading,
        error: assetsError,
    } = useAssetsRows({
        categoryFilter: categoryFilter as 'all',
        searchQuery
    })

    const { data: accounts = [] } = useAccounts()
    const { data: fxRates } = useFxRates()
    const { data: movements = [] } = useMovements()

    // PF data from usePF hook
    const pfRaw = usePF()
    const pfData = useMemo((): PFData | undefined => {
        if (!pfRaw) return undefined
        return {
            active: pfRaw.active,
            matured: pfRaw.matured,
            totalActiveARS: pfRaw.totals.totalActiveARS,
            totalMaturedARS: pfRaw.totals.totalMaturedARS,
            totalActiveInterestARS: pfRaw.totals.totalActiveInterestARS,
        }
    }, [pfRaw])

    // Build V2 portfolio
    const portfolioV2 = useMemo((): PortfolioV2 | null => {
        // Wait for required data
        if (!fxRates) return null
        if (Object.keys(groupedRows).length === 0 && !assetsLoading) {
            // Empty portfolio - return minimal structure
            return {
                isLoading: false,
                asOfISO: fxRates.updatedAtISO,
                fx: {
                    officialSell: fxRates.oficial.sell ?? 0,
                    officialBuy: fxRates.oficial.buy ?? 0,
                    mep: fxRates.mep.sell ?? fxRates.mep.buy ?? 0,
                    ccl: 0,
                    cryptoUsdtArs: fxRates.cripto.sell ?? fxRates.cripto.buy ?? 0,
                    updatedAtISO: fxRates.updatedAtISO,
                },
                kpis: {
                    totalArs: 0,
                    totalUsdEq: 0,
                    pnlUnrealizedArs: 0,
                    pnlUnrealizedUsdEq: 0,
                    exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 0 },
                    pctUsdHard: 0,
                    pctUsdEq: 0,
                    pctArs: 100,
                },
                flags: { inferredBalanceCount: 0 },
                rubros: [],
                walletDetails: new Map(),
                fixedDepositDetails: new Map(),
                cedearDetails: new Map(),
                cryptoDetails: new Map(),
            }
        }

        if (assetsLoading) {
            return {
                isLoading: true,
                error: assetsError?.message,
                asOfISO: new Date().toISOString(),
                fx: {
                    officialSell: 0,
                    officialBuy: 0,
                    mep: 0,
                    ccl: 0,
                    cryptoUsdtArs: 0,
                    updatedAtISO: '',
                },
                kpis: {
                    totalArs: 0,
                    totalUsdEq: 0,
                    pnlUnrealizedArs: 0,
                    pnlUnrealizedUsdEq: 0,
                    exposure: { usdHard: 0, usdEquivalent: 0, arsReal: 0 },
                    pctUsdHard: 0,
                    pctUsdEq: 0,
                    pctArs: 0,
                },
                flags: { inferredBalanceCount: 0 },
                rubros: [],
                walletDetails: new Map(),
                fixedDepositDetails: new Map(),
                cedearDetails: new Map(),
                cryptoDetails: new Map(),
            }
        }

        // Build the full portfolio
        return buildPortfolioV2({
            groupedRows,
            accounts,
            fxRates,
            movements,
            pfData,
        })
    }, [groupedRows, accounts, fxRates, movements, pfData, assetsLoading, assetsError])

    return portfolioV2
}
