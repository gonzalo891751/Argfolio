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

/**
 * Fetch FCI data with error handling for API layer.
 * Merges ArgentinaDatos + custom IOLCAMA fund in parallel.
 */
export async function fetchFci(): Promise<FciFundResponse> {
    const [adResult, iolResult] = await Promise.allSettled([
        fetchFciData('argentinaDatos'),
        buildIolCamaFund(),
    ])

    // ArgentinaDatos is the primary source — if it fails, re-throw
    if (adResult.status === 'rejected') {
        throw adResult.reason
    }

    const response = adResult.value

    // Append IOLCAMA if the scrape succeeded
    if (iolResult.status === 'fulfilled' && iolResult.value != null) {
        response.items.push(iolResult.value)
    }

    return response
}
