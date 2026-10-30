/**
 * Quick entry — pure builders for the movements created by the "Cargar" sheet.
 *
 * They produce exactly the shapes the classic wizards persist, so the holdings
 * engine, cash ledger, results and sync treat them the same way:
 *  - crypto trades on an exchange carry a linked USDT leg (cash-neutral);
 *  - CEDEAR trades settle in the broker's ARS cash;
 *  - USD deposits record their ARS value (cost basis for "ganancia en pesos");
 *  - balance updates book the difference as interest, deposit/withdraw or a
 *    tagged correction.
 */

import type { Currency, FxType, Movement, MovementType } from '@/domain/types'
import { computeWalletBalanceAdjustment } from '@/domain/operations/wallet-balance-adjustment'

export type TradeSide = 'buy' | 'sell'
export type TradeAssetClass = 'crypto' | 'cedear'

export interface TradeInput {
    side: TradeSide
    assetClass: TradeAssetClass
    instrumentId: string
    symbol: string
    name: string
    accountId: string
    /** Exchange accounts settle crypto against USDT */
    isExchange: boolean
    qty: number
    /** Unit price: USD for crypto, ARS for CEDEARs */
    unitPrice: number
    /** Commission in the trade currency (optional) */
    fee?: number
    datetimeISO: string
    /** Dollar of the day: cripto for crypto, MEP for CEDEARs */
    fxRate: number
    /** Settle the crypto trade with USDT from the same account */
    settleWithStable: boolean
    stableInstrumentId?: string
    notes?: string
    newId?: () => string
}

const STABLES = new Set(['USDT', 'USDC', 'DAI', 'BUSD'])

const defaultId = () => crypto.randomUUID()

function round(value: number, decimals = 8): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

export function validateTrade(input: Pick<TradeInput, 'qty' | 'unitPrice' | 'accountId' | 'instrumentId' | 'fxRate'>): string | null {
    if (!input.instrumentId) return 'Elegí qué activo operaste.'
    if (!input.accountId) return 'Elegí la cuenta o broker.'
    if (!(input.qty > 0)) return 'La cantidad tiene que ser mayor a cero.'
    if (!(input.unitPrice > 0)) return 'El precio tiene que ser mayor a cero.'
    if (!(input.fxRate > 0)) return 'Todavía no cargó la cotización del dólar.'
    return null
}

export function buildTradeMovements(input: TradeInput): Movement[] {
    const error = validateTrade(input)
    if (error) throw new Error(error)

    const newId = input.newId ?? defaultId
    const isBuy = input.side === 'buy'
    const type: MovementType = isBuy ? 'BUY' : 'SELL'
    const gross = round(input.qty * input.unitPrice, 8)
    const fee = input.fee && input.fee > 0 ? input.fee : 0
    const net = isBuy ? gross + fee : gross - fee
    const tradeCurrency: Currency = input.assetClass === 'crypto' ? 'USD' : 'ARS'
    const fxKind: FxType = input.assetClass === 'crypto' ? 'CRIPTO' : 'MEP'
    const id = newId()

    const totalUSD = tradeCurrency === 'USD' ? net : net / input.fxRate
    const totalARS = tradeCurrency === 'USD' ? net * input.fxRate : net

    const main: Movement = {
        id,
        datetimeISO: input.datetimeISO,
        type,
        assetClass: input.assetClass,
        instrumentId: input.instrumentId,
        accountId: input.accountId,
        ticker: input.symbol,
        assetName: input.name,
        quantity: input.qty,
        unitPrice: input.unitPrice,
        tradeCurrency,
        totalAmount: gross,
        ...(fee > 0 ? { fee: { mode: 'FIXED' as const, amount: fee, currency: tradeCurrency } } : {}),
        netAmount: net,
        totalUSD,
        totalARS,
        fxAtTrade: input.fxRate,
        fx: {
            kind: fxKind,
            rate: input.fxRate,
            side: isBuy ? 'sell' : 'buy',
            asOf: input.datetimeISO,
        },
        notes: input.notes || undefined,
    }

    if (input.assetClass === 'cedear') {
        if (!isBuy) main.meta = { costingMethod: 'PPP' }
        return [main]
    }

    main.groupId = id
    main.meta = {
        operationId: id,
        operationKind: 'trade',
        operationStatus: 'posted',
        legRole: 'asset',
        ...(!isBuy ? { costingMethod: 'PPP' } : {}),
    }

    const movements: Movement[] = [main]
    const needsStableLeg = input.settleWithStable
        && input.isExchange
        && !STABLES.has(input.symbol.toUpperCase())
        && net > 0

    if (needsStableLeg) {
        movements.push({
            id: newId(),
            datetimeISO: input.datetimeISO,
            type: isBuy ? 'SELL' : 'BUY',
            assetClass: 'crypto',
            instrumentId: input.stableInstrumentId,
            ticker: 'USDT',
            assetName: 'Tether USD',
            accountId: input.accountId,
            quantity: net,
            unitPrice: 1,
            tradeCurrency: 'USD',
            totalAmount: net,
            netAmount: net,
            totalUSD: net,
            totalARS: net * input.fxRate,
            fxAtTrade: input.fxRate,
            isAuto: true,
            linkedMovementId: id,
            reason: 'auto_usdt_balance',
            groupId: id,
            meta: {
                operationId: id,
                operationKind: 'trade',
                operationStatus: 'posted',
                legRole: isBuy ? 'source' : 'destination',
            },
        })
    }

    return movements
}

export interface CashInput {
    direction: 'in' | 'out'
    accountId: string
    currency: 'ARS' | 'USD'
    amount: number
    datetimeISO: string
    /** Cash instrument for the currency (ARS_CASH / USD_CASH) */
    instrumentId: string
    /** Dollar of the day, used to record the ARS value of USD movements */
    fxRate: number
    fxKind: FxType
    notes?: string
    /** Tags the movement as a balance correction instead of real money flow */
    adjustment?: { reason: NonNullable<NonNullable<Movement['meta']>['walletAdjustmentReason']> }
    newId?: () => string
}

export function buildCashMovement(input: CashInput): Movement {
    if (!(input.amount > 0)) throw new Error('El monto tiene que ser mayor a cero.')
    if (!input.accountId) throw new Error('Elegí la cuenta.')

    const newId = input.newId ?? defaultId
    const isUsd = input.currency === 'USD'
    const hasFx = input.fxRate > 0
    const movement: Movement = {
        id: newId(),
        datetimeISO: input.datetimeISO,
        type: input.direction === 'in' ? 'DEPOSIT' : 'WITHDRAW',
        assetClass: 'wallet',
        instrumentId: input.instrumentId,
        accountId: input.accountId,
        ticker: input.currency,
        assetName: isUsd ? 'Dólares' : 'Pesos',
        quantity: input.amount,
        unitPrice: 1,
        tradeCurrency: input.currency,
        totalAmount: input.amount,
        netAmount: input.amount,
        notes: input.notes || undefined,
    }

    if (hasFx) {
        movement.totalARS = isUsd ? input.amount * input.fxRate : input.amount
        movement.totalUSD = isUsd ? input.amount : input.amount / input.fxRate
        movement.fxAtTrade = input.fxRate
        movement.fx = {
            kind: input.fxKind,
            rate: input.fxRate,
            side: input.direction === 'in' ? 'sell' : 'buy',
            asOf: input.datetimeISO,
        }
    }

    if (input.adjustment) {
        movement.meta = {
            operationId: newId(),
            operationKind: 'balance_adjustment',
            operationStatus: 'posted',
            legRole: 'cash',
            direction: input.direction,
            walletAdjustmentReason: input.adjustment.reason,
        }
    }

    return movement
}

/** What the difference between Argfolio's balance and the real one was. */
export type BalanceDiffReason = 'interest' | 'deposit' | 'withdraw' | 'adjustment'

export interface BalanceUpdateInput {
    accountId: string
    currency: 'ARS' | 'USD'
    systemBalance: number
    realBalance: number
    reason: BalanceDiffReason
    datetimeISO: string
    instrumentId: string
    fxRate: number
    fxKind: FxType
    newId?: () => string
}

export function buildBalanceUpdate(input: BalanceUpdateInput): Movement | null {
    const diff = computeWalletBalanceAdjustment(input.systemBalance, input.realBalance)
    if (diff.direction === 'none') return null

    const newId = input.newId ?? defaultId
    const amount = round(diff.amount, 2)

    if (input.reason === 'interest') {
        if (diff.direction !== 'income') throw new Error('Los intereses solo pueden sumar saldo.')
        const isUsd = input.currency === 'USD'
        return {
            id: newId(),
            datetimeISO: input.datetimeISO,
            type: 'INTEREST',
            assetClass: 'wallet',
            accountId: input.accountId,
            tradeCurrency: input.currency,
            quantity: amount,
            totalAmount: amount,
            netAmount: amount,
            totalARS: isUsd ? amount * (input.fxRate || 0) : amount,
            totalUSD: isUsd ? amount : (input.fxRate > 0 ? amount / input.fxRate : 0),
            notes: 'Intereses (actualización de saldo)',
        }
    }

    const direction = diff.direction === 'income' ? 'in' : 'out'
    if (input.reason === 'deposit' && direction !== 'in') throw new Error('El saldo real es menor: no puede ser un ingreso.')
    if (input.reason === 'withdraw' && direction !== 'out') throw new Error('El saldo real es mayor: no puede ser un retiro.')

    return buildCashMovement({
        direction,
        accountId: input.accountId,
        currency: input.currency,
        amount,
        datetimeISO: input.datetimeISO,
        instrumentId: input.instrumentId,
        fxRate: input.fxRate,
        fxKind: input.fxKind,
        notes: input.reason === 'adjustment' ? 'Corrección de saldo' : 'Actualización de saldo',
        adjustment: input.reason === 'adjustment' ? { reason: 'correction' } : undefined,
        newId,
    })
}
