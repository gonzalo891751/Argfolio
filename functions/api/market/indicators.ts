/**
 * Cloudflare Pages Function: /api/market/indicators
 * Fetches market indicators (MERVAL, S&P500, CCL, Riesgo País)
 */

import { fetchIndicators } from '../../../src/server/market/indicatorsProvider'

export const onRequest: PagesFunction = async (context) => {
    try {
        const data = await fetchIndicators()

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
                'Access-Control-Allow-Origin': '*',
            }
        })
    } catch (err: any) {
        console.error('Indicators API error:', err)

        return new Response(JSON.stringify({
            error: 'Failed to fetch indicators',
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
