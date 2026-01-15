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
                    if (req.url === '/api/market/cedears') {
                        const { fetchPpiCedears } = await import('./src/server/market/ppiCedearsProvider')
                        const data = await fetchPpiCedears()

                        res.setHeader('Content-Type', 'application/json')
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
                        res.end(JSON.stringify(data))
                        return
                    }

                    // /api/market/indicators
                    if (req.url === '/api/market/indicators') {
                        const { fetchIndicators } = await import('./src/server/market/indicatorsProvider')
                        const data = await fetchIndicators()

                        res.setHeader('Content-Type', 'application/json')
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
                        res.end(JSON.stringify(data))
                        return
                    }

                    // /api/cedears/prices (legacy endpoint)
                    if (req.url === '/api/cedears/prices') {
                        const { fetchPpiCedears } = await import('./src/server/market/ppiCedearsProvider')
                        const fullData = await fetchPpiCedears()

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

                    // Not found
                    res.statusCode = 404
                    res.end(JSON.stringify({ error: 'API endpoint not found' }))

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
