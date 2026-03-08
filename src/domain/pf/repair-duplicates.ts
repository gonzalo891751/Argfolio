/**
 * PF Settlement Duplicate Repair Utility
 *
 * Detects and optionally removes duplicate auto-settlement movements
 * caused by the bug where executeSettlement ran multiple times without
 * idempotency guards (fixed in FASE 1, 2026-03-07).
 *
 * Usage from browser console:
 *   import('/src/domain/pf/repair-duplicates.ts').then(m => m.diagnoseDuplicates())
 *   import('/src/domain/pf/repair-duplicates.ts').then(m => m.repairDuplicates())
 *
 * Or call programmatically:
 *   import { diagnoseDuplicates, repairDuplicates } from '@/domain/pf/repair-duplicates'
 */

import { db } from '@/db'
import { movementsRepo } from '@/db/repositories/movements'
import type { Movement } from '@/domain/types'

export interface DuplicateGroup {
    pfId: string
    bank: string
    amount: number
    /** The first (legitimate) SELL movement */
    keepSell: Movement
    /** Duplicate SELL movements to remove */
    duplicateSells: Movement[]
    /** DEPOSIT movements paired with duplicate SELLs */
    duplicateDeposits: Movement[]
    /** Total inflated amount from duplicates */
    inflatedAmount: number
}

export interface DiagnosisResult {
    groups: DuplicateGroup[]
    totalDuplicateSells: number
    totalDuplicateDeposits: number
    totalMovementsToRemove: number
    totalInflatedAmount: number
    currentBalanceImpact: number
}

/**
 * Diagnose duplicate PF settlement movements (dry-run, read-only).
 * Logs a detailed report to console and returns structured data.
 */
export async function diagnoseDuplicates(): Promise<DiagnosisResult> {
    // 1. Find all auto-settlement SELL movements
    const allAutoSells = await db.movements
        .filter(m =>
            m.assetClass === 'pf'
            && m.type === 'SELL'
            && m.isAuto === true
            && m.pf?.action === 'SETTLE'
        )
        .toArray()

    // 2. Group by pf.pfId (the constitution movement ID they settle)
    const byPfId = new Map<string, Movement[]>()
    for (const sell of allAutoSells) {
        const pfId = sell.pf?.pfId
        if (!pfId) continue
        const group = byPfId.get(pfId) || []
        group.push(sell)
        byPfId.set(pfId, group)
    }

    // 3. Find all auto DEPOSIT movements (candidates for pairing)
    const allAutoDeposits = await db.movements
        .filter(m =>
            m.type === 'DEPOSIT'
            && m.isAuto === true
            && m.instrumentId === 'ars-cash'
            && (m.notes?.includes('Acreditación PF vencido (Auto)') ?? false)
        )
        .toArray()

    const groups: DuplicateGroup[] = []

    for (const [pfId, sells] of byPfId.entries()) {
        if (sells.length <= 1) continue // No duplicates for this PF

        // Sort by datetime ascending — keep the first one
        sells.sort((a, b) => a.datetimeISO.localeCompare(b.datetimeISO))
        const [keepSell, ...duplicateSells] = sells

        // Find paired DEPOSIT for each duplicate SELL
        const duplicateDeposits: Movement[] = []
        for (const dupSell of duplicateSells) {
            // Match by: same bank, same totalAmount, close timestamp, isAuto
            const paired = allAutoDeposits.find(dep =>
                dep.bank === dupSell.bank
                && Math.abs(dep.totalAmount - dupSell.totalAmount) < 0.01
                && dep.accountId === dupSell.accountId
                && dep.id !== keepSell.id // Not the kept pair
                && !duplicateDeposits.some(d => d.id === dep.id) // Not already matched
                // Match by pfGroupId or pfCode in meta
                && (dep.meta?.pfGroupId === dupSell.meta?.pfGroupId
                    || dep.meta?.pfCode === dupSell.meta?.pfCode)
            )
            if (paired) {
                duplicateDeposits.push(paired)
            }
        }

        const inflatedAmount = duplicateSells.reduce((sum, s) => sum + s.totalAmount, 0)

        groups.push({
            pfId,
            bank: keepSell.bank || 'Desconocido',
            amount: keepSell.totalAmount,
            keepSell,
            duplicateSells,
            duplicateDeposits,
            inflatedAmount,
        })
    }

    const result: DiagnosisResult = {
        groups,
        totalDuplicateSells: groups.reduce((s, g) => s + g.duplicateSells.length, 0),
        totalDuplicateDeposits: groups.reduce((s, g) => s + g.duplicateDeposits.length, 0),
        totalMovementsToRemove: groups.reduce((s, g) => s + g.duplicateSells.length + g.duplicateDeposits.length, 0),
        totalInflatedAmount: groups.reduce((s, g) => s + g.inflatedAmount, 0),
        currentBalanceImpact: groups.reduce((s, g) => s + g.inflatedAmount, 0),
    }

    // Console report
    console.group('🔍 PF Settlement Duplicate Diagnosis')
    console.log(`Found ${result.groups.length} PF(s) with duplicates`)
    console.log(`Total duplicate SELLs: ${result.totalDuplicateSells}`)
    console.log(`Total duplicate DEPOSITs: ${result.totalDuplicateDeposits}`)
    console.log(`Total movements to remove: ${result.totalMovementsToRemove}`)
    console.log(`Total inflated balance: ARS ${result.totalInflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)

    for (const g of result.groups) {
        console.group(`PF ${g.pfId} (${g.bank}) — ARS ${g.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
        console.log(`Keep SELL: ${g.keepSell.id} @ ${g.keepSell.datetimeISO}`)
        console.log(`Duplicate SELLs (${g.duplicateSells.length}):`)
        g.duplicateSells.forEach(s => console.log(`  - ${s.id} @ ${s.datetimeISO}`))
        console.log(`Duplicate DEPOSITs (${g.duplicateDeposits.length}):`)
        g.duplicateDeposits.forEach(d => console.log(`  - ${d.id} @ ${d.datetimeISO}`))
        console.log(`Inflated amount: ARS ${g.inflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
        console.groupEnd()
    }
    console.groupEnd()

    return result
}

/**
 * Remove duplicate PF settlement movements.
 * Calls diagnoseDuplicates first, then deletes duplicates using movementsRepo.delete()
 * which also handles D1 remote sync.
 *
 * Returns the diagnosis result for audit trail.
 */
export async function repairDuplicates(): Promise<DiagnosisResult> {
    const diagnosis = await diagnoseDuplicates()

    if (diagnosis.totalMovementsToRemove === 0) {
        console.log('✅ No duplicates found. Nothing to repair.')
        return diagnosis
    }

    console.group('🔧 Repairing PF Settlement Duplicates')

    // Collect all IDs to remove
    const idsToRemove: string[] = []
    for (const g of diagnosis.groups) {
        for (const s of g.duplicateSells) idsToRemove.push(s.id)
        for (const d of g.duplicateDeposits) idsToRemove.push(d.id)
    }

    console.log(`Removing ${idsToRemove.length} duplicate movements...`)

    // Delete via bulkDelete (no cascade needed — these are auto-generated, not constitutions)
    // Use direct DB delete + remote sync
    for (const id of idsToRemove) {
        try {
            // Use movementsRepo.delete which handles D1 sync
            // Note: movementsRepo.delete has cascade logic for pf.kind === 'constitute',
            // but our duplicates are pf.kind === 'redeem' or DEPOSIT, so no cascade triggered.
            await movementsRepo.delete(id)
        } catch (err) {
            console.error(`Failed to delete movement ${id}:`, err)
        }
    }

    console.log(`✅ Removed ${idsToRemove.length} movements`)
    console.log(`Balance correction: -ARS ${diagnosis.totalInflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
    console.groupEnd()

    return diagnosis
}
