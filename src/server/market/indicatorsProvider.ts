/**
 * Market Indicators Provider
 * Fetches: MERVAL, S&P 500, Dólar CCL, Riesgo País
 */

export interface MarketIndicator {
    value: number
    changePct1d?: number | null
    changeAbs1d?: number | null
}

export interface IndicatorsResponse {
    updatedAt: string
    merval: MarketIndicator
    sp500: MarketIndicator
    ccl: MarketIndicator
    riesgoPais: MarketIndicator
}

/**
 * Fetch index data from Stooq CSV API
 * Returns last close and previous close
 */
async function fetchStooqIndex(symbol: string): Promise<{ last: number; prev: number } | null> {
    try {
        // Stooq CSV format: Date,Open,High,Low,Close,Volume
        // Get last 5 days to ensure we have at least 2 trading days
        const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d&l=5`

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })

        if (!response.ok) {
            console.warn(`Stooq fetch failed for ${symbol}: ${response.status}`)
            return null
        }

        const csv = await response.text()
        const lines = csv.trim().split('\n')

        // Skip header, get last 2 data lines
        if (lines.length < 3) return null

        const dataLines = lines.slice(1).filter(l => l.trim())
        if (dataLines.length < 2) return null

        // Most recent is first (reverse chronological)
        const lastLine = dataLines[dataLines.length - 1]
        const prevLine = dataLines[dataLines.length - 2]

        const lastClose = parseFloat(lastLine.split(',')[4])
        const prevClose = parseFloat(prevLine.split(',')[4])

        if (isNaN(lastClose) || isNaN(prevClose)) return null

        return { last: lastClose, prev: prevClose }
    } catch (error) {
        console.error(`Error fetching Stooq ${symbol}:`, error)
        return null
    }
}

/**
 * Fetch Dólar CCL from DolarApi.com
 */
async function fetchCCL(): Promise<number | null> {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares')
        if (!response.ok) return null

        const data = await response.json()
        const ccl = data.find((d: any) => d.casa === 'contadoconliqui')

        return ccl?.venta ?? null
    } catch (error) {
        console.error('Error fetching CCL:', error)
        return null
    }
}

/**
 * Fetch Riesgo País from ArgentinaDatos
 */
async function fetchRiesgoPais(): Promise<{ value: number; prev: number } | null> {
    try {
        // ArgentinaDatos API for riesgo pais
        const response = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais')
        if (!response.ok) {
            // Fallback: try last value endpoint
            const lastResponse = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo')
            if (lastResponse.ok) {
                const data = await lastResponse.json()
                return { value: data.valor ?? 0, prev: data.valor ?? 0 }
            }
            return null
        }

        const data = await response.json()
        if (!Array.isArray(data) || data.length < 2) {
            // If array is too short, try ultimo endpoint
            const lastResponse = await fetch('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo')
            if (lastResponse.ok) {
                const lastData = await lastResponse.json()
                return { value: lastData.valor ?? 0, prev: lastData.valor ?? 0 }
            }
            return null
        }

        // Most recent entries at the end
        const lastEntry = data[data.length - 1]
        const prevEntry = data[data.length - 2]

        return {
            value: lastEntry.valor ?? 0,
            prev: prevEntry.valor ?? lastEntry.valor ?? 0
        }
    } catch (error) {
        console.error('Error fetching riesgo pais:', error)
        return null
    }
}

export async function fetchIndicators(): Promise<IndicatorsResponse> {
    // Fetch all in parallel
    const [mervalData, sp500Data, cclValue, riesgoPaisData] = await Promise.all([
        fetchStooqIndex('^MRV'),  // MERVAL
        fetchStooqIndex('^SPX'),  // S&P 500
        fetchCCL(),
        fetchRiesgoPais()
    ])

    // Calculate change percentages
    const merval: MarketIndicator = mervalData
        ? {
            value: mervalData.last,
            changePct1d: ((mervalData.last - mervalData.prev) / mervalData.prev) * 100
        }
        : { value: 0, changePct1d: null }

    const sp500: MarketIndicator = sp500Data
        ? {
            value: sp500Data.last,
            changePct1d: ((sp500Data.last - sp500Data.prev) / sp500Data.prev) * 100
        }
        : { value: 0, changePct1d: null }

    const ccl: MarketIndicator = {
        value: cclValue ?? 0,
        changePct1d: null  // DolarApi doesn't provide historical easily
    }

    const riesgoPais: MarketIndicator = riesgoPaisData
        ? {
            value: riesgoPaisData.value,
            changeAbs1d: riesgoPaisData.value - riesgoPaisData.prev
        }
        : { value: 0, changeAbs1d: null }

    return {
        updatedAt: new Date().toISOString(),
        merval,
        sp500,
        ccl,
        riesgoPais
    }
}
