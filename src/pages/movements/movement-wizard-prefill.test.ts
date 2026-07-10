import { describe, expect, it } from 'vitest'
import {
    CRYPTO_OPERATION_MODES,
    WALLET_OPERATION_MODES,
    cryptoMovementPrefill,
    walletMovementPrefill,
} from './movement-wizard-prefill'

describe('unified movement wizard prefill', () => {
    it('exposes five crypto operations and four wallet operations', () => {
        expect(CRYPTO_OPERATION_MODES).toEqual(['buy', 'sell', 'transfer', 'swap', 'adjust_balance'])
        expect(WALLET_OPERATION_MODES).toEqual(['deposit', 'withdraw', 'transfer', 'adjust_balance'])
    })

    it('produces the same transfer contract from new movement, detail and asset row', () => {
        const context = { accountId: 'binance', instrumentId: 'btc', symbol: 'BTC' }
        const fromNewMovement = cryptoMovementPrefill('transfer', context)
        const fromDetail = cryptoMovementPrefill('transfer', context)
        const fromRow = cryptoMovementPrefill('transfer', context)
        expect(fromDetail).toEqual(fromNewMovement)
        expect(fromRow).toEqual(fromNewMovement)
    })

    it('prefills contextual crypto and wallet adjustments without asking for the account again', () => {
        expect(cryptoMovementPrefill('adjust_balance', { accountId: 'nexo', instrumentId: 'btc', symbol: 'BTC' }))
            .toMatchObject({ assetClass: 'crypto', operationMode: 'adjust_balance', accountId: 'nexo', symbol: 'BTC' })
        expect(walletMovementPrefill('adjust_balance', { accountId: 'carrefour', currency: 'ARS' }))
            .toMatchObject({ assetClass: 'wallet', operationMode: 'adjust_balance', accountId: 'carrefour', currency: 'ARS' })
    })
})
