import type { Account, Instrument, Movement } from '@/domain/types'
import { isMovementActive } from './operation'

export interface TargetCryptoBalance {
    accountNameOrId: string
    symbol: string
    targetQty: number
    tolerance?: number
}

export interface CryptoReconciliationInput {
    movements: Movement[]
    accounts: Account[]
    instruments: Instrument[]
    targets: TargetCryptoBalance[]
    asOfISO?: string
}

export type CryptoReconciliationStatus = 'ok' | 'needs_increase' | 'needs_decrease'
export type CryptoReconciliationAction =
    | 'none'
    | 'transfer'
    | 'swap'
    | 'fee'
    | 'balance_adjustment'
    | 'manual_review'

export interface CryptoReconciliationRow {
    accountId: string
    accountName: string
    instrumentId: string
    symbol: string
    currentQty: number
    targetQty: number
    diffQty: number
    tolerance: number
    status: CryptoReconciliationStatus
    suggestedAction: CryptoReconciliationAction
}

export interface RepairPortfolioSnapshotRow {
    accountId: string
    accountName: string
    instrumentId: string
    symbol: string
    quantity: number
}

export interface RepairPortfolioSnapshot {
    asOfISO: string
    rows: RepairPortfolioSnapshotRow[]
}

const INCREASE_TYPES = new Set<Movement['type']>([
    'BUY', 'TRANSFER_IN', 'DEPOSIT', 'INTEREST', 'DIVIDEND', 'DEBT_ADD', 'BUY_USD',
])
const DECREASE_TYPES = new Set<Movement['type']>([
    'SELL', 'TRANSFER_OUT', 'WITHDRAW', 'DEBT_PAY', 'SELL_USD',
])

export function defaultCryptoTolerance(symbol: string): number {
    const normalized = symbol.trim().toUpperCase()
    return normalized === 'BTC' || normalized === 'BNB' ? 1e-8 : 1e-6
}

function normalize(value: string): string {
    return value.trim().toLocaleLowerCase('en-US')
}

export function resolveRepairAccount(accounts: Account[], accountNameOrId: string): Account | null {
    const needle = normalize(accountNameOrId)
    return accounts.find(account => normalize(account.id) === needle)
        ?? accounts.find(account => normalize(account.name) === needle)
        ?? accounts.find(account => normalize(account.name).includes(needle))
        ?? null
}

export function resolveCryptoInstrument(instruments: Instrument[], symbol: string): Instrument | null {
    const needle = symbol.trim().toUpperCase()
    return instruments.find(instrument =>
        instrument.symbol.trim().toUpperCase() === needle
        && (instrument.category === 'CRYPTO' || instrument.category === 'STABLE')
    ) ?? null
}

/** Quantity-only position projection, aligned with the holdings engine. */
export function computeCryptoPositionQuantities(
    movements: Movement[],
    asOfISO?: string,
): Map<string, number> {
    const positions = new Map<string, number>()

    const sorted = movements
        .filter(isMovementActive)
        .filter(movement => !asOfISO || movement.datetimeISO <= asOfISO)
        .sort((a, b) => a.datetimeISO.localeCompare(b.datetimeISO))

    for (const movement of sorted) {
        if (!movement.instrumentId) continue
        const quantity = movement.quantity ?? 0
        if (!Number.isFinite(quantity) || quantity <= 0) continue

        const direction = INCREASE_TYPES.has(movement.type)
            ? 1
            : DECREASE_TYPES.has(movement.type)
                ? -1
                : 0
        if (direction === 0) continue

        const key = `${movement.accountId}::${movement.instrumentId}`
        positions.set(key, (positions.get(key) ?? 0) + direction * quantity)
    }

    return positions
}

function roundQuantity(value: number): number {
    return Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12))
}

function suggestAction(
    row: Pick<CryptoReconciliationRow, 'symbol' | 'targetQty' | 'diffQty' | 'tolerance' | 'status'>,
    hasSurplusElsewhere: boolean,
): CryptoReconciliationAction {
    if (row.status === 'ok') return 'none'
    if (hasSurplusElsewhere) return 'transfer'

    const isSmallDifference = Math.abs(row.diffQty) <= Math.max(
        row.tolerance * 100,
        Math.abs(row.targetQty) * 0.001,
    )
    if (isSmallDifference) {
        return row.status === 'needs_decrease' ? 'fee' : 'balance_adjustment'
    }
    if (row.status === 'needs_increase' && row.symbol === 'NEXO') return 'swap'
    return 'manual_review'
}

export function reconcileCryptoBalances(input: CryptoReconciliationInput): CryptoReconciliationRow[] {
    const positions = computeCryptoPositionQuantities(input.movements, input.asOfISO)

    const resolved = input.targets.map(target => {
        if (!Number.isFinite(target.targetQty) || target.targetQty < 0) {
            throw new Error(`Target inválido para ${target.accountNameOrId} ${target.symbol}.`)
        }
        const account = resolveRepairAccount(input.accounts, target.accountNameOrId)
        if (!account) throw new Error(`No se encontró la cuenta "${target.accountNameOrId}".`)
        const instrument = resolveCryptoInstrument(input.instruments, target.symbol)
        if (!instrument) throw new Error(`No se encontró el instrumento cripto ${target.symbol}.`)
        const tolerance = target.tolerance ?? defaultCryptoTolerance(target.symbol)
        const currentQty = roundQuantity(positions.get(`${account.id}::${instrument.id}`) ?? 0)
        const diffQty = roundQuantity(target.targetQty - currentQty)
        const status: CryptoReconciliationStatus = Math.abs(diffQty) <= tolerance
            ? 'ok'
            : diffQty > 0
                ? 'needs_increase'
                : 'needs_decrease'

        return {
            accountId: account.id,
            accountName: account.name,
            instrumentId: instrument.id,
            symbol: instrument.symbol.toUpperCase(),
            currentQty,
            targetQty: target.targetQty,
            diffQty,
            tolerance,
            status,
        }
    })

    return resolved.map(row => {
        const complementaryStatus = row.status === 'needs_increase' ? 'needs_decrease' : 'needs_increase'
        const hasSurplusElsewhere = row.status !== 'ok' && resolved.some(other =>
            other.accountId !== row.accountId
            && other.instrumentId === row.instrumentId
            && other.status === complementaryStatus
            && Math.abs(other.diffQty) > row.tolerance
        )
        return { ...row, suggestedAction: suggestAction(row, hasSurplusElsewhere) }
    })
}

export function buildRepairPortfolioSnapshot(input: Omit<CryptoReconciliationInput, 'targets'>): RepairPortfolioSnapshot {
    const positions = computeCryptoPositionQuantities(input.movements, input.asOfISO)
    const accountById = new Map(input.accounts.map(account => [account.id, account]))
    const instrumentById = new Map(input.instruments.map(instrument => [instrument.id, instrument]))
    const rows: RepairPortfolioSnapshotRow[] = []

    for (const [key, quantityRaw] of positions) {
        const [accountId, instrumentId] = key.split('::')
        const account = accountById.get(accountId)
        const instrument = instrumentById.get(instrumentId)
        if (!account || !instrument) continue
        if (instrument.category !== 'CRYPTO' && instrument.category !== 'STABLE') continue
        const quantity = roundQuantity(quantityRaw)
        if (Math.abs(quantity) <= defaultCryptoTolerance(instrument.symbol)) continue
        rows.push({
            accountId,
            accountName: account.name,
            instrumentId,
            symbol: instrument.symbol.toUpperCase(),
            quantity,
        })
    }

    rows.sort((a, b) => `${a.accountName}:${a.symbol}`.localeCompare(`${b.accountName}:${b.symbol}`))
    return { asOfISO: input.asOfISO ?? new Date().toISOString(), rows }
}
