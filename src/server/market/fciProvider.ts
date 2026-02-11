/**
 * FCI Provider (Server-side)
 *
 * Re-exports the domain provider for use in Pages Functions.
 * This file exists in src/server/market to match existing patterns.
 *
 * Also merges the custom IOLCAMA fund (scraped server-side from IOL)
 * into the ArgentinaDatos results.
 */

import { fetchFciData } from '../../domain/fci/provider'
import { buildIolCamaFund } from '../../domain/fci/providers/IolCamaProvider'
import type { FciFundResponse } from '../../domain/fci/types'

export { fetchFciData }
export type { FciFundResponse, FciFund, FciCategory, FciCurrency, FciTerm } from '../../domain/fci/types'

function normalizeName(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
}

/**
 * Fetch FCI data with error handling for API layer.
 * Merges ArgentinaDatos + custom IOLCAMA fund in parallel.
 */
export async function fetchFci(): Promise<FciFundResponse> {
    const [argentinaDatosResult, iolResult] = await Promise.allSettled([
        fetchFciData('argentinaDatos'),
        buildIolCamaFund(),
    ])

    // ArgentinaDatos is the primary source: if it fails, the API must fail.
    if (argentinaDatosResult.status === 'rejected') {
        throw argentinaDatosResult.reason
    }

    const response = argentinaDatosResult.value

    // IOLCAMA is best-effort: append when available and avoid duplicates.
    if (iolResult.status === 'fulfilled' && iolResult.value != null) {
        const iolFund = iolResult.value
        const alreadyExists = response.items.some((item) => (
            item.id === iolFund.id || normalizeName(item.name) === normalizeName(iolFund.name)
        ))

        if (!alreadyExists) {
            response.items.push(iolFund)
        }
    }

    return response
}
