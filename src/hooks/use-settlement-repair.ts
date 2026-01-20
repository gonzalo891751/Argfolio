
import { useEffect } from 'react'
import { useMovements } from '@/hooks/use-movements'
import { db } from '@/db'
import type { Movement } from '@/domain/types'

export function useSettlementRepair() {
    const { data: movements } = useMovements()

    useEffect(() => {
        if (!movements) return

        const repair = async () => {
            const updates: Movement[] = []

            for (const m of movements) {
                // Check for Auto-Settlement movements
                if (m.isAuto || m.metadata?.isAutoSettlement) {
                    let needsUpdate = false
                    const updated = { ...m }

                    // Fix Cash Deposit
                    if (m.type === 'DEPOSIT') {
                        // Fix Missing Currency
                        if (!m.tradeCurrency) {
                            updated.tradeCurrency = 'ARS'
                            needsUpdate = true
                        }
                        // Fix to Canonical ARS Asset
                        if (m.instrumentId !== 'ars-cash') {
                            updated.instrumentId = 'ars-cash'
                            needsUpdate = true
                        }
                        // Fix Asset Name (fallback)
                        if (!m.assetName) {
                            updated.assetName = 'Pesos Argentinos'
                            needsUpdate = true
                        }
                        // Fix Missing Total Amount (if strictly missing, though quantity might exist)
                        if (m.totalAmount === undefined && m.quantity) {
                            updated.totalAmount = m.quantity
                            needsUpdate = true
                        }
                        // Fix Price
                        if (!m.unitPrice) {
                            updated.unitPrice = 1
                            needsUpdate = true
                        }
                    }

                    // Fix PF Settle
                    if (m.type === 'SELL' && m.assetClass === 'pf') {
                        if (!m.assetName) {
                            updated.assetName = 'Plazo Fijo'
                            needsUpdate = true
                        }
                        // Fix Missing Currency
                        if (!m.tradeCurrency) {
                            updated.tradeCurrency = 'ARS'
                            needsUpdate = true
                        }
                    }

                    if (needsUpdate) {
                        updates.push(updated)
                    }
                }
            }

            if (updates.length > 0) {
                console.log(`[SettlementRepair] Fixing ${updates.length} invalid auto-settlement movements...`)
                await db.movements.bulkPut(updates)
                console.log('[SettlementRepair] Repair complete.')
            }
        }

        repair()
    }, [movements])
}
