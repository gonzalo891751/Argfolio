import { fetchFci } from '../../../src/server/market/fciProvider'

/**
 * Cloudflare Pages Function: /api/market/fci
 *
 * Keeps parity with Vite dev middleware and returns the shape consumed by the UI.
 */
export const onRequestGet: PagesFunction = async () => {
    try {
        const data = await fetchFci()

        return new Response(JSON.stringify({
            source: 'argentinaDatos+iol',
            updatedAt: data.asOf,
            total: data.items.length,
            asOf: data.asOf,
            items: data.items,
            data: data.items,
        }), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=900',
                'Access-Control-Allow-Origin': '*',
            },
        })
    } catch (err: unknown) {
        const details = err instanceof Error ? err.message : String(err)
        console.error('FCI market API error:', err)

        return new Response(JSON.stringify({
            error: 'Failed to fetch FCI data',
            details,
        }), {
            status: 502,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            },
        })
    }
}
