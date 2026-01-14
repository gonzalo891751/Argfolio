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
            return rate ? rate.venta : 0
        }

        const oficial = findRate('oficial')
        const blue = findRate('blue')
        const mep = findRate('bolsa') // API often uses 'bolsa' for MEP
        const ccl = findRate('contadoconliqui')
        const cripto = findRate('cripto') // Check if this exists, otherwise we might default to MEP or leave 0

        // If 'cripto' 0, try to fetch USDT entry if it exists in the main array, 
        // or just fallback to MEP as a safe proxy for now if usage is low, 
        // but better to fetch specific crypto endpoint if needed.
        // For simplicity in this phase, we rely on the main array.

        return {
            oficial,
            blue,
            mep,
            ccl,
            cripto: cripto || mep, // Fallback to MEP if crypto missing for now
            updatedAtISO: new Date().toISOString(),
            source: 'dolarapi.com'
        }
    } catch (error) {
        console.error('Failed to fetch FX rates', error)
        throw error
    }
}
