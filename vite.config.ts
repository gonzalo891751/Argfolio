import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * Custom Vite plugin to serve API endpoints in development
 * This allows local testing without Cloudflare Pages Functions
 */
function devApiMiddleware(): Plugin {
    return {
        name: 'dev-api-middleware',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                // Only handle API routes
                if (!req.url?.startsWith('/api/')) {
                    return next()
                }

                try {
                    // /api/market/cedears
                    if (req.url && req.url.startsWith('/api/market/cedears')) {
                        const { fetchPpiCedears } = await import('./src/server/market/ppiCedearsProvider')

                        // Parse query params manually since we don't have a full Request object in middleware
                        const url = new URL(req.url, 'http://localhost')
                        const params = url.searchParams

                        const options = {
                            page: params.get('page') ? parseInt(params.get('page')!) : undefined,
                            pageSize: params.get('pageSize') ? parseInt(params.get('pageSize')!) : undefined,
                            sort: params.get('sort') || undefined,
                            dir: (params.get('dir') as 'asc' | 'desc') || undefined,
                            mode: (params.get('mode') as 'top' | 'all') || undefined
                        }

                        const data = await fetchPpiCedears(options)

                        res.setHeader('Content-Type', 'application/json')
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
                        res.end(JSON.stringify(data))
                        return
                    }

                    // /api/market/indicators
                    if (req.url && req.url.startsWith('/api/market/indicators')) {
                        const { fetchIndicators } = await import('./src/server/market/indicatorsProvider')
                        const data = await fetchIndicators()

                        res.setHeader('Content-Type', 'application/json')
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
                        res.end(JSON.stringify(data))
                        return
                    }

                    // /api/cedears/prices (legacy endpoint)
                    if (req.url && req.url.startsWith('/api/cedears/prices')) {
                        const { fetchPpiCedears } = await import('./src/server/market/ppiCedearsProvider')
                        const fullData = await fetchPpiCedears({ mode: 'all', pageSize: 1000 })

                        // Transform to legacy format
                        const legacyData = {
                            source: fullData.source,
                            updatedAt: fullData.updatedAt,
                            items: fullData.data.map(item => ({
                                ticker: item.ticker,
                                lastPriceArs: item.lastPriceArs
                            }))
                        }

                        res.setHeader('Content-Type', 'application/json')
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.end(JSON.stringify(legacyData))
                        return
                    }

                    // /api/market/underlying
                    if (req.url && req.url.startsWith('/api/market/underlying')) {
                        const url = new URL(req.url, 'http://localhost')
                        const tickerParam = url.searchParams.get('ticker') || url.searchParams.get('tickers')

                        if (!tickerParam) {
                            res.statusCode = 400
                            res.end(JSON.stringify({ error: 'Missing ticker' }))
                            return
                        }

                        const tickers = tickerParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
                        const limitedTickers = tickers.slice(0, 50);

                        const mapToStooq = (t: string) => {
                            if (t === 'BRK.B' || t === 'BRK/B') return 'BRK-B.US';
                            if (t === 'BF.B') return 'BF-B.US';
                            if (t.includes('.')) {
                                return t.replace('.', '-') + '.US';
                            }
                            return `${t}.US`;
                        };

                        const symbols = limitedTickers.map(mapToStooq).join('+');

                        // f=sd2t2c: Symbol, Date, Time, Close
                        const stooqUrl = `https://stooq.com/q/l/?s=${symbols}&f=sd2t2c&h&e=csv`;

                        const response = await fetch(stooqUrl);
                        const csvText = await response.text();
                        const lines = csvText.split('\n');
                        const items: any[] = [];

                        for (let i = 1; i < lines.length; i++) {
                            const line = lines[i].trim();
                            if (!line) continue;
                            const parts = line.split(',');
                            if (parts.length < 4) continue;

                            const stooqSym = parts[0];
                            const closeStr = parts[3];

                            if (closeStr === 'N/D') continue;

                            const price = parseFloat(closeStr);

                            if (!isNaN(price) && isFinite(price) && price > 0) {
                                let cleanTicker = stooqSym.replace('.US', '');
                                if (cleanTicker === 'BRK-B') cleanTicker = 'BRK.B';
                                if (cleanTicker === 'BF-B') cleanTicker = 'BF.B';

                                items.push({
                                    ticker: cleanTicker,
                                    symbol: stooqSym,
                                    priceUsd: price,
                                    changePct1d: null,
                                    updatedAt: new Date().toISOString()
                                });
                            }
                        }

                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify({ source: 'Stooq-Dev', items }))
                        return
                    }

                    // /api/fci/latest
                    if (req.url && req.url.startsWith('/api/fci/latest')) {
                        console.log('[DEV] FCI API request received')
                        try {
                            const { fetchFci } = await import('./src/server/market/fciProvider')
                            const data = await fetchFci()

                            console.log(`[DEV] FCI data fetched: ${data.items.length} items`)

                            res.setHeader('Content-Type', 'application/json')
                            res.setHeader('Access-Control-Allow-Origin', '*')
                            res.setHeader('Cache-Control', 'public, max-age=60')
                            res.end(JSON.stringify(data))
                            return
                        } catch (fciError: any) {
                            console.error('[DEV] FCI fetch error:', fciError.message)
                            res.statusCode = 502
                            res.setHeader('Content-Type', 'application/json')
                            res.end(JSON.stringify({
                                error: 'Failed to fetch FCI data',
                                details: fciError.message,
                                hint: 'Check if ArgentinaDatos API is reachable'
                            }))
                            return
                        }
                    }

                    // Not found
                    res.statusCode = 404
                    res.end(JSON.stringify({ error: 'API endpoint not found', url: req.url }))

                } catch (error: any) {
                    console.error('API Error:', error)
                    res.statusCode = 502
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({
                        error: 'Failed to fetch data',
                        details: error.message
                    }))
                }
            })
        }
    }
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), devApiMiddleware()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
