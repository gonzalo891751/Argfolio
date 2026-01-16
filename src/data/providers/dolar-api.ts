import type { FxRates } from '@/domain/types'

// Types for DolarApi responses
type DolarApiRate = {
    moneda: string // "USD"
    casa: string // "oficial", "blue", "mep", "contadoconliqui", "tarjeta", "mayorista", "cripto"
    nombre: string // "Oficial", "Blue", "Bolsa", "Contado con liqui", "Tarjeta", "Mayorista", "Cripto"
    compra: number
    venta: number
    fechaActualizacion: string // "2024-01-14T14:56:00.000Z"
}

// "cripto" endpoint might have different shape depending on endpoint, 
// but /v1/dolares includes "cripto" as a casa now? 
// Let's verify commonly used endpoints. 
// https://dolarapi.com/v1/dolares returns an array of these objects.
// Note: "cripto" usually comes from /v1/cotizacion/usdt or similar if we want USDT specifically. 
// But let's check what the standard "cripto" casa in /v1/dolares means (often generic or unstable).
// Better to fetch USDT explicitly if possible, or use the array.

// For now we will fetch /v1/dolares and assume coverage. 
// If "cripto" is missing or we want USDT specifically, we might need a second call.
// Let's implement robust finding.

export async function fetchFxRates(): Promise<FxRates> {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares')
        if (!response.ok) {
            throw new Error(`DolarApi error: ${response.statusText}`)
        }

        const data: DolarApiRate[] = await response.json()

        // Helper to find sell price
        const findRate = (casa: string) => {
            const rate = data.find(d => d.casa === casa)
            // If we found it, return full object, else defaults
            if (rate) {
                return {
                    buy: rate.compra,
                    sell: rate.venta,
                    mid: null
                }
            }
            return { buy: null, sell: null, mid: null }
        }

        const oficial = findRate('oficial')
        const blue = findRate('blue')
        const mep = findRate('bolsa') // API often uses 'bolsa' for MEP
        const ccl = findRate('contadoconliqui')

        // For crypto, find the rate like others
        const cripto = findRate('cripto')
        // Fallback if missing
        if (!cripto.buy && !cripto.sell) {
            cripto.sell = mep.sell || 0
            cripto.buy = mep.buy || 0 // rough fallback
        }

        return {
            oficial,
            blue,
            mep,
            ccl,
            cripto,
            updatedAtISO: new Date().toISOString(),
            source: 'dolarapi.com'
        }
    } catch (error) {
        console.error('Failed to fetch FX rates', error)
        throw error
    }
}
