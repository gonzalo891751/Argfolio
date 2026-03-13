/**
 * PF Settlement Duplicate Detection & Repair
 *
 * Robust detection of duplicate auto-settlement movements.
 * Separates: detection → dry-run report → repair execution.
 *
 * V2 (2026-03-12): Complete rewrite.
 * - Searches ALL PF SELL movements, not just those with specific metadata.
 * - Groups by multiple criteria (pf.pfId, pfGroupId, bank+amount heuristic).
 * - Pairs each SELL with its DEPOSIT for complete group analysis.
 * - Reports per-group and per-account impact before any deletion.
 *
 * Usage from browser console:
 *   window.diagnoseDuplicates()   // dry-run, read-only
 *   window.repairDuplicates()     // diagnose first, then delete duplicates
 */

import { db } from '@/db'
import { movementsRepo } from '@/db/repositories/movements'
import type { Movement } from '@/domain/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DuplicateGroup {
    /** The BUY movement ID (PF constitution) this group relates to */
    constitutionId: string
    /** How the group was identified */
    matchMethod: 'pfId' | 'pfGroupId' | 'bankAmount'
    bank: string
    amount: number
    /** The first (legitimate) SELL movement — kept */
    keepSell: Movement
    /** Its paired DEPOSIT (if found) — kept */
    keepDeposit: Movement | null
    /** Duplicate SELL movements — to remove */
    duplicateSells: Movement[]
    /** DEPOSIT movements paired with duplicate SELLs — to remove */
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
    /** Impact per accountId: { accountId → inflated ARS } */
    impactByAccount: Record<string, number>
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Detection: find ALL PF SELL movements and group them
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds all PF SELL movements in the database (broad search, no metadata assumptions).
 */
async function findAllPfSells(): Promise<Movement[]> {
    return db.movements
        .filter(m => m.assetClass === 'pf' && m.type === 'SELL')
        .toArray()
}

/**
 * Finds all auto-generated DEPOSIT movements that could be paired with PF settlements.
 */
async function findAllAutoDeposits(): Promise<Movement[]> {
    return db.movements
        .filter(m =>
            m.type === 'DEPOSIT' &&
            m.isAuto === true
        )
        .toArray()
}

/**
 * Resolves the "constitution ID" (BUY movement ID) that a SELL relates to.
 * Uses multiple resolution strategies in priority order.
 */
function resolveConstitutionId(sell: Movement): string | null {
    // 1. Explicit pf.pfId linkage (post-fix movements)
    if (sell.pf?.pfId) return sell.pf.pfId

    // 2. Deterministic ID format: "pf-settle-sell:{buyId}"
    if (sell.id.startsWith('pf-settle-sell:')) {
        return sell.id.replace('pf-settle-sell:', '')
    }

    // 3. meta.fixedDeposit.sourcePfMovementId (migration backfill)
    const source = (sell.meta as any)?.fixedDeposit?.sourcePfMovementId
    if (source) return source

    return null
}

/**
 * Groups PF SELLs by their constitution (BUY) movement.
 * Returns a Map for linked SELLs plus an "unlinked" array.
 */
function groupSellsByConstitution(sells: Movement[]): {
    grouped: Map<string, { sells: Movement[]; matchMethod: 'pfId' | 'pfGroupId' | 'bankAmount' }>
    unlinked: Movement[]
} {
    const grouped = new Map<string, { sells: Movement[]; matchMethod: 'pfId' | 'pfGroupId' | 'bankAmount' }>()
    const unlinked: Movement[] = []

    // Pass 1: resolve by explicit linkage
    const remainingAfterPass1: Movement[] = []
    for (const sell of sells) {
        const cid = resolveConstitutionId(sell)
        if (cid) {
            const entry = grouped.get(cid) || { sells: [], matchMethod: 'pfId' as const }
            entry.sells.push(sell)
            grouped.set(cid, entry)
        } else {
            remainingAfterPass1.push(sell)
        }
    }

    // Pass 2: group remaining by pfGroupId
    const remainingAfterPass2: Movement[] = []
    for (const sell of remainingAfterPass1) {
        const gid = sell.meta?.pfGroupId || (sell.meta as any)?.fixedDeposit?.pfGroupId
        if (gid) {
            let matched = false
            for (const [, entry] of grouped) {
                const existingGid = entry.sells[0]?.meta?.pfGroupId ||
                    (entry.sells[0]?.meta as any)?.fixedDeposit?.pfGroupId
                if (existingGid === gid) {
                    entry.sells.push(sell)
                    if (entry.matchMethod === 'pfId') entry.matchMethod = 'pfGroupId'
                    matched = true
                    break
                }
            }
            if (!matched) {
                const entry = grouped.get(`group:${gid}`) || { sells: [], matchMethod: 'pfGroupId' as const }
                entry.sells.push(sell)
                grouped.set(`group:${gid}`, entry)
            }
        } else {
            remainingAfterPass2.push(sell)
        }
    }

    // Pass 3: heuristic — group remaining by bank + approximate amount
    for (const sell of remainingAfterPass2) {
        let matched = false
        for (const [, entry] of grouped) {
            const ref = entry.sells[0]
            if (ref.bank === sell.bank &&
                Math.abs(ref.totalAmount - sell.totalAmount) < 0.01 &&
                ref.accountId === sell.accountId) {
                entry.sells.push(sell)
                if (entry.matchMethod !== 'bankAmount') entry.matchMethod = 'bankAmount'
                matched = true
                break
            }
        }
        if (!matched) {
            unlinked.push(sell)
        }
    }

    return { grouped, unlinked }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Pairing: match each SELL with its DEPOSIT
// ─────────────────────────────────────────────────────────────────────────────

function findPairedDeposit(sell: Movement, allDeposits: Movement[], alreadyMatched: Set<string>): Movement | null {
    // 1. Deterministic ID pairing
    const cid = resolveConstitutionId(sell)
    if (cid) {
        const detDepId = `pf-settle-dep:${cid}`
        const byId = allDeposits.find(d => d.id === detDepId && !alreadyMatched.has(d.id))
        if (byId) return byId
    }

    // 2. Metadata match: same bank, same amount, same account, close timestamp
    const sellTime = new Date(sell.datetimeISO).getTime()
    return allDeposits.find(d => {
        if (alreadyMatched.has(d.id)) return false
        if (d.accountId !== sell.accountId) return false
        if (Math.abs(d.totalAmount - sell.totalAmount) > 0.01) return false
        const depTime = new Date(d.datetimeISO).getTime()
        if (Math.abs(depTime - sellTime) > 60000) return false
        const sellGid = sell.meta?.pfGroupId || (sell.meta as any)?.fixedDeposit?.pfGroupId
        const depGid = d.meta?.pfGroupId || (d.meta as any)?.fixedDeposit?.pfGroupId
        if (sellGid && depGid && sellGid !== depGid) return false
        return true
    }) || null
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Diagnosis (dry-run, read-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diagnose duplicate PF settlement movements (read-only).
 * Returns structured data with per-group and per-account impact.
 */
export async function diagnoseDuplicates(): Promise<DiagnosisResult> {
    const allSells = await findAllPfSells()
    const allDeposits = await findAllAutoDeposits()

    const { grouped, unlinked } = groupSellsByConstitution(allSells)

    const groups: DuplicateGroup[] = []
    const alreadyMatchedDeposits = new Set<string>()

    for (const [constitutionId, entry] of grouped) {
        if (entry.sells.length <= 1) {
            if (entry.sells.length === 1) {
                const dep = findPairedDeposit(entry.sells[0], allDeposits, alreadyMatchedDeposits)
                if (dep) alreadyMatchedDeposits.add(dep.id)
            }
            continue
        }

        // Sort by datetime ascending — keep the first one
        entry.sells.sort((a, b) => a.datetimeISO.localeCompare(b.datetimeISO))

        // Prefer the one with deterministic ID if it exists
        const detIdx = entry.sells.findIndex(s => s.id.startsWith('pf-settle-sell:'))
        const keepIdx = detIdx >= 0 ? detIdx : 0
        const keepSell = entry.sells[keepIdx]
        const duplicateSells = entry.sells.filter((_, i) => i !== keepIdx)

        const keepDeposit = findPairedDeposit(keepSell, allDeposits, alreadyMatchedDeposits)
        if (keepDeposit) alreadyMatchedDeposits.add(keepDeposit.id)

        const duplicateDeposits: Movement[] = []
        for (const dupSell of duplicateSells) {
            const dep = findPairedDeposit(dupSell, allDeposits, alreadyMatchedDeposits)
            if (dep) {
                duplicateDeposits.push(dep)
                alreadyMatchedDeposits.add(dep.id)
            }
        }

        const inflatedAmount = duplicateSells.reduce((sum, s) => sum + s.totalAmount, 0)

        groups.push({
            constitutionId,
            matchMethod: entry.matchMethod,
            bank: keepSell.bank || 'Desconocido',
            amount: keepSell.totalAmount,
            keepSell,
            keepDeposit,
            duplicateSells,
            duplicateDeposits,
            inflatedAmount,
        })
    }

    // Compute impact by account
    const impactByAccount: Record<string, number> = {}
    for (const g of groups) {
        for (const dup of g.duplicateDeposits) {
            const acct = dup.accountId || 'unknown'
            impactByAccount[acct] = (impactByAccount[acct] || 0) + dup.totalAmount
        }
    }

    const result: DiagnosisResult = {
        groups,
        totalDuplicateSells: groups.reduce((s, g) => s + g.duplicateSells.length, 0),
        totalDuplicateDeposits: groups.reduce((s, g) => s + g.duplicateDeposits.length, 0),
        totalMovementsToRemove: groups.reduce((s, g) => s + g.duplicateSells.length + g.duplicateDeposits.length, 0),
        totalInflatedAmount: groups.reduce((s, g) => s + g.inflatedAmount, 0),
        impactByAccount,
    }

    // ── Console report ──
    console.group('🔍 PF Settlement Duplicate Diagnosis (V2)')
    console.log(`Total PF SELL movements found: ${allSells.length}`)
    console.log(`Total auto DEPOSIT movements found: ${allDeposits.length}`)
    console.log(`Unlinked SELLs (no constitution match): ${unlinked.length}`)
    if (unlinked.length > 0) {
        console.log('Unlinked SELL IDs:', unlinked.map(s => s.id))
    }
    console.log(`─────────────────────────────────────`)
    console.log(`PFs with duplicates: ${result.groups.length}`)
    console.log(`Total duplicate SELLs: ${result.totalDuplicateSells}`)
    console.log(`Total duplicate DEPOSITs: ${result.totalDuplicateDeposits}`)
    console.log(`Total movements to remove: ${result.totalMovementsToRemove}`)
    console.log(`Total inflated balance (SELL): ARS ${result.totalInflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)

    for (const g of result.groups) {
        console.group(`PF ${g.constitutionId} (${g.bank}) — via ${g.matchMethod}`)
        console.log(`Settlement amount: ARS ${g.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
        console.log(`✅ Keep SELL: ${g.keepSell.id} @ ${g.keepSell.datetimeISO}`)
        if (g.keepDeposit) {
            console.log(`✅ Keep DEP:  ${g.keepDeposit.id} @ ${g.keepDeposit.datetimeISO}`)
        }
        console.log(`❌ Duplicate SELLs (${g.duplicateSells.length}):`)
        g.duplicateSells.forEach(s => console.log(`   - ${s.id} @ ${s.datetimeISO}`))
        console.log(`❌ Duplicate DEPs (${g.duplicateDeposits.length}):`)
        g.duplicateDeposits.forEach(d => console.log(`   - ${d.id} @ ${d.datetimeISO}`))
        console.log(`Inflated amount: ARS ${g.inflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
        console.groupEnd()
    }

    if (Object.keys(result.impactByAccount).length > 0) {
        console.group('Impact by account')
        for (const [acct, amount] of Object.entries(result.impactByAccount)) {
            console.log(`${acct}: -ARS ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
        }
        console.groupEnd()
    }

    console.groupEnd()

    return result
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Repair (diagnose first, then delete)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove duplicate PF settlement movements.
 * Always runs diagnoseDuplicates() first and logs the full report.
 * Uses movementsRepo.delete() which handles D1 remote sync.
 */
export async function repairDuplicates(): Promise<DiagnosisResult> {
    const diagnosis = await diagnoseDuplicates()

    if (diagnosis.totalMovementsToRemove === 0) {
        console.log('✅ No duplicates found. Nothing to repair.')
        return diagnosis
    }

    console.group('🔧 Repairing PF Settlement Duplicates')

    const idsToRemove: string[] = []
    for (const g of diagnosis.groups) {
        for (const s of g.duplicateSells) idsToRemove.push(s.id)
        for (const d of g.duplicateDeposits) idsToRemove.push(d.id)
    }

    console.log(`Removing ${idsToRemove.length} duplicate movements...`)
    console.log('IDs:', idsToRemove)

    let removed = 0
    for (const id of idsToRemove) {
        try {
            await movementsRepo.delete(id)
            removed++
        } catch (err) {
            console.error(`Failed to delete movement ${id}:`, err)
        }
    }

    console.log(`✅ Removed ${removed}/${idsToRemove.length} movements`)
    console.log(`Balance correction: -ARS ${diagnosis.totalInflatedAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
    console.groupEnd()

    return diagnosis
}

// Exposed via window.loadRepairTools() in app-layout.tsx (lazy, not side-effect)
