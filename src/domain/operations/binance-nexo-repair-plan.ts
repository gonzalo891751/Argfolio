import type { Account, Instrument, Movement } from '@/domain/types'
import { computeAverageCost } from '@/domain/portfolio/average-cost'
import { buildCryptoSwapMovements } from './crypto-swap'
import { buildCryptoTransferMovements } from './crypto-transfer'
import { buildCryptoBalanceAdjustmentMovement } from './crypto-balance-adjustment'
import {
    buildRepairPortfolioSnapshot,
    computeCryptoPositionQuantities,
    reconcileCryptoBalances,
    resolveCryptoInstrument,
    resolveRepairAccount,
    type CryptoReconciliationRow,
    type RepairPortfolioSnapshot,
    type TargetCryptoBalance,
} from './crypto-reconciliation'
import { findOperationLegs, isMovementActive } from './operation'

export interface RepairCandidate {
    movement: Movement
    reason: string
    confidence: 'high' | 'medium'
}

export interface LegacyCandidateDetectionOptions {
    accountIds?: string[]
    occurredAtISO?: string
    windowDays?: number
}

export interface RepairPlan {
    id: string
    createdAtISO: string
    mode: 'dry_run'
    confidence: 'high' | 'medium' | 'low'
    warnings: string[]
    candidatesToSupersede: Movement[]
    candidateDetails: RepairCandidate[]
    candidateIdsToSupersede: string[]
    proposedMovements: Movement[]
    before: RepairPortfolioSnapshot
    afterProjected: RepairPortfolioSnapshot
    reconciliationBefore: CryptoReconciliationRow[]
    reconciliationAfter: CryptoReconciliationRow[]
    sourceMovementFingerprint: string
}

export interface BinanceNexoRepairPlanInput {
    movements: Movement[]
    accounts: Account[]
    instruments: Instrument[]
    targets: TargetCryptoBalance[]
    candidateIdsToSupersede?: string[]
    occurredAtISO?: string
    estimatedNexoPriceUsd?: number
}

export const BINANCE_NEXO_VISIBLE_CONVERSIONS = [
    { sourceSymbol: 'USDT', sourceQty: 40.735376, nexoQty: 54.62027067 },
    { sourceSymbol: 'BTC', sourceQty: 0.00079592, nexoQty: 67.02356636 },
    { sourceSymbol: 'BTC', sourceQty: 0.00015993, nexoQty: 13.5 },
    { sourceSymbol: 'BTC', sourceQty: 0.00015907, nexoQty: 13.4694521 },
    { sourceSymbol: 'BTC', sourceQty: 0.00016077, nexoQty: 13.5 },
] as const

export const BINANCE_NEXO_VISIBLE_TOTALS = {
    btcDeposited: 0.01857219,
    btcConsumed: 0.00127569,
    usdtConsumed: 40.735376,
    nexoFromConversions: 162.11328913,
    bnbDeposited: 0.03341429,
} as const

function nearly(value: number | undefined, target: number, absoluteTolerance: number): boolean {
    return value != null && Number.isFinite(value) && Math.abs(value - target) <= absoluteTolerance
}

function isWithinCandidateWindow(
    movement: Movement,
    occurredAtISO: string | undefined,
    windowDays: number,
): boolean {
    if (!occurredAtISO) return true
    const movementMs = new Date(movement.datetimeISO).getTime()
    const repairMs = new Date(occurredAtISO).getTime()
    return Number.isFinite(movementMs)
        && Number.isFinite(repairMs)
        && Math.abs(movementMs - repairMs) <= windowDays * 86400000
}

export function detectBinanceNexoLegacyCandidates(
    movements: Movement[],
    options: LegacyCandidateDetectionOptions = {},
): RepairCandidate[] {
    const candidates: RepairCandidate[] = []
    const allowedAccounts = options.accountIds ? new Set(options.accountIds) : null
    const windowDays = options.windowDays ?? 2

    for (const movement of movements) {
        if (!isMovementActive(movement) || movement.assetClass !== 'crypto') continue
        if (allowedAccounts && !allowedAccounts.has(movement.accountId)) continue
        if (!isWithinCandidateWindow(movement, options.occurredAtISO, windowDays)) continue
        const symbol = (movement.ticker ?? '').toUpperCase()
        const quantity = movement.quantity
        const totalUsd = movement.totalUSD ?? (movement.tradeCurrency === 'USD' ? movement.totalAmount : undefined)

        const btcQtyMatch = nearly(quantity, 0.00127569, 0.00000002)
        const btcTotalMatch = nearly(totalUsd, 80.67, 0.25)
        if (symbol === 'BTC' && movement.type === 'SELL' && (btcQtyMatch || btcTotalMatch)) {
            candidates.push({
                movement,
                reason: 'Coincide con la venta BTC simulada (0.00127569 BTC / ~US$ 80.67).',
                confidence: btcQtyMatch ? 'high' : 'medium',
            })
            continue
        }

        const usdtQtyMatch = nearly(quantity, 80.666981, 0.001)
        const usdtTotalMatch = nearly(totalUsd, 80.67, 0.25)
        if (symbol === 'USDT' && movement.type === 'BUY' && (usdtQtyMatch || usdtTotalMatch)) {
            candidates.push({
                movement,
                reason: 'Coincide con la compra USDT intermedia simulada (~80.666981 USDT).',
                confidence: usdtQtyMatch ? 'high' : 'medium',
            })
            continue
        }

        const nexoQtyMatch = nearly(quantity, 162.11328913, 0.01)
            || nearly(quantity, 162.11301874, 0.01)
        const nexoTotalMatch = nearly(totalUsd, 119.96, 0.5)
        if (symbol === 'NEXO' && movement.type === 'BUY' && (nexoQtyMatch || nexoTotalMatch)) {
            candidates.push({
                movement,
                reason: 'Coincide con la compra NEXO aproximada que debe reemplazarse por swaps trazables.',
                confidence: nexoQtyMatch ? 'high' : 'medium',
            })
        }
    }

    const expandedById = new Map(candidates.map(candidate => [candidate.movement.id, candidate]))
    for (const candidate of candidates) {
        for (const sibling of findOperationLegs(candidate.movement, movements)) {
            if (expandedById.has(sibling.id)) continue
            if (!isMovementActive(sibling) || sibling.assetClass !== 'crypto') continue
            if (allowedAccounts && !allowedAccounts.has(sibling.accountId)) continue
            if (!isWithinCandidateWindow(sibling, options.occurredAtISO, windowDays)) continue
            expandedById.set(sibling.id, {
                movement: sibling,
                reason: `Pata vinculada a ${candidate.movement.id}; revisar el grupo completo antes de reemplazar.`,
                confidence: 'medium',
            })
        }
    }

    return [...expandedById.values()]
        .sort((a, b) => a.movement.datetimeISO.localeCompare(b.movement.datetimeISO))
}

function stableSerialize(value: unknown): string {
    if (value === undefined) return '"__undefined__"'
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

export function computeRepairMovementFingerprint(movements: Movement[]): string {
    const canonical = [...movements]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(stableSerialize)
        .join('\n')

    let hash = 2166136261
    for (let i = 0; i < canonical.length; i += 1) {
        hash ^= canonical.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return `${movements.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function withRepairMetadata(movement: Movement, repairPlanId: string, repairNote?: string): Movement {
    return {
        ...movement,
        source: 'system',
        meta: {
            ...movement.meta,
            repairPlanId,
            repairNote,
        },
    }
}

function isoWithOffset(baseISO: string, offsetMs: number): string {
    return new Date(new Date(baseISO).getTime() + offsetMs).toISOString()
}

function targetFor(
    targets: TargetCryptoBalance[],
    accounts: Account[],
    accountId: string,
    symbol: string,
): number | null {
    const target = targets.find(item => {
        const account = resolveRepairAccount(accounts, item.accountNameOrId)
        return account?.id === accountId && item.symbol.toUpperCase() === symbol.toUpperCase()
    })
    return target?.targetQty ?? null
}

function quantityAt(movements: Movement[], accountId: string, instrumentId: string): number {
    return computeCryptoPositionQuantities(movements).get(`${accountId}::${instrumentId}`) ?? 0
}

function averageCostUsdAt(movements: Movement[], accountId: string, instrumentId: string): number {
    return computeAverageCost(movements.filter(movement =>
        movement.accountId === accountId
        && movement.instrumentId === instrumentId
    )).avgCostUsd
}

function projectedSupersede(movement: Movement, planId: string, nowISO: string): Movement {
    return {
        ...movement,
        meta: {
            ...movement.meta,
            operationStatus: 'superseded',
            supersededByOperationId: planId,
            supersededAtISO: nowISO,
            supersededReason: 'binance_nexo_repair',
        },
    }
}

export function buildBinanceNexoRepairPlan(input: BinanceNexoRepairPlanInput): RepairPlan {
    const createdAtISO = new Date().toISOString()
    const occurredAtISO = input.occurredAtISO ?? createdAtISO
    if (!Number.isFinite(new Date(occurredAtISO).getTime())) {
        throw new Error('La fecha de reconstrucción no es válida.')
    }
    if (input.estimatedNexoPriceUsd != null
        && (!Number.isFinite(input.estimatedNexoPriceUsd) || input.estimatedNexoPriceUsd <= 0)) {
        throw new Error('El precio estimado de NEXO debe ser mayor que cero.')
    }

    const planId = crypto.randomUUID()
    const warnings: string[] = []
    const binance = resolveRepairAccount(input.accounts, 'Binance')
    const nexo = resolveRepairAccount(input.accounts, 'Nexo')
    if (!binance) throw new Error('No se encontró una cuenta cuyo nombre contenga Binance.')
    if (!nexo) throw new Error('No se encontró una cuenta cuyo nombre contenga Nexo.')

    const instruments = new Map<string, Instrument>()
    for (const symbol of ['BTC', 'BNB', 'USDT', 'USDC', 'NEXO']) {
        const instrument = resolveCryptoInstrument(input.instruments, symbol)
        if (!instrument) throw new Error(`Falta el instrumento ${symbol}; crealo antes de generar el dry-run.`)
        instruments.set(symbol, instrument)
    }

    const detectedCandidates = detectBinanceNexoLegacyCandidates(input.movements, {
        accountIds: [binance.id, nexo.id],
        occurredAtISO,
    })
    const detectedIds = new Set(detectedCandidates.map(candidate => candidate.movement.id))
    const selectedIds = input.candidateIdsToSupersede == null
        ? new Set(detectedIds)
        : new Set(input.candidateIdsToSupersede.filter(id => detectedIds.has(id)))

    for (const candidate of detectedCandidates) {
        if (!selectedIds.has(candidate.movement.id)) continue
        const candidateGroupIds = findOperationLegs(candidate.movement, input.movements)
            .map(leg => leg.id)
            .filter(id => detectedIds.has(id))
        if (candidateGroupIds.some(id => !selectedIds.has(id))) {
            warnings.push(
                `Selección parcial del grupo legacy ${candidate.movement.id}; una pata vinculada quedará activa. Revisar antes de aplicar.`,
            )
        }
    }

    const projectedBase = input.movements.map(movement =>
        selectedIds.has(movement.id) ? projectedSupersede(movement, planId, createdAtISO) : movement
    )
    const working = [...projectedBase]
    const proposed: Movement[] = []

    const addProposed = (movements: Movement[], note: string) => {
        for (const movement of movements) {
            const enriched = withRepairMetadata(movement, planId, note)
            proposed.push(enriched)
            working.push(enriched)
        }
    }

    let sequence = 0
    const nextISO = () => isoWithOffset(occurredAtISO, sequence++ * 1000)

    const nexoInstrument = instruments.get('NEXO')!
    const targetNexoQty = targetFor(input.targets, input.accounts, nexo.id, 'NEXO')
    if (targetNexoQty == null) throw new Error('Falta el target Nexo NEXO.')
    const currentNexoQty = quantityAt(working, nexo.id, nexoInstrument.id)
    const missingNexoQty = targetNexoQty - currentNexoQty
    const shouldPlanVisibleConversions = missingNexoQty >= BINANCE_NEXO_VISIBLE_TOTALS.nexoFromConversions - 1

    if (!shouldPlanVisibleConversions && missingNexoQty > 1) {
        warnings.push(
            `Nexo ya contiene ${currentNexoQty} NEXO activos. No se agregaron automáticamente las conversiones visibles para evitar duplicarlas.`,
        )
    }

    const planTransfer = (symbol: 'BTC' | 'BNB' | 'USDT', requestedQty: number, note: string): boolean => {
        if (requestedQty <= 1e-12) return true
        const instrument = instruments.get(symbol)!
        const availableQty = quantityAt(working, binance.id, instrument.id)
        if (availableQty + 1e-10 < requestedQty) {
            warnings.push(
                `Saldo insuficiente en Binance para transferir ${requestedQty} ${symbol}; disponible ${availableQty}. `
                + 'Revisar movimientos previos faltantes o clasificar un ajuste explícito.',
            )
            return false
        }

        const avgCostUsd = averageCostUsdAt(working, binance.id, instrument.id)
        const transfer = buildCryptoTransferMovements({
            fromAccountId: binance.id,
            toAccountId: nexo.id,
            instrumentId: instrument.id,
            symbol,
            assetName: instrument.name,
            sentQty: requestedQty,
            receivedQty: requestedQty,
            availableQty,
            avgCostUsd,
            datetimeISO: nextISO(),
            notes: note,
        })
        addProposed([transfer.out, transfer.in, ...(transfer.fee ? [transfer.fee] : [])], note)
        return true
    }

    const btcInstrument = instruments.get('BTC')!
    const targetNexoBtc = targetFor(input.targets, input.accounts, nexo.id, 'BTC')
    if (targetNexoBtc == null) throw new Error('Falta el target Nexo BTC.')
    const desiredNexoBtcBeforeSwap = targetNexoBtc + (shouldPlanVisibleConversions ? BINANCE_NEXO_VISIBLE_TOTALS.btcConsumed : 0)
    const btcTransferNeeded = Math.max(0, desiredNexoBtcBeforeSwap - quantityAt(working, nexo.id, btcInstrument.id))
    planTransfer('BTC', btcTransferNeeded, 'Reconstrucción de depósitos BTC Binance → Nexo')

    const bnbInstrument = instruments.get('BNB')!
    const targetNexoBnb = targetFor(input.targets, input.accounts, nexo.id, 'BNB')
    if (targetNexoBnb == null) throw new Error('Falta el target Nexo BNB.')
    const bnbTransferNeeded = Math.max(0, targetNexoBnb - quantityAt(working, nexo.id, bnbInstrument.id))
    planTransfer('BNB', bnbTransferNeeded, 'Reconstrucción de depósito BNB Binance → Nexo')

    if (shouldPlanVisibleConversions) {
        const usdtInstrument = instruments.get('USDT')!
        const usdtNeededAtNexo = Math.max(
            0,
            BINANCE_NEXO_VISIBLE_TOTALS.usdtConsumed - quantityAt(working, nexo.id, usdtInstrument.id),
        )
        planTransfer('USDT', usdtNeededAtNexo, 'Fondeo USDT Binance → Nexo para conversión a NEXO')

        const btcAvailable = quantityAt(working, nexo.id, btcInstrument.id)
        const usdtAvailable = quantityAt(working, nexo.id, usdtInstrument.id)
        if (
            btcAvailable + 1e-10 >= BINANCE_NEXO_VISIBLE_TOTALS.btcConsumed
            && usdtAvailable + 1e-8 >= BINANCE_NEXO_VISIBLE_TOTALS.usdtConsumed
        ) {
            const detectedNexoPrice = detectedCandidates
                .map(candidate => candidate.movement)
                .find(movement => (movement.ticker ?? '').toUpperCase() === 'NEXO')
                ?.unitPrice
            const estimatedNexoPriceUsd = input.estimatedNexoPriceUsd
                ?? (detectedNexoPrice && detectedNexoPrice > 0 ? detectedNexoPrice : 0.74)
            warnings.push(
                `Los precios de ejecución BTC→NEXO se estiman con NEXO a US$ ${estimatedNexoPriceUsd.toFixed(4)}. `
                + 'Revisarlos contra el extracto antes de aplicar; afectan costo y PnL realizado.',
            )

            for (const conversion of BINANCE_NEXO_VISIBLE_CONVERSIONS) {
                const sourceInstrument = instruments.get(conversion.sourceSymbol)!
                const sourceAvgCost = averageCostUsdAt(working, nexo.id, sourceInstrument.id)
                const sourcePrice = conversion.sourceSymbol === 'USDT'
                    ? 1
                    : (conversion.nexoQty * estimatedNexoPriceUsd) / conversion.sourceQty
                const swap = buildCryptoSwapMovements({
                    accountId: nexo.id,
                    sources: [{
                        instrumentId: sourceInstrument.id,
                        symbol: conversion.sourceSymbol,
                        assetName: sourceInstrument.name,
                        qty: conversion.sourceQty,
                        priceUsd: sourcePrice,
                        availableQty: quantityAt(working, nexo.id, sourceInstrument.id),
                    }],
                    destination: {
                        instrumentId: nexoInstrument.id,
                        symbol: 'NEXO',
                        assetName: nexoInstrument.name,
                        qty: conversion.nexoQty,
                    },
                    datetimeISO: nextISO(),
                    notes: `Conversión visible ${conversion.sourceQty} ${conversion.sourceSymbol} → ${conversion.nexoQty} NEXO`,
                })
                const sourceLegs = swap.sourceMovements.map(source => ({
                    ...source,
                    meta: {
                        ...source.meta,
                        realizedPnlUsd: source.quantity != null
                            ? source.quantity * ((source.unitPrice ?? 0) - sourceAvgCost)
                            : undefined,
                    },
                }))
                addProposed(
                    [...sourceLegs, swap.destinationMovement],
                    'Conversión reconstruida desde transacciones visibles de Nexo',
                )
            }
        } else {
            warnings.push(
                `No se propusieron swaps: Nexo requiere ${BINANCE_NEXO_VISIBLE_TOTALS.btcConsumed} BTC y `
                + `${BINANCE_NEXO_VISIBLE_TOTALS.usdtConsumed} USDT; proyectado ${btcAvailable} BTC / ${usdtAvailable} USDT.`,
            )
        }
    }

    const nexoDiffAfterConversions = targetNexoQty - quantityAt(working, nexo.id, nexoInstrument.id)
    if (Math.abs(nexoDiffAfterConversions) > 1e-6) {
        if (Math.abs(nexoDiffAfterConversions) <= 1) {
            const nexoAvgCost = averageCostUsdAt(working, nexo.id, nexoInstrument.id)
            const adjustment = buildCryptoBalanceAdjustmentMovement({
                accountId: nexo.id,
                instrumentId: nexoInstrument.id,
                symbol: 'NEXO',
                assetName: nexoInstrument.name,
                diffQty: nexoDiffAfterConversions,
                reason: 'unknown',
                costPolicy: 'preserve_average',
                unitCostUsd: nexoAvgCost || input.estimatedNexoPriceUsd || 0.74,
                datetimeISO: nextISO(),
                note: 'Diferencia NEXO a clasificar (reward, interés, redondeo u otra causa documentada)',
                repairPlanId: planId,
                requiresManualReview: true,
            })
            addProposed([adjustment], 'Ajuste NEXO pendiente de clasificación')
        } else {
            warnings.push(`Diferencia NEXO restante ${nexoDiffAfterConversions}; es demasiado grande para sugerir un ajuste automático.`)
        }
    }

    const usdcInstrument = instruments.get('USDC')!
    const targetNexoUsdc = targetFor(input.targets, input.accounts, nexo.id, 'USDC')
    if (targetNexoUsdc == null) throw new Error('Falta el target Nexo USDC.')
    const usdcDiff = targetNexoUsdc - quantityAt(working, nexo.id, usdcInstrument.id)
    if (Math.abs(usdcDiff) > 1e-6) {
        if (Math.abs(usdcDiff) <= 2) {
            const adjustment = buildCryptoBalanceAdjustmentMovement({
                accountId: nexo.id,
                instrumentId: usdcInstrument.id,
                symbol: 'USDC',
                assetName: usdcInstrument.name,
                diffQty: usdcDiff,
                reason: 'unknown',
                costPolicy: 'preserve_average',
                unitCostUsd: 1,
                datetimeISO: nextISO(),
                note: 'Diferencia USDC a revisar: depósito, transferencia externa o ajuste confirmado',
                repairPlanId: planId,
                requiresManualReview: true,
            })
            addProposed([adjustment], 'Diferencia USDC pendiente de evidencia')
        } else {
            warnings.push(
                `Nexo USDC difiere en ${usdcDiff}. No se creó un ajuste porque supera 2 USDC; requiere revisión manual.`,
            )
        }
    }

    const reconciliationBefore = reconcileCryptoBalances({ ...input, movements: input.movements })
    const reconciliationAfter = reconcileCryptoBalances({ ...input, movements: working })

    for (const row of reconciliationAfter) {
        if (row.status !== 'ok') {
            warnings.push(
                `${row.accountName} ${row.symbol} queda con diferencia proyectada ${row.diffQty}; acción sugerida: ${row.suggestedAction}.`,
            )
        }
    }

    const confidence: RepairPlan['confidence'] = warnings.some(warning =>
        warning.includes('Saldo insuficiente')
        || warning.includes('No se propusieron')
        || warning.includes('Selección parcial')
    )
        ? 'low'
        : detectedCandidates.length > 0
            ? 'high'
            : 'medium'

    return {
        id: planId,
        createdAtISO,
        mode: 'dry_run',
        confidence,
        warnings: [...new Set(warnings)],
        candidatesToSupersede: detectedCandidates.map(candidate => candidate.movement),
        candidateDetails: detectedCandidates,
        candidateIdsToSupersede: [...selectedIds],
        proposedMovements: proposed,
        before: buildRepairPortfolioSnapshot({ ...input, movements: input.movements }),
        afterProjected: buildRepairPortfolioSnapshot({ ...input, movements: working }),
        reconciliationBefore,
        reconciliationAfter,
        sourceMovementFingerprint: computeRepairMovementFingerprint(input.movements),
    }
}
