import type { Currency, Movement } from '@/domain/types'

export type ResultsFlowRubroKey = 'wallets' | 'plazos' | 'cedears' | 'crypto' | 'fci'

export interface ResultsFlowValue {
    ars: number
    usdEq: number
}

export interface ResultsFlowFxContext {
    officialSell: number
    mepSell: number
    cryptoSell: number
}

const FLOW_RUBROS: ResultsFlowRubroKey[] = ['wallets', 'plazos', 'cedears', 'crypto', 'fci']
const TRANSFER_PAIR_MAX_MS = 5 * 60 * 1000
const EPSILON = 1e-6

interface TransferCandidate {
    id: string
    type: 'TRANSFER_IN' | 'TRANSFER_OUT'
    accountId: string
    currency: Currency
    amountNative: number
    datetimeMs: number
    groupKey?: string
}

function toDateKey(value: string): string | null {
    if (!value) return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return date.toISOString().slice(0, 10)
}

function isInExclusiveRange(dateKey: string, fromISO: string, toISO: string): boolean {
    return dateKey > fromISO && dateKey <= toISO
}

function createEmptyFlowMap(): Map<ResultsFlowRubroKey, ResultsFlowValue> {
    const map = new Map<ResultsFlowRubroKey, ResultsFlowValue>()
    for (const rubro of FLOW_RUBROS) {
        map.set(rubro, { ars: 0, usdEq: 0 })
    }
    return map
}

function safeRate(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0
}

function resolveFallbackRate(movement: Movement, fxContext: ResultsFlowFxContext): number {
    if (movement.assetClass === 'crypto') {
        return safeRate(fxContext.cryptoSell) || safeRate(fxContext.mepSell) || safeRate(fxContext.officialSell) || 1
    }
    if (movement.assetClass === 'cedear') {
        return safeRate(fxContext.mepSell) || safeRate(fxContext.officialSell) || safeRate(fxContext.cryptoSell) || 1
    }
    return safeRate(fxContext.officialSell) || safeRate(fxContext.mepSell) || safeRate(fxContext.cryptoSell) || 1
}

function resolveMovementFxRate(movement: Movement, fxContext: ResultsFlowFxContext): number {
    const fromSnapshot = safeRate(movement.fx?.rate ?? 0)
    if (fromSnapshot > 0) return fromSnapshot

    const fromTrade = safeRate(movement.fxAtTrade ?? 0)
    if (fromTrade > 0) return fromTrade

    const fromTotals = (
        Number.isFinite(movement.totalARS) &&
        Number.isFinite(movement.totalUSD) &&
        (movement.totalUSD ?? 0) > EPSILON
    )
        ? (movement.totalARS ?? 0) / (movement.totalUSD ?? 1)
        : 0
    if (safeRate(fromTotals) > 0) return fromTotals

    return resolveFallbackRate(movement, fxContext)
}

function resolveAmountNative(movement: Movement, explicitAmount?: number): number {
    if (Number.isFinite(explicitAmount)) return Math.abs(explicitAmount ?? 0)
    if (Number.isFinite(movement.totalAmount)) return Math.abs(movement.totalAmount)
    if (Number.isFinite(movement.quantity) && Number.isFinite(movement.unitPrice)) {
        return Math.abs((movement.quantity ?? 0) * (movement.unitPrice ?? 0))
    }
    if (movement.tradeCurrency === 'ARS' && Number.isFinite(movement.totalARS)) return Math.abs(movement.totalARS ?? 0)
    if ((movement.tradeCurrency === 'USD' || movement.tradeCurrency === 'USDT' || movement.tradeCurrency === 'USDC') && Number.isFinite(movement.totalUSD)) {
        return Math.abs(movement.totalUSD ?? 0)
    }
    return 0
}

function convertAmount(currency: Currency, amountNative: number, rate: number): ResultsFlowValue {
    const safeAmount = Number.isFinite(amountNative) ? Math.abs(amountNative) : 0
    const safeFx = safeRate(rate) || 1

    if (currency === 'ARS') {
        return {
            ars: safeAmount,
            usdEq: safeAmount / safeFx,
        }
    }

    if (currency === 'USD' || currency === 'USDT' || currency === 'USDC') {
        return {
            ars: safeAmount * safeFx,
            usdEq: safeAmount,
        }
    }

    return {
        ars: safeAmount,
        usdEq: safeAmount / safeFx,
    }
}

export function convertMovementAmountToArsUsdEq(
    movement: Movement,
    fxContext: ResultsFlowFxContext,
    explicitAmount?: number,
): ResultsFlowValue {
    const amountNative = resolveAmountNative(movement, explicitAmount)
    const rate = resolveMovementFxRate(movement, fxContext)
    return convertAmount(movement.tradeCurrency, amountNative, rate)
}

function amountTolerance(currency: Currency, amount: number): number {
    const base = currency === 'ARS' ? 0.5 : 0.0001
    return Math.max(base, Math.abs(amount) * 0.0005)
}

function tryPairTransfers(
    outs: TransferCandidate[],
    ins: TransferCandidate[],
    matched: Set<string>,
    maxTimeDiffMs: number,
): void {
    const availableIns = ins
        .filter((candidate) => !matched.has(candidate.id))
        .sort((a, b) => a.datetimeMs - b.datetimeMs)
    const usedIn = new Set<string>()

    for (const out of outs.filter((candidate) => !matched.has(candidate.id)).sort((a, b) => a.datetimeMs - b.datetimeMs)) {
        let best: TransferCandidate | null = null
        let bestDelta = Number.POSITIVE_INFINITY

        for (const candidate of availableIns) {
            if (usedIn.has(candidate.id)) continue
            if (candidate.currency !== out.currency) continue
            if (candidate.accountId === out.accountId) continue

            const amountDiff = Math.abs(candidate.amountNative - out.amountNative)
            const tolerance = amountTolerance(out.currency, out.amountNative)
            if (amountDiff > tolerance) continue

            const timeDiff = Math.abs(candidate.datetimeMs - out.datetimeMs)
            if (timeDiff > maxTimeDiffMs) continue

            if (timeDiff < bestDelta) {
                best = candidate
                bestDelta = timeDiff
            }
        }

        if (!best) continue

        usedIn.add(best.id)
        matched.add(out.id)
        matched.add(best.id)
    }
}

function collectPairedTransferIds(
    movements: Movement[],
    fromISO: string,
    toISO: string,
): Set<string> {
    const candidates: TransferCandidate[] = []

    for (const movement of movements) {
        if (movement.type !== 'TRANSFER_IN' && movement.type !== 'TRANSFER_OUT') continue

        const dateKey = toDateKey(movement.datetimeISO)
        if (!dateKey || !isInExclusiveRange(dateKey, fromISO, toISO)) continue

        const datetimeMs = new Date(movement.datetimeISO).getTime()
        if (!Number.isFinite(datetimeMs)) continue

        const amountNative = resolveAmountNative(movement)
        if (amountNative <= EPSILON) continue

        const groupKey = movement.meta?.transferGroupId || movement.groupId

        candidates.push({
            id: movement.id,
            type: movement.type,
            accountId: movement.accountId,
            currency: movement.tradeCurrency,
            amountNative,
            datetimeMs,
            groupKey,
        })
    }

    const matched = new Set<string>()

    const byGroup = new Map<string, { ins: TransferCandidate[]; outs: TransferCandidate[] }>()
    for (const candidate of candidates) {
        if (!candidate.groupKey) continue
        const group = byGroup.get(candidate.groupKey) ?? { ins: [], outs: [] }
        if (candidate.type === 'TRANSFER_IN') group.ins.push(candidate)
        if (candidate.type === 'TRANSFER_OUT') group.outs.push(candidate)
        byGroup.set(candidate.groupKey, group)
    }

    for (const group of byGroup.values()) {
        if (group.ins.length === 0 || group.outs.length === 0) continue
        tryPairTransfers(group.outs, group.ins, matched, Number.POSITIVE_INFINITY)
    }

    const remainingIns = candidates.filter((candidate) => candidate.type === 'TRANSFER_IN' && !matched.has(candidate.id))
    const remainingOuts = candidates.filter((candidate) => candidate.type === 'TRANSFER_OUT' && !matched.has(candidate.id))
    tryPairTransfers(remainingOuts, remainingIns, matched, TRANSFER_PAIR_MAX_MS)

    return matched
}

function isExternalWalletFlow(movement: Movement): boolean {
    if (!movement.assetClass) return true
    return movement.assetClass === 'wallet' || movement.assetClass === 'currency'
}

function classifyTradeRubro(movement: Movement): ResultsFlowRubroKey | null {
    switch (movement.assetClass) {
        case 'cedear':
            return 'cedears'
        case 'crypto':
            return 'crypto'
        case 'fci':
            return 'fci'
        case 'pf':
            return 'plazos'
        default:
            return null
    }
}

function addFlow(
    target: Map<ResultsFlowRubroKey, ResultsFlowValue>,
    rubro: ResultsFlowRubroKey,
    sign: 1 | -1,
    value: ResultsFlowValue,
): void {
    const current = target.get(rubro)
    if (!current) return
    current.ars += sign * value.ars
    current.usdEq += sign * value.usdEq
}

export function computeNetFlowsByRubro(
    movements: Movement[],
    fxContext: ResultsFlowFxContext,
    fromISO: string,
    toISO: string,
): Map<ResultsFlowRubroKey, ResultsFlowValue> {
    const result = createEmptyFlowMap()
    if (!Array.isArray(movements) || movements.length === 0) return result
    if (!fromISO || !toISO || fromISO >= toISO) return result

    const pairedTransfers = collectPairedTransferIds(movements, fromISO, toISO)

    for (const movement of movements) {
        const dateKey = toDateKey(movement.datetimeISO)
        if (!dateKey || !isInExclusiveRange(dateKey, fromISO, toISO)) continue

        if (pairedTransfers.has(movement.id)) continue

        if (movement.type === 'DEPOSIT' || movement.type === 'WITHDRAW') {
            if (!isExternalWalletFlow(movement)) continue
            const value = convertMovementAmountToArsUsdEq(movement, fxContext)
            const sign: 1 | -1 = movement.type === 'DEPOSIT' ? 1 : -1
            addFlow(result, 'wallets', sign, value)
            continue
        }

        if (movement.type === 'TRANSFER_IN' || movement.type === 'TRANSFER_OUT') {
            const value = convertMovementAmountToArsUsdEq(movement, fxContext)
            const sign: 1 | -1 = movement.type === 'TRANSFER_IN' ? 1 : -1
            addFlow(result, 'wallets', sign, value)
            continue
        }

        if (movement.type === 'BUY' || movement.type === 'SELL') {
            const targetRubro = classifyTradeRubro(movement)
            if (!targetRubro || targetRubro === 'wallets') continue

            const value = convertMovementAmountToArsUsdEq(movement, fxContext)
            const tradeSign: 1 | -1 = movement.type === 'BUY' ? 1 : -1
            addFlow(result, targetRubro, tradeSign, value)
            addFlow(result, 'wallets', tradeSign === 1 ? -1 : 1, value)
            continue
        }

        // BUY_USD / SELL_USD and performance movements are not net flow for results.
    }

    return result
}

