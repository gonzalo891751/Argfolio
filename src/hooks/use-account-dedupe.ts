
import { useEffect, useState } from 'react'
import { db } from '@/db'
import { useAccounts } from '@/hooks/use-instruments'
import { useMovements } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'

export function useAccountMigration() {
    const { data: accounts } = useAccounts()
    const { data: movements } = useMovements()
    const { toast } = useToast()
    const [processed, setProcessed] = useState(false)

    useEffect(() => {
        if (!accounts || !movements || processed) return

        const runMigration = async () => {
            console.group('Account & Movement Migration')
            let changesMade = 0

            // 1. Dedupe Accounts
            // Group by normalized name
            const normalizedMap = new Map<string, typeof accounts>()
            const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

            for (const acc of accounts) {
                const key = normalize(acc.name)
                if (!normalizedMap.has(key)) normalizedMap.set(key, [])
                normalizedMap.get(key)!.push(acc)
            }

            for (const [name, dupes] of normalizedMap.entries()) {
                if (dupes.length > 1) {
                    console.log(`Found duplicates for "${name}":`, dupes)

                    // Canonical: First created or first in list? Logic: First ID usually oldest? 
                    // Let's pick the one with most details? For now, pick the first one.
                    // Ideally we should check which one is used, but accounts are just shells usually.
                    const canonical = dupes[0]
                    const duplicates = dupes.slice(1)

                    changesMade += duplicates.length

                    for (const dupe of duplicates) {
                        // Remap movements
                        const affectedMovements = movements.filter(m => m.accountId === dupe.id)
                        if (affectedMovements.length > 0) {
                            console.log(`Remapping ${affectedMovements.length} movements from ${dupe.id} to ${canonical.id}`)
                            for (const m of affectedMovements) {
                                await db.movements.update(m.id, {
                                    accountId: canonical.id,
                                    bank: canonical.name // update denormalized name too
                                })
                            }
                        }
                        // Delete duplicate account
                        await db.accounts.delete(dupe.id)
                    }
                }
            }

            // 2. Backfill Missing Account IDs (Legacy Movements)
            const orphanedMovements = movements.filter(m => !m.accountId)

            if (orphanedMovements.length > 0) {
                console.log(`Found ${orphanedMovements.length} movements without Account ID`)

                for (const m of orphanedMovements) {
                    // Try to match based on bank/ticker/notes
                    let targetAccount = null
                    const searchTerms = [m.bank, m.ticker, m.assetName, m.notes].filter(Boolean).map(s => normalize(s!))

                    // Helper to find account by name match
                    const findAccount = (term: string) => accounts.find(a => normalize(a.name).includes(term) || term.includes(normalize(a.name)))

                    // Specific heuristics
                    if (searchTerms.some(t => t.includes('naranja') || t.includes('nx') || t.includes('frascos'))) {
                        targetAccount = accounts.find(a => normalize(a.name).includes('naranja'))
                    } else if (m.bank) {
                        targetAccount = findAccount(normalize(m.bank))
                    }

                    if (targetAccount) {
                        await db.movements.update(m.id, {
                            accountId: targetAccount.id,
                            bank: targetAccount.name
                        })
                        changesMade++
                    }
                }
            }

            console.groupEnd()

            if (changesMade > 0) {
                toast({
                    title: 'Mantenimiento de Cuentas',
                    description: `Se unificaron cuentas y corrigieron ${changesMade} registros.`,
                })
            }

            setProcessed(true)
        }

        runMigration()
    }, [accounts, movements, processed, toast])
}
