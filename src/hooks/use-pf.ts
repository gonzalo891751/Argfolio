import { useMemo } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { derivePFPositions, PFDerivedState } from '@/domain/pf/processor'

export function usePF() {
    const { data: movements, isLoading: isMovementsLoading } = useMovements()
    const { data: fxRates, isLoading: isFxLoading } = useFxRates()

    const state: PFDerivedState = useMemo(() => {
        return derivePFPositions(movements, fxRates)
    }, [movements, fxRates])



    return {
        ...state,
        isLoading: isMovementsLoading || isFxLoading,
    }
}
