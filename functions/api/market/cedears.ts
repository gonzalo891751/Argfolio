import { fetchPpiCedears } from '../../../src/server/market/ppiCedearsProvider'

/**
 * Cloudflare Pages Function: /api/market/cedears
 *
 * Keeps parity with Vite dev middleware endpoint contract.
 */
export const onRequestGet: PagesFunction = async (context) => {
    try {
        const url = new URL(context.request.url)
        const params = url.searchParams

        const options = {
            page: params.get('page') ? parseInt(params.get('page')!, 10) : undefined,
            pageSize: params.get('pageSize') ? parseInt(params.get('pageSize')!, 10) : undefined,
            sort: params.get('sort') || undefined,
            dir: (params.get('dir') as 'asc' | 'desc') || undefined,
            mode: (params.get('mode') as 'top' | 'all') || undefined,
            stats: params.get('stats') === 'true',
        }

        const data = await fetchPpiCedears(options)

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300',
                'Access-Control-Allow-Origin': '*',
            }
        })
    } catch (err: any) {
        console.error('CEDEAR market API error:', err)

        return new Response(JSON.stringify({
            error: 'Failed to fetch CEDEAR data',
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
