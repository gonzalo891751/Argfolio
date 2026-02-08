import { useState, useMemo, useEffect, useRef } from 'react'
import { ArrowLeftRight, ArrowDown, ChevronDown, Zap, Calendar, MessageSquare, Check } from 'lucide-react'
import { WizardFooter } from '../ui/WizardFooter'
import { cn } from '@/lib/utils'
import type { Movement, Currency, Account, Instrument } from '@/domain/types'
import { AccountSelectCreatable } from '../AccountSelectCreatable'
import { useCreateMovement } from '@/hooks/use-movements'
import { useCreateInstrument } from '@/hooks/use-instruments'
import { useToast } from '@/components/ui/toast'
import { useQueryClient } from '@tanstack/react-query'
import { computeCashBalances } from '@/domain/portfolio/cash-ledger'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import { computeTEA } from '@/domain/yield/accrual'
import { db } from '@/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type WalletMode = 'income' | 'expense' | 'transfer'

interface WalletWizardState {
    mode: WalletMode
    step: 1 | 2 | 3
    datetime: string
    accountId: string
    toAccountId: string
    currency: Currency
    amount: string
    note: string
    isRemunerada: boolean
    tna: number
    adjustmentMode: boolean
    realBalance: string
}

interface WalletCashWizardProps {
    accounts: Account[]
    movements: Movement[]
    instruments: Instrument[]
    onClose: () => void
    onBackToAssetType?: () => void
    onStepChange?: (step: number) => void
}

// ---------------------------------------------------------------------------
// Theme config
// ---------------------------------------------------------------------------
interface ThemeConfig {
    color: string
    bg: string
    bgLight: string
    text: string
    border: string
    label: string
}

const THEMES: Record<WalletMode, ThemeConfig> = {
    income:   { color: '#6366f1', bg: 'bg-[#6366f1]', bgLight: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500', label: 'Ingreso' },
    expense:  { color: '#f43f5e', bg: 'bg-[#f43f5e]', bgLight: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500', label: 'Egreso' },
    transfer: { color: '#0ea5e9', bg: 'bg-[#0ea5e9]', bgLight: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500', label: 'Transferencia' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatMoney(amount: number, currency: Currency): string {
    if (currency === 'ARS') return formatMoneyARS(amount)
    if (currency === 'USD') return formatMoneyUSD(amount)
    // USDT / other
    return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getAccountBalances(
    accountId: string,
    balancesMap: Map<string, Map<Currency, number>>
): Map<Currency, number> {
    return balancesMap.get(accountId) ?? new Map()
}

function hasPositiveBalance(accountId: string, balancesMap: Map<string, Map<Currency, number>>): boolean {
    const bals = balancesMap.get(accountId)
    if (!bals) return false
    for (const v of bals.values()) {
        if (v > 0.01) return true
    }
    return false
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function WalletCashWizard({ accounts, movements, instruments, onClose, onBackToAssetType, onStepChange }: WalletCashWizardProps) {
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const amountInputRef = useRef<HTMLInputElement>(null)
    const [shaking, setShaking] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

    const [state, setState] = useState<WalletWizardState>({
        mode: 'income',
        step: 1,
        datetime: now.toISOString().slice(0, 16),
        accountId: '',
        toAccountId: '',
        currency: 'ARS',
        amount: '',
        note: '',
        isRemunerada: false,
        tna: 0,
        adjustmentMode: false,
        realBalance: '',
    })

    // Compute all cash balances once
    const balancesMap = useMemo(() => computeCashBalances(movements), [movements])

    // Balances for selected origin account
    const originBalances = useMemo(
        () => getAccountBalances(state.accountId, balancesMap),
        [state.accountId, balancesMap]
    )

    // Balances for selected destination account (transfer)
    const destBalances = useMemo(
        () => getAccountBalances(state.toAccountId, balancesMap),
        [state.toAccountId, balancesMap]
    )

    // Accounts filtered for Egreso/Transfer (only with positive balance)
    const filteredAccounts = useMemo(() => {
        if (state.mode === 'income') return accounts
        return accounts.filter(a => hasPositiveBalance(a.id, balancesMap))
    }, [accounts, balancesMap, state.mode])

    // Currencies available for step 2
    const availableCurrencies = useMemo((): Currency[] => {
        if (state.mode === 'income') {
            // Show currencies the account already has, plus ARS as default
            const set = new Set<Currency>(['ARS'])
            for (const [c] of originBalances) set.add(c)
            return Array.from(set)
        }
        // Egreso / Transfer: only currencies with balance > 0
        const result: Currency[] = []
        for (const [c, v] of originBalances) {
            if (v > 0.01) result.push(c)
        }
        return result.length > 0 ? result : ['ARS']
    }, [state.mode, originBalances])

    // Available balance for current currency
    const availableBalance = useMemo(() => {
        return originBalances.get(state.currency) ?? 0
    }, [originBalances, state.currency])

    // Parsed amount
    const parsedAmount = useMemo(() => {
        const v = parseFloat(state.amount)
        return Number.isFinite(v) && v > 0 ? v : 0
    }, [state.amount])

    // Auto-select first valid currency when changing account or mode
    useEffect(() => {
        if (!availableCurrencies.includes(state.currency)) {
            setState(s => ({ ...s, currency: availableCurrencies[0] || 'ARS', amount: '', adjustmentMode: false, realBalance: '' }))
        }
    }, [availableCurrencies, state.currency])

    // Load remunerada state when account changes
    useEffect(() => {
        if (!state.accountId) return
        const acc = accounts.find(a => a.id === state.accountId)
        if (acc) {
            setState(s => ({
                ...s,
                isRemunerada: acc.cashYield?.enabled ?? false,
                tna: acc.cashYield?.tna ?? 0,
            }))
        }
    }, [state.accountId, accounts])

    // Focus amount input on step 2
    useEffect(() => {
        if (state.step === 2) {
            setTimeout(() => amountInputRef.current?.focus(), 100)
        }
    }, [state.step])

    // ------ VALIDATION ------
    const isStep1Valid = useMemo(() => {
        if (!state.accountId) return false
        if (state.mode === 'transfer') {
            return !!state.toAccountId && state.accountId !== state.toAccountId
        }
        return true
    }, [state.accountId, state.toAccountId, state.mode])

    const isStep2Valid = useMemo(() => {
        if (parsedAmount <= 0) return false
        if (state.mode !== 'income' && parsedAmount > availableBalance + 0.001) return false
        return true
    }, [parsedAmount, state.mode, availableBalance])

    const isCurrentStepValid = state.step === 1 ? isStep1Valid : state.step === 2 ? isStep2Valid : true

    // ------ ACTIONS ------
    const setMode = (mode: WalletMode) => {
        setState(s => {
            // Reset account if current account has no balance and switching to expense/transfer
            let accountId = s.accountId
            if (mode !== 'income' && accountId) {
                if (!hasPositiveBalance(accountId, balancesMap)) accountId = ''
            }
            return { ...s, mode, step: 1, accountId, toAccountId: '', amount: '', currency: 'ARS', adjustmentMode: false, realBalance: '' }
        })
    }

    const nextStep = () => {
        if (state.step < 3) setState(s => ({ ...s, step: (s.step + 1) as 1 | 2 | 3 }))
        else handleConfirm()
    }

    const prevStep = () => {
        if (state.step > 1) setState(s => ({ ...s, step: (s.step - 1) as 1 | 2 | 3 }))
    }

    // Sync step to parent for unified stepper
    useEffect(() => { onStepChange?.(state.step) }, [state.step])

    const setAmountPercentage = (pct: number) => {
        const val = (availableBalance * pct).toFixed(2)
        setState(s => ({ ...s, amount: val }))
    }

    const handleAmountChange = (val: string) => {
        setState(s => ({ ...s, amount: val }))
        // Shake if exceeds balance
        const parsed = parseFloat(val)
        if (state.mode !== 'income' && Number.isFinite(parsed) && parsed > availableBalance + 0.001) {
            setShaking(true)
            setTimeout(() => setShaking(false), 820)
        }
    }

    const calculateAdjustment = (realStr: string) => {
        setState(s => ({ ...s, realBalance: realStr }))
        const real = parseFloat(realStr)
        if (!Number.isFinite(real)) return
        if (real < availableBalance) {
            const diff = (availableBalance - real).toFixed(2)
            setState(s => ({ ...s, amount: diff }))
        }
        // If real > system, we show a message in the UI but don't auto-set
    }

    const switchToIncome = (diff: number) => {
        setState(s => ({
            ...s,
            mode: 'income',
            amount: diff.toFixed(2),
            adjustmentMode: false,
            realBalance: '',
        }))
    }

    // ------ PERSISTENCE ------
    const resolveInstrumentId = async (currency: Currency): Promise<string> => {
        const symbol = currency
        const cat = currency === 'ARS' ? 'ARS_CASH' : 'USD_CASH'
        const existing = instruments.find(i => i.symbol === symbol && i.category === cat)
        if (existing) return existing.id

        const newInst: Instrument = {
            id: symbol,
            symbol,
            name: currency === 'ARS' ? 'Pesos Argentinos' : (currency === 'USD' ? 'Dólares Estadounidenses' : symbol),
            category: cat as any,
            nativeCurrency: currency,
            priceKey: symbol.toLowerCase(),
        }
        await (createInstrument as any).mutateAsync(newInst)
        return symbol
    }

    const handleConfirm = async () => {
        if (submitting) return
        setSubmitting(true)

        try {
            const amount = parsedAmount
            if (amount <= 0) throw new Error('Monto inválido')

            // Egreso/Transfer: hard validation
            if (state.mode !== 'income' && amount > availableBalance + 0.001) {
                toast({ title: 'Error', description: `El monto excede el saldo disponible (${formatMoney(availableBalance, state.currency)}).`, variant: 'error' })
                setSubmitting(false)
                return
            }

            const instrumentId = await resolveInstrumentId(state.currency)
            const datetimeISO = new Date(state.datetime).toISOString()
            const currencyLabel = state.currency === 'ARS' ? 'Pesos' : (state.currency === 'USD' ? 'Dólares' : state.currency)

            if (state.mode === 'income') {
                const mov: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'DEPOSIT',
                    assetClass: 'wallet',
                    instrumentId,
                    accountId: state.accountId,
                    ticker: state.currency,
                    assetName: currencyLabel,
                    quantity: amount,
                    unitPrice: 1,
                    tradeCurrency: state.currency,
                    totalAmount: amount,
                    netAmount: amount,
                    notes: state.note || undefined,
                }
                await createMovement.mutateAsync(mov)

                // Update cashYield if changed
                const acc = accounts.find(a => a.id === state.accountId)
                if (acc) {
                    const needsUpdate = (acc.cashYield?.enabled !== state.isRemunerada) || (state.isRemunerada && acc.cashYield?.tna !== state.tna)
                    if (needsUpdate) {
                        await db.accounts.update(state.accountId, {
                            cashYield: {
                                enabled: state.isRemunerada,
                                tna: state.tna || 0,
                                currency: state.currency,
                                compounding: 'DAILY' as const,
                                lastAccruedDate: acc.cashYield?.lastAccruedDate || new Date().toISOString().slice(0, 10),
                            },
                        })
                    }
                }

                toast({ title: 'Ingreso registrado', description: `Se acreditaron ${formatMoney(amount, state.currency)} en tu cuenta.` })

            } else if (state.mode === 'expense') {
                const mov: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'WITHDRAW',
                    assetClass: 'wallet',
                    instrumentId,
                    accountId: state.accountId,
                    ticker: state.currency,
                    assetName: currencyLabel,
                    quantity: amount,
                    unitPrice: 1,
                    tradeCurrency: state.currency,
                    totalAmount: amount,
                    netAmount: amount,
                    notes: state.note || undefined,
                }
                await createMovement.mutateAsync(mov)
                toast({ title: 'Egreso registrado', description: `Se debitaron ${formatMoney(amount, state.currency)} de tu cuenta.` })

            } else {
                // Transfer - atomic 2 movements
                const groupId = crypto.randomUUID()
                const originAccount = accounts.find(a => a.id === state.accountId)
                const destAccount = accounts.find(a => a.id === state.toAccountId)

                const movOut: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'TRANSFER_OUT',
                    assetClass: 'wallet',
                    instrumentId,
                    accountId: state.accountId,
                    ticker: state.currency,
                    assetName: currencyLabel,
                    quantity: amount,
                    unitPrice: 1,
                    tradeCurrency: state.currency,
                    totalAmount: amount,
                    netAmount: amount,
                    notes: state.note || undefined,
                    groupId,
                    meta: {
                        transferGroupId: groupId,
                        counterpartyAccountId: state.toAccountId,
                        direction: 'out' as const,
                    },
                }
                const movIn: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'TRANSFER_IN',
                    assetClass: 'wallet',
                    instrumentId,
                    accountId: state.toAccountId,
                    ticker: state.currency,
                    assetName: currencyLabel,
                    quantity: amount,
                    unitPrice: 1,
                    tradeCurrency: state.currency,
                    totalAmount: amount,
                    netAmount: amount,
                    notes: state.note || undefined,
                    groupId,
                    meta: {
                        transferGroupId: groupId,
                        counterpartyAccountId: state.accountId,
                        direction: 'in' as const,
                    },
                }

                // Atomic write via Dexie transaction
                await db.transaction('rw', db.movements, async () => {
                    await db.movements.bulkAdd([movOut, movIn])
                })

                // Manual invalidation (since we bypassed the hook)
                queryClient.invalidateQueries({ queryKey: ['movements'] })
                queryClient.invalidateQueries({ queryKey: ['portfolio'] })

                toast({
                    title: 'Transferencia registrada',
                    description: `${formatMoney(amount, state.currency)} de ${originAccount?.name ?? 'Origen'} a ${destAccount?.name ?? 'Destino'}.`,
                })
            }

            onClose()
        } catch (error) {
            console.error('WalletCashWizard: Failed to save', error)
            toast({ title: 'Error al guardar', description: 'No se pudo registrar el movimiento. Intentá nuevamente.', variant: 'error' })
        } finally {
            setSubmitting(false)
        }
    }

    // ------ RENDER ------
    const theme = THEMES[state.mode]
    const originAccount = accounts.find(a => a.id === state.accountId)
    const destAccount = accounts.find(a => a.id === state.toAccountId)

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Controls + Stepper */}
            <div className="px-6 pt-4 pb-2 shrink-0">
                {/* Type Selector */}
                <div className="flex p-1 bg-slate-950/50 rounded-lg border border-white/5 mb-6 max-w-md mx-auto relative">
                    {/* Sliding indicator */}
                    <div
                        className="absolute h-[calc(100%-8px)] top-1 rounded-md transition-all duration-300 ease-out shadow-lg"
                        style={{
                            backgroundColor: theme.color,
                            width: '33.33%',
                            left: state.mode === 'income' ? '4px' : state.mode === 'expense' ? '33.33%' : 'calc(66.66% - 4px)',
                        }}
                    />
                    <button
                        onClick={() => setMode('income')}
                        className={cn('relative z-10 flex-1 py-1.5 text-sm font-medium text-center rounded-md transition-colors duration-200', state.mode === 'income' ? 'text-white' : 'text-slate-400 hover:text-white')}
                    >
                        Ingreso
                    </button>
                    <button
                        onClick={() => setMode('expense')}
                        className={cn('relative z-10 flex-1 py-1.5 text-sm font-medium text-center rounded-md transition-colors duration-200', state.mode === 'expense' ? 'text-white' : 'text-slate-400 hover:text-white')}
                    >
                        Egreso
                    </button>
                    <button
                        onClick={() => setMode('transfer')}
                        className={cn('relative z-10 flex-1 py-1.5 text-sm font-medium text-center rounded-md transition-colors duration-200 flex items-center justify-center gap-1.5', state.mode === 'transfer' ? 'text-white' : 'text-slate-400 hover:text-white')}
                    >
                        <span>Transferencia</span>
                        <ArrowLeftRight className="w-3.5 h-3.5 opacity-70" />
                    </button>
                </div>

            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {state.step === 1 && <Step1Datos state={state} setState={setState} filteredAccounts={filteredAccounts} accounts={accounts} originBalances={originBalances} destBalances={destBalances} theme={theme} />}
                {state.step === 2 && (
                    <Step2Monto
                        state={state}
                        setState={setState}
                        availableCurrencies={availableCurrencies}
                        availableBalance={availableBalance}
                        parsedAmount={parsedAmount}
                        theme={theme}
                        amountInputRef={amountInputRef}
                        shaking={shaking}
                        onAmountChange={handleAmountChange}
                        onPercentage={setAmountPercentage}
                        onAdjustment={calculateAdjustment}
                        onSwitchToIncome={switchToIncome}
                    />
                )}
                {state.step === 3 && (
                    <Step3Confirm
                        state={state}
                        originAccount={originAccount}
                        destAccount={destAccount}
                        originBalances={originBalances}
                        destBalances={destBalances}
                        parsedAmount={parsedAmount}
                        theme={theme}
                    />
                )}
            </div>

            {/* Footer */}
            <WizardFooter
                onBack={state.step > 1 ? prevStep : (onBackToAssetType ?? onClose)}
                onCancel={onClose}
                primaryLabel={state.step < 3 ? 'Siguiente' : 'Confirmar'}
                onPrimary={nextStep}
                primaryVariant={state.step < 3 ? 'indigo' : 'emerald'}
                primaryDisabled={!isCurrentStepValid || submitting}
                primaryLoading={submitting}
            />
        </div>
    )
}

// ===========================================================================
// Step 1 — Datos
// ===========================================================================
function Step1Datos({
    state, setState, filteredAccounts, accounts, originBalances, destBalances, theme,
}: {
    state: WalletWizardState
    setState: React.Dispatch<React.SetStateAction<WalletWizardState>>
    filteredAccounts: Account[]
    accounts: Account[]
    originBalances: Map<Currency, number>
    destBalances: Map<Currency, number>
    theme: ThemeConfig
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Date — always full width */}
            <div className="space-y-2">
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Fecha y Hora</label>
                <input
                    type="datetime-local"
                    value={state.datetime}
                    onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                    className="input-base w-full md:max-w-xs rounded-lg px-4 py-3 text-sm font-mono text-white bg-slate-950 border border-white/10 focus:border-[var(--active-color)] focus:ring-1 focus:ring-[var(--active-color)] outline-none"
                    style={{ '--active-color': theme.color } as React.CSSProperties}
                />
            </div>

            {/* Transfer: side-by-side Desde / Hacia */}
            {state.mode === 'transfer' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
                        {/* Desde (Origen) */}
                        <div className="space-y-2 relative z-50">
                            <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Desde (Origen)</label>
                            <AccountSelectCreatable
                                value={state.accountId}
                                onChange={val => setState(s => ({ ...s, accountId: val, amount: '', adjustmentMode: false, realBalance: '' }))}
                                accounts={filteredAccounts}
                                placeholder="Buscar cuenta..."
                            />
                            {!state.accountId && filteredAccounts.length > 0 && (
                                <p className="text-[10px] text-slate-500 mt-1">Solo cuentas con saldo positivo.</p>
                            )}
                            {filteredAccounts.length === 0 && (
                                <p className="text-xs text-rose-400/80 mt-1">No tenés cuentas con saldo disponible para transferir.</p>
                            )}
                            <BalanceChips balances={originBalances} />
                        </div>

                        {/* Arrow indicator (center) */}
                        <div className="hidden md:flex items-center justify-center pt-7">
                            <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sky-400 shadow-lg">
                                <ArrowLeftRight className="w-5 h-5" />
                            </div>
                        </div>
                        {/* Mobile-only arrow (stacked) */}
                        <div className="flex md:hidden items-center justify-center py-1">
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sky-400">
                                <ArrowDown className="w-4 h-4" />
                            </div>
                        </div>

                        {/* Hacia (Destino) */}
                        <div className="space-y-2 relative z-40">
                            <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Hacia (Destino)</label>
                            <AccountSelectCreatable
                                value={state.toAccountId}
                                onChange={val => setState(s => ({ ...s, toAccountId: val }))}
                                accounts={accounts}
                                placeholder="Buscar cuenta destino..."
                            />
                            <BalanceChips balances={destBalances} />
                        </div>
                    </div>
                    {state.accountId && state.toAccountId && state.accountId === state.toAccountId && (
                        <p className="text-xs text-rose-400 text-center">Origen y destino no pueden ser la misma cuenta.</p>
                    )}
                </>
            ) : (
                <>
                    {/* Non-transfer: Account selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Cuenta</label>
                        <AccountSelectCreatable
                            value={state.accountId}
                            onChange={val => setState(s => ({ ...s, accountId: val, amount: '', adjustmentMode: false, realBalance: '' }))}
                            accounts={filteredAccounts}
                            placeholder="Buscar cuenta..."
                        />
                        {state.mode === 'expense' && !state.accountId && filteredAccounts.length > 0 && (
                            <p className="text-[10px] text-slate-500 mt-1">Solo mostramos cuentas con saldo positivo.</p>
                        )}
                        {state.mode === 'expense' && filteredAccounts.length === 0 && (
                            <p className="text-xs text-rose-400/80 mt-1">No tenés cuentas con saldo disponible para realizar un egreso.</p>
                        )}
                        <BalanceChips balances={originBalances} />
                    </div>
                </>
            )}

            {/* Ingreso: Cuenta remunerada */}
            {state.mode === 'income' && state.accountId && (() => {
                const acc = accounts.find(a => a.id === state.accountId)
                if (!acc || (acc.kind !== 'BANK' && acc.kind !== 'WALLET')) return null
                return (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                            <div
                                className={cn('w-5 h-5 rounded border flex items-center justify-center transition-colors cursor-pointer', state.isRemunerada ? 'bg-indigo-500 border-indigo-500' : 'bg-transparent border-slate-500')}
                                onClick={() => setState(s => ({ ...s, isRemunerada: !s.isRemunerada }))}
                            >
                                {state.isRemunerada && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <label className="text-sm text-indigo-200 select-none cursor-pointer" onClick={() => setState(s => ({ ...s, isRemunerada: !s.isRemunerada }))}>
                                Marcar como cuenta remunerada
                            </label>
                        </div>
                        {state.isRemunerada && (
                            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 animate-in fade-in duration-300">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">TNA %</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={state.tna || ''}
                                            onChange={e => setState(s => ({ ...s, tna: parseFloat(e.target.value) || 0 }))}
                                            placeholder="0"
                                            className="input-base w-full rounded-lg pl-3 pr-8 py-2 text-white text-sm bg-slate-950 border border-white/10 outline-none"
                                        />
                                        <span className="absolute right-3 top-2 text-slate-500 text-xs font-bold">%</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">TEA (Estimada)</label>
                                    <div className="h-[38px] flex items-center px-3 rounded-lg bg-slate-900/50 border border-slate-700/50 text-emerald-400 font-mono text-sm">
                                        {state.tna > 0 ? `${(computeTEA(state.tna) * 100).toFixed(2)}%` : '—'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })()}
        </div>
    )
}

// ===========================================================================
// Step 2 — Monto
// ===========================================================================
function Step2Monto({
    state, setState, availableCurrencies, availableBalance, parsedAmount, theme, amountInputRef, shaking, onAmountChange, onPercentage, onAdjustment, onSwitchToIncome,
}: {
    state: WalletWizardState
    setState: React.Dispatch<React.SetStateAction<WalletWizardState>>
    availableCurrencies: Currency[]
    availableBalance: number
    parsedAmount: number
    theme: ThemeConfig
    amountInputRef: React.RefObject<HTMLInputElement>
    shaking: boolean
    onAmountChange: (val: string) => void
    onPercentage: (pct: number) => void
    onAdjustment: (val: string) => void
    onSwitchToIncome: (diff: number) => void
}) {
    const exceeds = state.mode !== 'income' && parsedAmount > availableBalance + 0.001

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-[rgba(30,41,59,0.6)] backdrop-blur-[16px] border border-white/[0.08] p-6 rounded-xl shadow-xl">
                {/* Currency */}
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 block">Moneda</label>
                <div className="flex gap-2 mb-6">
                    {availableCurrencies.map(curr => (
                        <button
                            key={curr}
                            onClick={() => setState(s => ({ ...s, currency: curr, amount: '', adjustmentMode: false, realBalance: '' }))}
                            className={cn(
                                'px-4 py-2 rounded-lg text-sm font-bold font-mono border transition',
                                state.currency === curr
                                    ? `${theme.bgLight} ${theme.border} ${theme.text}`
                                    : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                            )}
                        >
                            {curr}
                        </button>
                    ))}
                </div>

                {/* Amount */}
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-2 block">Monto del movimiento</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl font-mono">$</span>
                    <input
                        ref={amountInputRef}
                        type="number"
                        value={state.amount}
                        onChange={e => onAmountChange(e.target.value)}
                        placeholder="0.00"
                        className={cn(
                            'w-full pl-10 pr-4 py-4 rounded-lg font-mono text-3xl font-bold tracking-tight bg-slate-950 placeholder-slate-700 outline-none transition-all',
                            'border focus:ring-2',
                            exceeds ? 'border-rose-500 text-rose-400 focus:ring-rose-500' : 'border-white/10 text-white',
                        )}
                        style={{
                            '--tw-ring-color': exceeds ? undefined : theme.color,
                            ...(shaking ? { animation: 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both' } : {}),
                        } as React.CSSProperties}
                    />
                </div>

                {/* Quick actions */}
                {state.mode !== 'income' && (
                    <div className="flex gap-2 mt-3">
                        {[{ label: '25%', pct: 0.25 }, { label: '50%', pct: 0.5 }, { label: 'MAX', pct: 1 }].map(({ label, pct }) => (
                            <button
                                key={label}
                                onClick={() => onPercentage(pct)}
                                className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-white border border-white/5 transition"
                            >
                                {label}
                            </button>
                        ))}
                        <span className="ml-auto text-xs font-mono text-slate-500 pt-1">
                            Disponible: {formatMoney(availableBalance, state.currency)}
                        </span>
                    </div>
                )}

                {/* Note */}
                <div className="mt-6 space-y-2">
                    <label className="text-xs font-mono text-slate-400 uppercase tracking-wider">Nota (Opcional)</label>
                    <input
                        type="text"
                        value={state.note}
                        onChange={e => setState(s => ({ ...s, note: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg text-sm bg-slate-950 border border-white/10 text-white placeholder-slate-600 outline-none focus:border-white/20"
                        placeholder="Ej: Compra supermercado, Ahorro..."
                    />
                </div>
            </div>

            {/* Transfer info note */}
            {state.mode === 'transfer' && (
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg flex gap-3 text-sky-200 text-xs">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p>Se crearán 2 movimientos enlazados: un egreso en la cuenta origen y un ingreso en la cuenta destino.</p>
                </div>
            )}

            {/* Ajuste Rápido (Egreso only) */}
            {state.mode === 'expense' && (
                <div className="border-t border-white/5 pt-6">
                    <button
                        onClick={() => setState(s => ({ ...s, adjustmentMode: !s.adjustmentMode }))}
                        className="flex items-center justify-between w-full text-left group"
                    >
                        <div>
                            <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                <Zap className="w-4 h-4 text-indigo-400" />
                                Ajuste Rápido
                            </h4>
                            <p className="text-xs text-slate-400 mt-1">Calculá el egreso ingresando el saldo que ves en tu banco.</p>
                        </div>
                        <ChevronDown className={cn('w-5 h-5 text-slate-500 transition', state.adjustmentMode && 'rotate-180')} />
                    </button>

                    {state.adjustmentMode && (
                        <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-white/10 animate-in fade-in duration-300">
                            <label className="text-xs font-mono text-slate-400 uppercase">Saldo Actual (Real)</label>
                            <div className="relative mt-2">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono">$</span>
                                <input
                                    type="number"
                                    value={state.realBalance}
                                    onChange={e => onAdjustment(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full pl-8 pr-4 py-3 rounded-lg font-mono text-lg bg-slate-950 border border-white/10 text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                            <AdjustmentFeedback
                                realBalance={state.realBalance}
                                systemBalance={availableBalance}
                                currency={state.currency}
                                onSwitchToIncome={onSwitchToIncome}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ===========================================================================
// Step 3 — Confirm
// ===========================================================================
function Step3Confirm({
    state, originAccount, destAccount, originBalances, destBalances, parsedAmount, theme,
}: {
    state: WalletWizardState
    originAccount?: Account
    destAccount?: Account
    originBalances: Map<Currency, number>
    destBalances: Map<Currency, number>
    parsedAmount: number
    theme: ThemeConfig
}) {
    const currentOrigin = originBalances.get(state.currency) ?? 0
    const currentDest = destBalances.get(state.currency) ?? 0

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="text-center mb-6">
                <p className="text-slate-400 text-sm mb-1">Vas a registrar un</p>
                <h3 className="font-display text-3xl font-bold text-white capitalize">{theme.label}</h3>
                <div
                    className={cn('mt-2 inline-block px-4 py-1 rounded-full font-mono text-lg font-bold', theme.bgLight, theme.text)}
                    style={{ borderColor: theme.color, borderWidth: 1 }}
                >
                    {formatMoney(parsedAmount, state.currency)}
                </div>
            </div>

            {/* Balance Impact Cards */}
            {state.mode === 'transfer' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <BalanceCard title="Sale de" account={originAccount} current={currentOrigin} future={currentOrigin - parsedAmount} currency={state.currency} isAdding={false} />
                        <BalanceCard title="Entra en" account={destAccount} current={currentDest} future={currentDest + parsedAmount} currency={state.currency} isAdding={true} />
                    </div>
                    <div className="flex justify-center my-2">
                        <div className="bg-slate-800 rounded-full p-2 border border-white/10">
                            <ArrowLeftRight className="w-6 h-6 text-sky-400" />
                        </div>
                    </div>
                </>
            ) : (
                <BalanceCard
                    title={state.mode === 'income' ? 'Cuenta Destino' : 'Cuenta Origen'}
                    account={originAccount}
                    current={currentOrigin}
                    future={state.mode === 'income' ? currentOrigin + parsedAmount : currentOrigin - parsedAmount}
                    currency={state.currency}
                    isAdding={state.mode === 'income'}
                />
            )}

            {/* Meta */}
            <div className="flex gap-4 text-xs text-slate-500 justify-center flex-wrap">
                <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(state.datetime).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {state.note && (
                    <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        "{state.note}"
                    </span>
                )}
            </div>
        </div>
    )
}

// ===========================================================================
// Sub-components
// ===========================================================================

function BalanceChips({ balances }: { balances: Map<Currency, number> }) {
    if (balances.size === 0) return null
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {Array.from(balances.entries()).map(([curr, val]) => (
                <span key={curr} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-white/10 text-slate-300">
                    <span className="text-slate-500 mr-1">{curr}</span>
                    {val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            ))}
        </div>
    )
}

function BalanceCard({
    title, account, current, future, currency, isAdding,
}: {
    title: string
    account?: Account
    current: number
    future: number
    currency: Currency
    isAdding: boolean
}) {
    return (
        <div className="bg-slate-950/50 p-4 rounded-xl border border-white/10">
            <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">{title}</div>
            <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
                <span className="font-medium text-white">{account?.name ?? 'Cuenta'}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">Saldo {isAdding ? 'final' : 'restante'}</span>
                <div className="text-right">
                    <span className="text-slate-300 line-through mr-2 opacity-50">{formatMoney(current, currency)}</span>
                    <span className={isAdding ? 'text-emerald-400' : 'text-rose-400'}>{formatMoney(future, currency)}</span>
                </div>
            </div>
        </div>
    )
}

function AdjustmentFeedback({
    realBalance, systemBalance, currency, onSwitchToIncome,
}: {
    realBalance: string
    systemBalance: number
    currency: Currency
    onSwitchToIncome: (diff: number) => void
}) {
    const real = parseFloat(realBalance)
    if (!Number.isFinite(real) || realBalance === '') return null

    if (real > systemBalance) {
        const diff = real - systemBalance
        return (
            <div className="mt-3 text-xs">
                <div className="text-rose-400 flex items-start gap-2 bg-rose-500/10 p-2 rounded">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span>Tu saldo es mayor al del sistema. Esto debería ser un <b>Ingreso</b> de {formatMoney(diff, currency)}.</span>
                </div>
                <button
                    onClick={() => onSwitchToIncome(diff)}
                    className="mt-2 text-indigo-400 underline hover:text-white transition text-xs"
                >
                    Cambiar a Ingreso y precargar
                </button>
            </div>
        )
    }

    const diff = systemBalance - real
    return (
        <div className="mt-3 text-xs text-emerald-400">
            Egreso calculado: {formatMoney(diff, currency)}
        </div>
    )
}
