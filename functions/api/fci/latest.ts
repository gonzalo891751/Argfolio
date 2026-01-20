/**
 * Cloudflare Pages Function: /api/fci/latest
 * 
 * Fetches FCI (Fondos Comunes de Inversión) data from ArgentinaDatos
 * and returns normalized response with edge caching.
 */

import { fetchFci } from '../../../src/server/market/fciProvider'

export const onRequest: PagesFunction = async (context) => {
    try {
        const data = await fetchFci()

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                // Cache 5-10 minutes at edge, allow stale up to 15 min
                'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=900',
                'Access-Control-Allow-Origin': '*',
            }
        })
    } catch (err: any) {
        console.error('FCI API error:', err)

        return new Response(JSON.stringify({
            error: 'Failed to fetch FCI data',
            details: err.message
        }), {
            status: 502,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        })
    }
}
