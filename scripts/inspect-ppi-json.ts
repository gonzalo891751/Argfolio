
import { parse } from 'node-html-parser'

async function inspect() {
    console.log('Fetching PPI page...')
    const res = await fetch('https://www.portfoliopersonal.com/Cotizaciones/Cedears')
    const html = await res.text()

    const root = parse(html)
    const script = root.querySelector('#__NEXT_DATA__')

    if (!script) {
        console.error('No __NEXT_DATA__ script found')
        return
    }

    try {
        const json = JSON.parse(script.text)
        const instruments = json.props?.pageProps?.instruments

        if (!instruments || !Array.isArray(instruments)) {
            console.error('No instruments array found in props.pageProps')
            console.log('Keys in pageProps:', Object.keys(json.props?.pageProps || {}))
            return
        }

        console.log(`Found ${instruments.length} instruments.`)
        if (instruments.length > 0) {
            console.log('First item structure:', JSON.stringify(instruments[0], null, 2))
        }

    } catch (e) {
        console.error('Failed to parse JSON:', e)
    }
}

inspect()
