import { parseIolCamaQuote } from '../src/domain/fci/providers/IolCamaProvider.ts'

const IOL_URL =
    'https://iol.invertironline.com/titulo/cotizacion/BCBA/IOLCAMA/IOL-CASH-MANAGEMENT/'

const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 8000)

try {
    const response = await fetch(IOL_URL, {
        signal: controller.signal,
        headers: {
            'User-Agent': 'argfolio-bot/1.0',
            Accept: 'text/html',
        },
    })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const quote = parseIolCamaQuote(html)

    console.log({
        price: quote?.price ?? null,
        varPct: quote?.changePct ?? null,
    })

    if (!quote) {
        process.exitCode = 1
    }
} finally {
    clearTimeout(timer)
}
