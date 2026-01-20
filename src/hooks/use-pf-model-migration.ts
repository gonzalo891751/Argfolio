
import { useEffect } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { db } from '@/db'
import type { Movement } from '@/domain/types'

export function usePFModelMigration() {
    const { data: movements } = useMovements()

    useEffect(() => {
        if (!movements) return

        const migrate = async () => {
            const updates: Movement[] = []

            for (const m of movements) {
                let needsUpdate = false
                const updated = { ...m }

                // 1. Normalize PF Movements (Constitute & Redeem)
                if (m.assetClass === 'pf') {
                    // Assign Canonical PF Instrument
                    if (m.instrumentId !== 'pf-instrument') {
                        updated.instrumentId = 'pf-instrument'
                        needsUpdate = true
                    }
                    // Clean up Asset Name (remove "Banco Galicia", use "Plazo Fijo")
                    // Only if it looks like a bank name or is missing, but avoid overwriting specific aliases if user manually set it?
                    // User said: "PF_OPEN shows Activo 'PF / Plazo Fijo' (no 'Banco galicia')"
                    // So we force it.
                    if (updated.assetName !== 'Plazo Fijo') {
                        updated.assetName = 'Plazo Fijo'
                        needsUpdate = true
                    }
                    // Fix Trade Currency
                    if (m.tradeCurrency !== 'ARS') {
                        updated.tradeCurrency = 'ARS'
                        needsUpdate = true
                    }
                    // ... existing logic ...
                    // Fix Inverted Quantity/Price
                    if (updated.quantity === 1 && updated.unitPrice && updated.unitPrice > 1 && updated.totalAmount === updated.unitPrice) {
                        updated.quantity = updated.unitPrice
                        updated.unitPrice = 1
                        needsUpdate = true
                    }

                    // Backfill FixedDepositMeta from legacy 'pf'
                    if (m.pf && !updated.meta?.fixedDeposit) {
                        // Try to reconstruct meta from flat PF fields or PF object
                        // This is best effort.
                        updated.meta = {
                            ...updated.meta,
                            fixedDeposit: {
                                principalARS: m.pf.capitalARS || m.principalARS || 0,
                                interestARS: m.pf.interestARS || m.expectedInterest || 0,
                                totalARS: m.pf.totalToCollectARS || m.expectedTotal || m.totalAmount,
                                tna: m.pf.tna || m.tna || 0,
                                termDays: m.pf.termDays || m.termDays || 30,
                                startDate: m.pf.startAtISO || m.startDate || new Date().toISOString(),
                                maturityDate: m.pf.maturityISO || m.maturityDate || new Date().toISOString(),
                                providerName: m.bank || m.pf.bank,
                                sourcePfMovementId: m.pf.pfId,
                                pfGroupId: m.groupId || `pf:${m.pf.pfId}`
                            }
                        }
                        needsUpdate = true
                    }

                    // Fix Bad FX (MEP=1) for ARS PF
                    if (updated.tradeCurrency === 'ARS' && updated.fxAtTrade === 1) {
                        // Nuke fake FX
                        updated.fxAtTrade = undefined // Let system re-evaluate or leave undefined
                        if (updated.totalUSD && Math.abs(updated.totalUSD - updated.totalARS!) < 1) {
                            // If USD == ARS, it's definitely wrong. Reset to 0 or null to avoid misleading graph.
                            updated.totalUSD = 0
                        }
                        needsUpdate = true
                    }

                    // Backfill groupId/Source
                    if (m.isAuto && !updated.source) {
                        updated.source = 'system'
                        if (m.pf?.pfId && !updated.groupId) {
                            updated.groupId = `pf:${m.pf.pfId}`
                        }
                        needsUpdate = true
                    }
                }

                // 2. Normalize Auto-Settlement Deposits (Cash)
                if ((m.isAuto || m.metadata?.isAutoSettlement) && m.type === 'DEPOSIT') {
                    // Assign Canonical ARS Cash Instrument
                    if (m.instrumentId !== 'ars-cash') {
                        updated.instrumentId = 'ars-cash'
                        needsUpdate = true
                    }
                    // Enforce ARS Currency
                    if (m.tradeCurrency !== 'ARS') {
                        updated.tradeCurrency = 'ARS'
                        needsUpdate = true
                    }
                    // Clean up legacy "Pesos" label if we rely on Instrument Name
                    if (m.assetName) {
                        // We can remove assetName to let UI look up instrument name "Pesos Argentinos"
                        // OR enforce "Pesos Argentinos"
                        if (m.assetName !== 'Pesos Argentinos') {
                            updated.assetName = 'Pesos Argentinos'
                            needsUpdate = true
                        }
                    }
                    // Ensure Price/Total consistency
                    if (updated.unitPrice !== 1) {
                        updated.unitPrice = 1
                        needsUpdate = true
                    }
                    if (updated.totalAmount === undefined && updated.quantity) {
                        updated.totalAmount = updated.quantity
                        needsUpdate = true
                    }
                }

                if (needsUpdate) {
                    updates.push(updated)
                }
            }

            if (updates.length > 0) {
                console.log(`[PFModelMigration] Normalizing ${updates.length} movements...`)
                await db.movements.bulkPut(updates)
                console.log('[PFModelMigration] Complete.')
            }
        }

        migrate()
    }, [movements])
}
