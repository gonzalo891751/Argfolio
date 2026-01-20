/**
 * FCI Provider (Server-side)
 * 
 * Re-exports the domain provider for use in Pages Functions.
 * This file exists in src/server/market to match existing patterns.
 */

import { fetchFciData } from '../../domain/fci/provider'
import type { FciFundResponse } from '../../domain/fci/types'

export { fetchFciData }
export type { FciFundResponse, FciFund, FciCategory, FciCurrency, FciTerm } from '../../domain/fci/types'

/**
 * Fetch FCI data with error handling for API layer
 */
export async function fetchFci(): Promise<FciFundResponse> {
    return fetchFciData('argentinaDatos')
}
