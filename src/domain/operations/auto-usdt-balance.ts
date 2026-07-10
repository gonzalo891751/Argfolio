import type { OperationKind } from '@/domain/types'

const STABLES = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])

export function shouldCreateAutoUsdtBalance(input: {
    enabled: boolean
    isExchange: boolean
    ticker: string
    operationKind: OperationKind
}): boolean {
    return input.enabled
        && input.isExchange
        && input.operationKind === 'trade'
        && !STABLES.has(input.ticker.toUpperCase())
}
