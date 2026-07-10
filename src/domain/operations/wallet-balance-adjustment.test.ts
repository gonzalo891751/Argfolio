import { describe, expect, it } from 'vitest'
import { computeWalletBalanceAdjustment } from './wallet-balance-adjustment'

describe('wallet balance adjustment', () => {
    it('proposes a negative 39041 adjustment from 689041 to 650000', () => {
        expect(computeWalletBalanceAdjustment(689041, 650000)).toEqual({
            systemBalance: 689041,
            realBalance: 650000,
            diff: -39041,
            amount: 39041,
            direction: 'expense',
            before: 689041,
            after: 650000,
        })
    })

    it('proposes an income when the real balance is greater', () => {
        expect(computeWalletBalanceAdjustment(100, 125)).toMatchObject({ diff: 25, amount: 25, direction: 'income' })
    })
})
