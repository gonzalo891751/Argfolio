import { useState, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown, Plus, Building2, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Account, AccountKind } from '@/domain/types'
import { useCreateAccount } from '@/hooks/use-instruments'
import { useToast } from '@/components/ui/toast'

interface AccountSelectCreatableProps {
    value: string
    onChange: (accountId: string) => void
    accounts: Account[]
    placeholder?: string
    className?: string
}

export function AccountSelectCreatable({
    value,
    onChange,
    accounts,
    placeholder = 'Seleccionar o crear cuenta...',
    className,
}: AccountSelectCreatableProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()
    const createAccount = useCreateAccount()

    // Find selected account object
    const selectedAccount = accounts.find((a) => a.id === value)

    // Sync search with selected value label ONLY if not open (so we don't overwrite user typing)
    // But actually, for a combobox, usually we want to see the name.
    // If we want "Creatable", we treat search as the main input.
    
    // Better pattern: Input shows search text. 
    // If selected, input shows name.
    useEffect(() => {
        if (selectedAccount && !open) {
            setSearch(selectedAccount.name)
        } else if (!value && !open) {
            setSearch('')
        }
    }, [selectedAccount, value, open])

    // Filter accounts
    const filteredAccounts = accounts.filter((account) =>
        account.name.toLowerCase().includes(search.toLowerCase())
    )

    // Check if exact match exists
    const exactMatch = accounts.find(
        (a) => a.name.toLowerCase() === search.toLowerCase()
    )

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
                // Revert search to selected value if no change
                if (selectedAccount) {
                    setSearch(selectedAccount.name)
                } else if (!value) {
                    setSearch('')
                }
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [selectedAccount, value])

    const handleSelect = (account: Account) => {
        onChange(account.id)
        setSearch(account.name)
        setOpen(false)
    }

    const handleCreate = async () => {
        if (!search.trim()) return

        try {
            // Heuristic for Kind based on name keywords
            const nameLower = search.toLowerCase()
            let kind: AccountKind = 'BANK' // Default per requirement
            
            if (nameLower.includes('binance') || nameLower.includes('cocos') || nameLower.includes('iol') || nameLower.includes('balanz')) {
                kind = 'BROKER'
            } else if (nameLower.includes('lemon') || nameLower.includes('buenbit') || nameLower.includes('fiwind') || nameLower.includes('belo')) {
                kind = 'EXCHANGE'
            } else if (nameLower.includes('efectivo') || nameLower.includes('caja') || nameLower.includes('colchon')) {
                kind = 'WALLET'
            }

            const newAccount: Account = {
                id: crypto.randomUUID(),
                name: search.trim(),
                kind,
                defaultCurrency: 'ARS',
            }

            await createAccount.mutateAsync(newAccount)
            
            toast({
                title: 'Cuenta creada',
                description: `Se creó "${newAccount.name}" correctamente.`,
            })

            onChange(newAccount.id)
            setOpen(false)
        } catch (error) {
            console.error('Failed to create account', error)
            toast({
                title: 'Error',
                description: 'No se pudo crear la cuenta.',
                variant: 'error',
            })
        }
    }

    return (
        <div ref={containerRef} className={cn('relative', className)}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {selectedAccount ? (
                        <Building2 className="h-4 w-4 text-indigo-400" />
                    ) : (
                        <Wallet className="h-4 w-4 text-slate-500" />
                    )}
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setOpen(true)
                        // If user clears input, clear selection
                        if (e.target.value === '') {
                            onChange('') 
                        }
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder={placeholder}
                    className="input-base w-full rounded-lg pl-9 pr-8 py-3 text-white placeholder-slate-500"
                    autoComplete="off"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronsUpDown className="h-4 w-4 text-slate-500" />
                </div>
            </div>

            {open && (
                <div className="absolute z-50 w-full mt-1 bg-[#1E293B] border border-white/10 rounded-lg shadow-xl max-h-60 overflow-auto animate-in fade-in zoom-in-95 duration-100">
                    <ul className="py-1 text-sm text-slate-300">
                        {filteredAccounts.map((account) => (
                            <li
                                key={account.id}
                                onClick={() => handleSelect(account)}
                                className={cn(
                                    "px-4 py-2 hover:bg-white/5 cursor-pointer flex items-center justify-between transition",
                                    value === account.id && "bg-indigo-500/10 text-indigo-300"
                                )}
                            >
                                <span className="font-medium">{account.name}</span>
                                {value === account.id && <Check className="h-4 w-4" />}
                            </li>
                        ))}
                        
                        {filteredAccounts.length === 0 && !exactMatch && search.trim().length > 0 && (
                            <li
                                onClick={handleCreate}
                                className="px-4 py-2 hover:bg-emerald-500/10 text-emerald-400 cursor-pointer flex items-center gap-2 transition border-t border-white/5"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="font-medium">Crear "{search}"</span>
                            </li>
                        )}

                        {filteredAccounts.length === 0 && search.trim().length === 0 && (
                            <li className="px-4 py-3 text-slate-500 text-center italic text-xs">
                                Escribí para buscar o crear...
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}
