/**
 * Cloudflare Pages Function: /api/market/cedears
 * Fetches CEDEAR quotes from PPI using shared provider
 */

import { fetchPpiCedears } from '../../../src/server/market/ppiCedearsProvider'

export const onRequest: PagesFunction = async (context) => {
    try {
        const url = new URL(context.request.url)
        const params = url.searchParams

        const options = {
            page: parseInt(params.get('page') || '1'),
            pageSize: parseInt(params.get('pageSize') || '50'),
            sort: params.get('sort') || undefined,
            dir: (params.get('dir') || undefined) as 'asc' | 'desc' | undefined,
            mode: (params.get('mode') || undefined) as 'top' | 'all' | undefined
        }

        const data = await fetchPpiCedears(options)

        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
                'Access-Control-Allow-Origin': '*',
            }
        })
    } catch (err: any) {
        console.error('CEDEAR API error:', err)

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
