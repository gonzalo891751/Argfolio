
import { useMemo, useRef, useEffect } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { derivePFPositions, PFDerivedState } from '@/domain/pf/processor'
import { useToast } from '@/components/ui/toast'
import { formatMoneyARS } from '@/lib/format'

export function usePF() {
    const { data: movements, isLoading: isMovementsLoading } = useMovements()
    const { data: fxRates, isLoading: isFxLoading } = useFxRates()
    const { toast } = useToast()

    // To prevent spamming toasts on every render or re-fetch
    const notifiedIds = useRef<Set<string>>(new Set())

    const state: PFDerivedState = useMemo(() => {
        return derivePFPositions(movements, fxRates)
    }, [movements, fxRates])

    // Handle Maturity Notifications
    useEffect(() => {
        if (!state.matured.length) return

        let newMaturedCount = 0
        let newMaturedTotal = 0
        let banks = new Set<string>()

        state.matured.forEach(pf => {
            if (!notifiedIds.current.has(pf.id)) {
                notifiedIds.current.add(pf.id)
                newMaturedCount++
                newMaturedTotal += pf.expectedTotalARS
                banks.add(pf.bank ?? 'Desconocido')
            }
        })

        if (newMaturedCount > 0) {
            const bankList = Array.from(banks).join(', ')
            toast({
                title: '¡Plazo Fijo / Frasco Vencido!',
                description: `Se han acreditado ${formatMoneyARS(newMaturedTotal)} a tu liquidez (Disponible). Bancos: ${bankList}.`,
                variant: 'default', // or a specific success variant?
                duration: 6000,
            })
        }
    }, [state.matured, toast])

    return {
        ...state,
        isLoading: isMovementsLoading || isFxLoading,
    }
}
