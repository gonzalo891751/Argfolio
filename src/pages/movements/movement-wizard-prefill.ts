import type { Currency } from '@/domain/types'

export type MovementWizardAssetClass = 'crypto' | 'wallet' | 'cedear' | 'fci' | 'pf' | 'currency'
export type MovementWizardOperationMode =
    | 'buy'
    | 'sell'
    | 'transfer'
    | 'swap'
    | 'adjust_balance'
    | 'deposit'
    | 'withdraw'

export const CRYPTO_OPERATION_MODES = ['buy', 'sell', 'transfer', 'swap', 'adjust_balance'] as const
export const WALLET_OPERATION_MODES = ['deposit', 'withdraw', 'transfer', 'adjust_balance'] as const

/** Shared navigation contract for every entry point into Nuevo Movimiento. */
export interface MovementWizardPrefill {
    assetClass?: MovementWizardAssetClass
    operationMode?: MovementWizardOperationMode
    accountId?: string
    destinationAccountId?: string
    instrumentId?: string
    symbol?: string
    currency?: Currency
    realBalance?: number
    quantity?: number
    datetimeISO?: string
    note?: string
}

export function cryptoMovementPrefill(
    operationMode: Extract<MovementWizardOperationMode, 'buy' | 'sell' | 'transfer' | 'swap' | 'adjust_balance'>,
    context: Omit<MovementWizardPrefill, 'assetClass' | 'operationMode'>,
): MovementWizardPrefill {
    return { assetClass: 'crypto', operationMode, ...context }
}

export function walletMovementPrefill(
    operationMode: Extract<MovementWizardOperationMode, 'deposit' | 'withdraw' | 'transfer' | 'adjust_balance'>,
    context: Omit<MovementWizardPrefill, 'assetClass' | 'operationMode'>,
): MovementWizardPrefill {
    return { assetClass: 'wallet', operationMode, ...context }
}
