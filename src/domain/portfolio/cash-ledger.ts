import type { Movement, Currency } from '@/domain/types'
import { filterActiveMovements } from '@/domain/operations/operation'

export interface CashLedgerResult {
    balances: Map<string, Map<Currency, number>>
    openingBalances: Map<string, Map<Currency, number>>
}

export interface CashDelta {
    currency: Currency
    amount: number
}

export type CashContributionReason =
    | 'deposit'
    | 'withdraw'
    | 'trade_settlement'
    | 'legacy_trade'
    | 'swap_leg'
    | 'transfer'
    | 'fee'
    | 'adjustment'
    | 'unknown'

export type CashContributionIssue =
    | 'possible_swap_residue'
    | 'legacy_settlement'
    | 'missing_settlement_metadata'

export interface CashContribution {
    movementId: string
    operationId?: string
    datetimeISO: string
    type: Movement['type']
    assetClass?: Movement['assetClass']
    symbol?: string
    amount: number
    currency: Currency
    reason: CashContributionReason
    issue?: CashContributionIssue
    synthetic?: 'opening_balance'
}

const EPSILON = 1e-8

function ensureAccountMap(
    map: Map<string, Map<Currency, number>>,
    accountId: string
): Map<Currency, number> {
    if (!map.has(accountId)) {
        map.set(accountId, new Map())
    }
    return map.get(accountId)!
}

function resolveTradeCurrency(mov: Movement): Currency {
    if (mov.tradeCurrency) return mov.tradeCurrency
    if (mov.fee?.currency) return mov.fee.currency
    if (mov.feeCurrency) return mov.feeCurrency
    if (mov.totalUSD && mov.totalUSD !== 0) return 'USD'
    return 'ARS'
}

function resolveFee(mov: Movement, fallbackCurrency: Currency): { amount: number; currency: Currency } | null {
    const rawAmount = mov.fee?.amount ?? mov.feeAmount
    if (rawAmount == null || !Number.isFinite(rawAmount) || rawAmount === 0) return null
    const amount = rawAmount
    const currency = mov.fee?.currency ?? mov.feeCurrency ?? fallbackCurrency
    return { amount, currency }
}

function resolveGrossAmount(mov: Movement, tradeCurrency: Currency): number {
    if (Number.isFinite(mov.totalAmount)) return mov.totalAmount
    if (Number.isFinite(mov.netAmount)) return mov.netAmount ?? 0
    const qty = mov.quantity ?? 0
    const price = mov.unitPrice ?? 0
    if (Number.isFinite(qty) && Number.isFinite(price) && qty !== 0 && price !== 0) {
        return qty * price
    }
    if (tradeCurrency === 'ARS' && Number.isFinite(mov.totalARS)) return mov.totalARS ?? 0
    if (tradeCurrency === 'USD' && Number.isFinite(mov.totalUSD)) return mov.totalUSD ?? 0
    return 0
}

function resolveNetAmount(mov: Movement, tradeCurrency: Currency, isBuySide: boolean): number {
    if (Number.isFinite(mov.netAmount)) return mov.netAmount ?? 0
    const gross = resolveGrossAmount(mov, tradeCurrency)
    const fee = resolveFee(mov, tradeCurrency)
    if (fee && fee.currency === tradeCurrency) {
        return isBuySide ? gross + fee.amount : gross - fee.amount
    }
    return gross
}

function resolveUsdQuantity(mov: Movement): number {
    if (Number.isFinite(mov.quantity)) return mov.quantity ?? 0
    if (Number.isFinite(mov.totalUSD)) return mov.totalUSD ?? 0
    return 0
}

/**
 * In-kind asset movements (crypto transfers between own accounts and their
 * network-fee legs) move UNITS of an instrument, not cash. Their quantity is
 * tracked by the holdings engine via instrumentId; touching the cash ledger
 * would create phantom USD balances.
 */
function isInKindAssetMovement(mov: Movement): boolean {
    if (!mov.instrumentId) return false
    if (mov.assetClass !== 'crypto') return false
    if (mov.type === 'TRANSFER_IN' || mov.type === 'TRANSFER_OUT') return true
    if (mov.type === 'FEE' && mov.meta?.legRole === 'fee') return true
    if (mov.meta?.legRole === 'asset' && (
        mov.meta.operationKind === 'balance_adjustment'
        || mov.meta.operationKind === 'income'
        || mov.meta.operationKind === 'fee'
    )) return true
    return false
}

function isExplicitCashNeutralOperation(mov: Movement): boolean {
    return mov.meta?.operationKind === 'swap'
        || (mov.assetClass === 'crypto' && mov.meta?.operationKind === 'transfer')
        || (mov.assetClass === 'crypto' && mov.meta?.operationKind === 'balance_adjustment')
        || (mov.assetClass === 'crypto' && (
            mov.meta?.operationKind === 'income'
            || mov.meta?.operationKind === 'fee'
        ))
}

function isStablecoinSale(mov: Movement): boolean {
    const symbol = (mov.ticker ?? mov.assetName ?? '').toUpperCase()
    return mov.assetClass === 'crypto'
        && mov.type === 'SELL'
        && ['USDT', 'USDC', 'DAI', 'BUSD'].includes(symbol)
}

export function getMovementCashDeltas(mov: Movement): CashDelta[] {
    const deltas: CashDelta[] = []
    const tradeCurrency = resolveTradeCurrency(mov)

    // Compound crypto operations are cash-neutral by contract. Do not rely on
    // SELL and BUY legs cancelling exactly: rounding and incomplete legacy legs
    // must never manufacture fiat cash.
    if (isExplicitCashNeutralOperation(mov) || isInKindAssetMovement(mov)) return deltas

    // Skip PF SELL cash effect when a paired DEPOSIT handles the cash inflow.
    // settlementMode is set for both 'auto' and 'manual' settlements that create
    // a separate DEPOSIT movement. Legacy PF SELLs without settlementMode still
    // contribute to cash (no paired DEPOSIT exists for those).
    const settlementMode = mov.meta?.fixedDeposit?.settlementMode
    const skipPfSellCash = mov.assetClass === 'pf' && mov.type === 'SELL' && !!settlementMode

    switch (mov.type) {
        case 'DEPOSIT': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'WITHDRAW': {
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'INTEREST':
        case 'DIVIDEND': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'FEE': {
            const fee = resolveFee(mov, tradeCurrency)
            const amount = fee?.amount ?? resolveNetAmount(mov, tradeCurrency, true)
            const currency = fee?.currency ?? tradeCurrency
            deltas.push({ currency, amount: -amount })
            break
        }
        case 'BUY': {
            if (skipPfSellCash) break
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'SELL': {
            if (skipPfSellCash) break

            // Settlement currency override for stablecoin sales (USDT → ARS)
            // When selling stables in Argentina, proceeds are typically ARS not USD fiat.
            const settlementCurrency = mov.meta?.settlementCurrency
            const settlementArs = mov.meta?.settlementArs

            // The old crypto wizard wrote settlementCurrency=ARS for stable
            // sales without recording the actual ARS received. Treating the
            // nominal USD gross as ARS created balances such as ARS 119.31.
            // Invalid legacy metadata is reviewable through the trace helper,
            // but cannot affect cash until a real settlement is supplied.
            if (isStablecoinSale(mov) && settlementCurrency === 'ARS'
                && (!Number.isFinite(settlementArs) || (settlementArs ?? 0) <= 0)) {
                break
            }

            if (settlementCurrency && settlementCurrency !== tradeCurrency) {
                // Use explicit settlement currency and amount
                const amount = (settlementCurrency === 'ARS' && settlementArs != null && Number.isFinite(settlementArs))
                    ? settlementArs
                    : resolveNetAmount(mov, settlementCurrency, false)
                deltas.push({ currency: settlementCurrency, amount })
            } else {
                // Default behavior: credit tradeCurrency (backwards compatible)
                const amount = resolveNetAmount(mov, tradeCurrency, false)
                deltas.push({ currency: tradeCurrency, amount })
            }
            break
        }
        case 'TRANSFER_IN':
        case 'DEBT_ADD': {
            const amount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount })
            break
        }
        case 'TRANSFER_OUT':
        case 'DEBT_PAY': {
            const amount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -amount })
            break
        }
        case 'BUY_USD': {
            const arsAmount = resolveNetAmount(mov, tradeCurrency, true)
            deltas.push({ currency: tradeCurrency, amount: -arsAmount })
            const usdAmount = resolveUsdQuantity(mov)
            if (usdAmount !== 0) {
                deltas.push({ currency: 'USD', amount: usdAmount })
            }
            break
        }
        case 'SELL_USD': {
            const arsAmount = resolveNetAmount(mov, tradeCurrency, false)
            deltas.push({ currency: tradeCurrency, amount: arsAmount })
            const usdAmount = resolveUsdQuantity(mov)
            if (usdAmount !== 0) {
                deltas.push({ currency: 'USD', amount: -usdAmount })
            }
            break
        }
    }

    const fee = resolveFee(mov, tradeCurrency)
    if (fee && fee.currency !== tradeCurrency) {
        deltas.push({ currency: fee.currency, amount: -fee.amount })
    }

    return deltas.filter(delta => Number.isFinite(delta.amount) && Math.abs(delta.amount) > EPSILON)
}

function contributionReason(mov: Movement): CashContributionReason {
    if (mov.meta?.operationKind === 'swap') return 'swap_leg'
    if (mov.meta?.operationKind === 'transfer' || mov.type === 'TRANSFER_IN' || mov.type === 'TRANSFER_OUT') return 'transfer'
    if (mov.meta?.operationKind === 'balance_adjustment') return 'adjustment'
    if (mov.meta?.operationKind === 'fee' || mov.type === 'FEE') return 'fee'
    if (mov.type === 'DEPOSIT' || mov.type === 'INTEREST' || mov.type === 'DIVIDEND') return 'deposit'
    if (mov.type === 'WITHDRAW') return 'withdraw'
    if ((mov.type === 'BUY' || mov.type === 'SELL') && mov.meta?.settlementCurrency) return 'trade_settlement'
    if (mov.type === 'BUY' || mov.type === 'SELL') return 'legacy_trade'
    return 'unknown'
}

function contributionIssue(mov: Movement): CashContributionIssue | undefined {
    if (mov.meta?.operationKind === 'swap') return 'possible_swap_residue'
    if (isStablecoinSale(mov) && mov.meta?.settlementCurrency === 'ARS'
        && (!Number.isFinite(mov.meta?.settlementArs) || (mov.meta?.settlementArs ?? 0) <= 0)) {
        return 'missing_settlement_metadata'
    }
    if (isStablecoinSale(mov) && !mov.meta?.settlementCurrency) return 'legacy_settlement'
    return undefined
}

/**
 * Explain every movement considered for one account/currency. Cash-neutral or
 * invalid legacy rows are kept with amount=0 so a suspicious balance can be
 * audited without mutating history.
 */
export function traceCashBalanceContributions({
    movements,
    accountId,
    currency,
}: {
    movements: Movement[]
    accountId: string
    currency: Currency
}): CashContribution[] {
    const contributions = filterActiveMovements(movements)
        .filter(mov => mov.accountId === accountId)
        .sort((a, b) => a.datetimeISO.localeCompare(b.datetimeISO))
        .flatMap((mov): CashContribution[] => {
            const matching = getMovementCashDeltas(mov).filter(delta => delta.currency === currency)
            const issue = contributionIssue(mov)
            const cashNeutralForCurrency = isExplicitCashNeutralOperation(mov)
                && resolveTradeCurrency(mov) === currency
            const invalidSettlementForCurrency = issue === 'missing_settlement_metadata' && currency === 'ARS'

            if (matching.length === 0 && !cashNeutralForCurrency && !invalidSettlementForCurrency) return []

            const deltas = matching.length > 0 ? matching : [{ currency, amount: 0 }]
            return deltas.map(delta => ({
                movementId: mov.id,
                operationId: mov.meta?.operationId ?? mov.groupId ?? mov.meta?.transferGroupId,
                datetimeISO: mov.datetimeISO,
                type: mov.type,
                assetClass: mov.assetClass,
                symbol: mov.ticker ?? mov.assetName,
                amount: delta.amount,
                currency: delta.currency,
                reason: contributionReason(mov),
                issue,
            }))
        })

    let running = 0
    let minimum = 0
    for (const row of contributions) {
        running += row.amount
        minimum = Math.min(minimum, running)
    }
    if (minimum < 0) {
        contributions.unshift({
            movementId: `opening:${accountId}:${currency}`,
            datetimeISO: contributions[0]?.datetimeISO ?? new Date(0).toISOString(),
            type: 'DEPOSIT',
            amount: -minimum,
            currency,
            reason: 'unknown',
            symbol: 'Saldo inicial inferido',
            synthetic: 'opening_balance',
        })
    }
    return contributions
}

export function computeCashLedger(movements: Movement[]): CashLedgerResult {
    const balances = new Map<string, Map<Currency, number>>()
    const minBalances = new Map<string, Map<Currency, number>>()

    const sorted = filterActiveMovements(movements).sort(
        (a, b) => new Date(a.datetimeISO).getTime() - new Date(b.datetimeISO).getTime()
    )

    for (const mov of sorted) {
        const deltas = getMovementCashDeltas(mov)
        if (deltas.length === 0) continue

        for (const delta of deltas) {
            const accountBalances = ensureAccountMap(balances, mov.accountId)
            const current = accountBalances.get(delta.currency) ?? 0
            const next = current + delta.amount
            accountBalances.set(delta.currency, next)

            const accountMin = ensureAccountMap(minBalances, mov.accountId)
            const prevMin = accountMin.get(delta.currency)
            const nextMin = prevMin === undefined ? Math.min(0, next) : Math.min(prevMin, next)
            accountMin.set(delta.currency, nextMin)
        }
    }

    const openingBalances = new Map<string, Map<Currency, number>>()

    for (const [accountId, accountBalances] of balances) {
        for (const [currency, balance] of accountBalances) {
            const minBalance = minBalances.get(accountId)?.get(currency) ?? 0
            const opening = minBalance < 0 ? -minBalance : 0
            if (opening > 0) {
                const accountOpenings = ensureAccountMap(openingBalances, accountId)
                accountOpenings.set(currency, opening)
                accountBalances.set(currency, balance + opening)
            }
        }
    }

    return { balances, openingBalances }
}

export function computeCashBalances(movements: Movement[]): Map<string, Map<Currency, number>> {
    return computeCashLedger(movements).balances
}
