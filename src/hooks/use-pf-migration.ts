import { useEffect, useState } from 'react'
import { db } from '@/db'
import { useMovements } from '@/hooks/use-movements'
import { useAccounts } from '@/hooks/use-instruments'
import { useToast } from '@/components/ui/toast'

export function usePFMigration() {
    const { data: movements } = useMovements()
    const { data: accounts } = useAccounts()
    const { toast } = useToast()
    const [processed, setProcessed] = useState(false)

    useEffect(() => {
        if (!movements || !accounts || processed) return

        const migrate = async () => {
            const pfMovements = movements.filter(m => m.assetClass === 'pf' && !m.accountId)

            if (pfMovements.length === 0) {
                setProcessed(true)
                return
            }

            console.group('PF Migration')
            console.log(`Found ${pfMovements.length} PFs without accountId`)

            let updatedCount = 0

            for (const pf of pfMovements) {
                // Heuristic Parsing
                let targetAccount = null

                // 1. Check Bank String against Account Name
                if (pf.bank) {
                    targetAccount = accounts.find(a =>
                        a.name.toLowerCase().includes(pf.bank!.toLowerCase()) ||
                        pf.bank!.toLowerCase().includes(a.name.toLowerCase())
                    )
                }

                // 2. Check "Naranja X" specific (common case)
                if (!targetAccount) {
                    const text = (pf.bank + ' ' + pf.alias + ' ' + pf.notes).toLowerCase()
                    if (text.includes('naranja') || text.includes('nx') || text.includes('frascos')) {
                        targetAccount = accounts.find(a => a.name.toLowerCase().includes('naranja') || a.name.toLowerCase().includes('nx'))
                    }
                }

                // 3. Fallback: First Bank-type account (dangerous? maybe only if single bank exists)
                // Skip fallback for safety, user can edit manually if needed or we fix wizard now.

                if (targetAccount) {
                    console.log(`Migrating PF ${pf.id} (${pf.bank}) -> ${targetAccount.name}`)

                    // Update DB directly
                    await db.movements.update(pf.id, {
                        accountId: targetAccount.id,
                        bank: targetAccount.name // Normalize bank name
                    })
                    updatedCount++
                } else {
                    console.warn(`Could not match account for PF ${pf.id} (${pf.bank})`)
                }
            }

            console.groupEnd()

            if (updatedCount > 0) {
                toast({
                    title: 'Migración de Plazos Fijos',
                    description: `Se asignaron ${updatedCount} PFs a sus cuentas correspondientes.`,
                })
            }

            setProcessed(true)
        }

        migrate()
    }, [movements, accounts, processed, toast])
}
