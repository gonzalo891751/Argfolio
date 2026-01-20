/**
 * FCI Provider Strategy
 * 
 * Central provider interface for FCI data.
 * Currently uses ArgentinaDatos, designed for easy switch to CAFCI later.
 */

import { fetchAllFci as fetchArgentinaDatos } from './providers/ArgentinaDatosProvider'
import type { FciFundResponse } from './types'

export type FciProviderType = 'argentinaDatos' | 'cafci'

// Default provider
const DEFAULT_PROVIDER: FciProviderType = 'argentinaDatos'

/**
 * Fetch FCI data from the configured provider
 */
export async function fetchFciData(provider: FciProviderType = DEFAULT_PROVIDER): Promise<FciFundResponse> {
    switch (provider) {
        case 'argentinaDatos':
            return fetchArgentinaDatos()

        case 'cafci':
            // TODO: Implement CAFCI planilla diaria provider
            throw new Error('CAFCI provider not yet implemented')

        default:
            return fetchArgentinaDatos()
    }
}

// Re-export types for convenience
export type { FciFund, FciFundResponse, FciCategory, FciCurrency, FciTerm } from './types'
