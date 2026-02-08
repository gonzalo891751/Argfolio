/**
 * FCI Buy/Sell Wizard
 *
 * Sub-wizard for Fondos Comunes de Inversión, delegated from MovementWizard
 * when assetClass === 'fci' at step >= 2.
 *
 * Buy mode:  Standard flow – any FCI from market, any account.
 * Sell mode: Filtered by holdings – only accounts/funds with qty > 0,
 *            bidirectional qty/total inputs, atomic SELL + DEPOSIT.
 */

import { useState, useMemo, useEffect } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Movement, Currency, Account, Instrument, MovementType, MovementFee } from '@/domain/types'
import { FciTypeahead, generateFciSlug } from '../FciTypeahead'
import type { FciValue } from '../FciTypeahead'
import type { FciFund } from '@/domain/fci/types'
import { AccountSelectCreatable } from '../AccountSelectCreatable'
import { useFciPrices } from '@/hooks/useFciPrices'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useCreateMovement } from '@/hooks/use-movements'
import { useCreateInstrument } from '@/hooks/use-instruments'
import { useToast } from '@/components/ui/toast'
import { db } from '@/db'
import { useQueryClient } from '@tanstack/react-query'
import { sortAccountsForAssetClass } from '../wizard-helpers'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import { WizardFooter } from '../ui/WizardFooter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Mode = 'buy' | 'sell'
type Step = 1 | 2 | 3

interface FciWizardState {
    mode: Mode
    step: Step
    fund: FciValue | null
    accountId: string
    // Sell
    sellQtyStr: string
    sellTotalStr: string
    lastEdited: 'qty' | 'total'
    // Buy
    buyQtyStr: string
    buyTotalStr: string
    buyLastEdited: 'qty' | 'total'
    // Shared
    price: number
    priceManual: boolean
    feeMode: 'PERCENT' | 'FIXED'
    feeValue: string
    datetime: string
    notes: string
}

interface FciBuySellWizardProps {
    accounts: Account[]
    movements: Movement[]
    instruments: Instrument[]
    onClose: () => void
    onBackToAssetType?: () => void
    onStepChange?: (step: number) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const safeFloat = (s: string): number => {
    const v = parseFloat(s.replace(',', '.'))
    return Number.isFinite(v) ? v : 0
}

const fmtQty = (n: number) =>
    n.toLocaleString('es-AR', { maximumFractionDigits: 6, minimumFractionDigits: 0 })

const fmtMoney = (n: number, currency: 'ARS' | 'USD' = 'ARS') =>
    currency === 'USD'
        ? `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const currencySymbol = (c: 'ARS' | 'USD') => (c === 'USD' ? 'US$' : '$')

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FciBuySellWizard({
    accounts,
    movements,
    instruments,
    onClose,
    onBackToAssetType,
    onStepChange,
}: FciBuySellWizardProps) {
    const { priceMap, getPrice } = useFciPrices()
    const { data: fxRates } = useFxRates()
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const queryClient = useQueryClient()
    const { toast } = useToast()

    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

    const [state, setState] = useState<FciWizardState>({
        mode: 'buy',
        step: 1,
        fund: null,
        accountId: '',
        sellQtyStr: '',
        sellTotalStr: '',
        lastEdited: 'qty',
        buyQtyStr: '',
        buyTotalStr: '',
        buyLastEdited: 'qty',
        price: 0,
        priceManual: false,
        feeMode: 'PERCENT',
        feeValue: '0',
        datetime: now.toISOString().slice(0, 16),
        notes: '',
    })

    const isBuy = state.mode === 'buy'

    // Sorted accounts for FCI (Banks/Brokers first)
    const sortedAccounts = useMemo(
        () => sortAccountsForAssetClass(accounts, 'fci'),
        [accounts],
    )

    // ---------------------------------------------------------------------------
    // Derived: FCI holdings per account from movements
    // ---------------------------------------------------------------------------
    const holdingsByAccount = useMemo(() => {
        // Map<accountId, Map<instrumentId, qty>>
        const map = new Map<string, Map<string, number>>()
        movements.forEach(m => {
            if (m.assetClass !== 'fci') return
            const instId = m.instrumentId
            if (!instId) return
            const q = m.quantity || 0
            if (!map.has(m.accountId)) map.set(m.accountId, new Map())
            const accMap = map.get(m.accountId)!
            const cur = accMap.get(instId) || 0
            if (['BUY', 'DEPOSIT', 'TRANSFER_IN'].includes(m.type)) accMap.set(instId, cur + q)
            if (['SELL', 'WITHDRAW', 'TRANSFER_OUT'].includes(m.type)) accMap.set(instId, cur - q)
        })
        return map
    }, [movements])

    // Accounts that have at least one FCI with qty > 0
    const accountsWithFci = useMemo(() => {
        const ids = new Set<string>()
        holdingsByAccount.forEach((instMap, accId) => {
            for (const qty of instMap.values()) {
                if (qty > 0.0001) { ids.add(accId); break }
            }
        })
        return accounts.filter(a => ids.has(a.id))
    }, [holdingsByAccount, accounts])

    // FCI instrument IDs with qty > 0 for the selected account
    const ownedFciIdsForAccount = useMemo(() => {
        if (!state.accountId) return []
        const instMap = holdingsByAccount.get(state.accountId)
        if (!instMap) return []
        const ids: string[] = []
        instMap.forEach((qty, instId) => {
            if (qty > 0.0001) ids.push(instId)
        })
        return ids
    }, [holdingsByAccount, state.accountId])

    // Available qty for current fund + account
    const availableQty = useMemo(() => {
        if (isBuy || !state.fund || !state.accountId) return 0
        const fundId = state.fund.id
        return Math.max(0, holdingsByAccount.get(state.accountId)?.get(fundId) || 0)
    }, [isBuy, state.fund, state.accountId, holdingsByAccount])

    // Fund currency
    const fundCurrency: 'ARS' | 'USD' = state.fund?.currency || 'ARS'

    // Auto-select account when only 1 option (sell)
    useEffect(() => {
        if (!isBuy && accountsWithFci.length === 1 && state.accountId !== accountsWithFci[0].id) {
            setState(s => ({ ...s, accountId: accountsWithFci[0].id }))
        }
    }, [isBuy, accountsWithFci, state.accountId])

    // Auto-select fund when only 1 owned in account (sell)
    useEffect(() => {
        if (!isBuy && ownedFciIdsForAccount.length === 1 && !state.fund) {
            const fciId = ownedFciIdsForAccount[0]
            const priceInfo = getPrice(fciId)
            if (priceInfo) {
                setState(s => ({
                    ...s,
                    fund: {
                        id: fciId,
                        name: priceInfo.name,
                        manager: priceInfo.manager,
                        category: priceInfo.category,
                        currency: priceInfo.currency,
                        vcp: priceInfo.vcp,
                        date: priceInfo.date,
                    },
                    price: priceInfo.vcp,
                    priceManual: false,
                }))
            }
        }
    }, [isBuy, ownedFciIdsForAccount, state.fund, getPrice])

    // Auto-fill price from market when fund changes
    useEffect(() => {
        if (state.fund && !state.priceManual) {
            const p = getPrice(state.fund.id)
            if (p && p.vcp > 0) setState(s => ({ ...s, price: p.vcp }))
        }
    }, [state.fund, priceMap, state.priceManual, getPrice])

    // FX Oficial (sell side)
    const oficialSellRate = fxRates?.oficial?.sell || 1

    // ---------------------------------------------------------------------------
    // Computed values
    // ---------------------------------------------------------------------------
    const computed = useMemo(() => {
        const feeVal = safeFloat(state.feeValue)
        const price = state.price

        if (isBuy) {
            let qty: number, gross: number, fee: number
            if (state.buyLastEdited === 'total') {
                const total = safeFloat(state.buyTotalStr)
                if (state.feeMode === 'PERCENT') {
                    gross = total / (1 + feeVal / 100)
                    fee = total - gross
                } else {
                    fee = feeVal
                    gross = Math.max(0, total - fee)
                }
                qty = price > 0 ? gross / price : 0
            } else {
                qty = safeFloat(state.buyQtyStr)
                gross = qty * price
                fee = state.feeMode === 'PERCENT' ? gross * (feeVal / 100) : feeVal
            }
            const totalPaid = gross + fee
            return { qty, gross, fee, net: 0, totalPaid }
        } else {
            const qty = Math.min(safeFloat(state.sellQtyStr), availableQty)
            const gross = qty * price
            const fee = state.feeMode === 'PERCENT' ? gross * (feeVal / 100) : feeVal
            const net = gross - fee
            return { qty, gross, fee, net, totalPaid: 0 }
        }
    }, [state, isBuy, availableQty])

    // Equivalences
    const equivalences = useMemo(() => {
        if (isBuy) {
            const amount = computed.totalPaid
            if (fundCurrency === 'ARS') {
                return { ars: amount, usd: oficialSellRate > 0 ? amount / oficialSellRate : 0 }
            } else {
                return { usd: amount, ars: amount * oficialSellRate }
            }
        } else {
            const amount = computed.net
            if (fundCurrency === 'ARS') {
                return { ars: amount, usd: oficialSellRate > 0 ? amount / oficialSellRate : 0 }
            } else {
                return { usd: amount, ars: amount * oficialSellRate }
            }
        }
    }, [computed, isBuy, fundCurrency, oficialSellRate])

    // Max total for sell
    const maxTotal = availableQty * state.price

    // ---------------------------------------------------------------------------
    // Step Validation
    // ---------------------------------------------------------------------------
    const canAdvance = useMemo(() => {
        if (state.step === 1) {
            if (!state.fund) return false
            if (!state.accountId) return false
            if (!isBuy && availableQty <= 0) return false
            return true
        }
        if (state.step === 2) {
            if (state.price <= 0) return false
            if (computed.qty <= 0) return false
            if (!isBuy && computed.qty > availableQty + 0.000001) return false
            return true
        }
        return true // step 3
    }, [state, computed, isBuy, availableQty])

    // ---------------------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------------------
    const nextStep = () => {
        if (!canAdvance) return
        if (state.step < 3) setState(s => ({ ...s, step: (s.step + 1) as Step }))
        else handleConfirm()
    }

    const prevStep = () => {
        if (state.step > 1) setState(s => ({ ...s, step: (s.step - 1) as Step }))
    }

    // Sync step to parent for unified stepper
    useEffect(() => { onStepChange?.(state.step) }, [state.step])

    const setMode = (mode: Mode) => {
        setState(s => ({
            ...s,
            mode,
            step: 1,
            fund: null,
            accountId: '',
            sellQtyStr: '',
            sellTotalStr: '',
            buyQtyStr: '',
            buyTotalStr: '',
            priceManual: false,
            price: 0,
        }))
    }

    // ---------------------------------------------------------------------------
    // Bidirectional input handlers (Sell)
    // ---------------------------------------------------------------------------
    const handleSellQtyChange = (raw: string) => {
        const sanitized = raw.replace(/[^0-9.,]/g, '')
        const qty = Math.min(safeFloat(sanitized), availableQty)
        const total = qty * state.price
        setState(s => ({
            ...s,
            sellQtyStr: sanitized,
            sellTotalStr: total > 0 ? total.toFixed(2) : '',
            lastEdited: 'qty',
        }))
    }

    const handleSellTotalChange = (raw: string) => {
        const sanitized = raw.replace(/[^0-9.,]/g, '')
        let total = safeFloat(sanitized)
        if (total > maxTotal && maxTotal > 0) total = maxTotal
        const qty = state.price > 0 ? total / state.price : 0
        const clampedQty = Math.min(qty, availableQty)
        setState(s => ({
            ...s,
            sellTotalStr: sanitized,
            sellQtyStr: clampedQty > 0 ? clampedQty.toFixed(6).replace(/\.?0+$/, '') : '',
            lastEdited: 'total',
        }))
    }

    // Bidirectional input handlers (Buy)
    const handleBuyQtyChange = (raw: string) => {
        const sanitized = raw.replace(/[^0-9.,]/g, '')
        const qty = safeFloat(sanitized)
        const total = qty * state.price
        setState(s => ({
            ...s,
            buyQtyStr: sanitized,
            buyTotalStr: total > 0 ? total.toFixed(2) : '',
            buyLastEdited: 'qty',
        }))
    }

    const handleBuyTotalChange = (raw: string) => {
        const sanitized = raw.replace(/[^0-9.,]/g, '')
        const total = safeFloat(sanitized)
        const qty = state.price > 0 ? total / state.price : 0
        setState(s => ({
            ...s,
            buyTotalStr: sanitized,
            buyQtyStr: qty > 0 ? qty.toFixed(6).replace(/\.?0+$/, '') : '',
            buyLastEdited: 'total',
        }))
    }

    // Recalculate when price changes (sell)
    useEffect(() => {
        if (!isBuy && state.price > 0) {
            if (state.lastEdited === 'qty') {
                const qty = Math.min(safeFloat(state.sellQtyStr), availableQty)
                const total = qty * state.price
                setState(s => ({ ...s, sellTotalStr: total > 0 ? total.toFixed(2) : '' }))
            } else {
                const total = safeFloat(state.sellTotalStr)
                const qty = state.price > 0 ? Math.min(total / state.price, availableQty) : 0
                setState(s => ({ ...s, sellQtyStr: qty > 0 ? qty.toFixed(6).replace(/\.?0+$/, '') : '' }))
            }
        }
    }, [state.price]) // eslint-disable-line react-hooks/exhaustive-deps

    // Recalculate when price changes (buy)
    useEffect(() => {
        if (isBuy && state.price > 0) {
            if (state.buyLastEdited === 'qty') {
                const qty = safeFloat(state.buyQtyStr)
                const total = qty * state.price
                setState(s => ({ ...s, buyTotalStr: total > 0 ? total.toFixed(2) : '' }))
            } else {
                const total = safeFloat(state.buyTotalStr)
                const qty = state.price > 0 ? total / state.price : 0
                setState(s => ({ ...s, buyQtyStr: qty > 0 ? qty.toFixed(6).replace(/\.?0+$/, '') : '' }))
            }
        }
    }, [state.price]) // eslint-disable-line react-hooks/exhaustive-deps

    // ---------------------------------------------------------------------------
    // Confirm / Persist
    // ---------------------------------------------------------------------------
    const handleConfirm = async () => {
        if (!state.fund || !state.accountId) return

        try {
            // 1. Find or create instrument
            const fciId = state.fund.id
            const inst = instruments.find(i => i.id === fciId)
            let instrumentId = inst?.id

            if (!instrumentId) {
                const newInst: Instrument = {
                    id: fciId,
                    symbol: fciId,
                    name: state.fund.name,
                    category: 'FCI',
                    nativeCurrency: fundCurrency,
                    priceKey: fciId,
                }
                await (createInstrument as any).mutateAsync(newInst)
                instrumentId = fciId
            }

            const datetimeISO = new Date(state.datetime).toISOString()
            const movementType: MovementType = isBuy ? 'BUY' : 'SELL'
            const qty = computed.qty
            const gross = computed.gross
            const feeAmount = computed.fee
            const net = isBuy ? gross + feeAmount : gross - feeAmount

            const fee: MovementFee | undefined = feeAmount > 0 ? {
                mode: state.feeMode,
                percent: state.feeMode === 'PERCENT' ? safeFloat(state.feeValue) : undefined,
                amount: feeAmount,
                currency: fundCurrency,
            } : undefined

            const fxSnapshot = {
                kind: 'OFICIAL' as const,
                side: 'sell' as const,
                rate: oficialSellRate,
                asOf: new Date().toISOString(),
            }

            const totalArs = fundCurrency === 'ARS' ? gross : gross * oficialSellRate
            const totalUsd = fundCurrency === 'USD' ? gross : (oficialSellRate > 0 ? gross / oficialSellRate : 0)

            if (isBuy) {
                // --- BUY: single movement ---
                const movPayload: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: movementType,
                    assetClass: 'fci',
                    instrumentId: instrumentId!,
                    accountId: state.accountId,
                    ticker: fciId,
                    assetName: state.fund.name,
                    quantity: qty,
                    unitPrice: state.price,
                    tradeCurrency: fundCurrency,
                    totalAmount: gross,
                    fee,
                    netAmount: net,
                    totalARS: totalArs,
                    totalUSD: totalUsd,
                    fxAtTrade: oficialSellRate,
                    fx: fxSnapshot,
                    notes: state.notes || undefined,
                    meta: {
                        fci: {
                            nameSnapshot: state.fund.name,
                            managerSnapshot: state.fund.manager,
                            categorySnapshot: state.fund.category,
                            vcpAsOf: state.fund.date,
                        },
                    },
                }
                await createMovement.mutateAsync(movPayload)

                toast({
                    title: 'Suscripción registrada',
                    description: `${fmtQty(qty)} cuotapartes de ${state.fund.name} por ${fmtMoney(gross, fundCurrency)}`,
                    variant: 'default',
                })
            } else {
                // --- SELL: atomic SELL + DEPOSIT ---
                const groupId = crypto.randomUUID()
                const netAmount = computed.net

                const netArs = fundCurrency === 'ARS' ? netAmount : netAmount * oficialSellRate
                const netUsd = fundCurrency === 'USD' ? netAmount : (oficialSellRate > 0 ? netAmount / oficialSellRate : 0)

                const sellMov: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'SELL',
                    assetClass: 'fci',
                    instrumentId: instrumentId!,
                    accountId: state.accountId,
                    ticker: fciId,
                    assetName: state.fund.name,
                    quantity: qty,
                    unitPrice: state.price,
                    tradeCurrency: fundCurrency,
                    totalAmount: gross,
                    fee,
                    netAmount: netAmount,
                    totalARS: totalArs,
                    totalUSD: totalUsd,
                    fxAtTrade: oficialSellRate,
                    fx: fxSnapshot,
                    groupId,
                    source: 'user',
                    notes: state.notes || `Rescate de ${fmtQty(qty)} cuotapartes`,
                    meta: {
                        fci: {
                            nameSnapshot: state.fund.name,
                            managerSnapshot: state.fund.manager,
                            categorySnapshot: state.fund.category,
                            vcpAsOf: state.fund.date,
                        },
                    },
                }

                const depositCurrency: Currency = fundCurrency
                const depositMov: Movement = {
                    id: crypto.randomUUID(),
                    datetimeISO,
                    type: 'DEPOSIT',
                    assetClass: 'wallet',
                    accountId: state.accountId,
                    tradeCurrency: depositCurrency,
                    totalAmount: netAmount,
                    totalARS: netArs,
                    totalUSD: netUsd,
                    fxAtTrade: oficialSellRate,
                    fx: fxSnapshot,
                    groupId,
                    source: 'system',
                    notes: `Acreditación por rescate de ${state.fund.name} (${fmtQty(qty)} cuotapartes)`,
                }

                // Atomic write
                await db.transaction('rw', db.movements, async () => {
                    await db.movements.bulkAdd([sellMov, depositMov])
                })

                // Manual query invalidation (bypassed the hook)
                queryClient.invalidateQueries({ queryKey: ['movements'] })
                queryClient.invalidateQueries({ queryKey: ['portfolio'] })

                toast({
                    title: 'Rescate registrado',
                    description: `${fmtQty(qty)} cuotapartes por ${fmtMoney(netAmount, fundCurrency)}. Liquidez ${fundCurrency} acreditada.`,
                    variant: 'success',
                    duration: 5000,
                })
            }

            onClose()
        } catch (err) {
            console.error('FCI wizard: failed to save', err)
            toast({ title: 'Error al guardar', description: 'Intenta nuevamente.', variant: 'error' })
        }
    }

    // ---------------------------------------------------------------------------
    // Mode Tabs
    // ---------------------------------------------------------------------------
    const ModeTabs = () => (
        <div className="bg-slate-950/50 p-1 rounded-lg inline-flex w-full sm:w-auto border border-white/5 mb-4">
            <button
                onClick={() => setMode('buy')}
                className={cn('flex-1 sm:flex-none px-8 py-2 rounded-md text-sm font-medium transition-all',
                    isBuy ? 'bg-indigo-500 text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]' : 'text-slate-400 hover:text-white')}
            >
                Suscripción
            </button>
            <button
                onClick={() => setMode('sell')}
                className={cn('flex-1 sm:flex-none px-8 py-2 rounded-md text-sm font-medium transition-all',
                    !isBuy ? 'bg-rose-500 text-white shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]' : 'text-slate-400 hover:text-white')}
            >
                Rescate
            </button>
        </div>
    )

    // ---------------------------------------------------------------------------
    // STEP 1: Fund + Account
    // ---------------------------------------------------------------------------
    const renderStep1 = () => {
        const noHoldings = !isBuy && accountsWithFci.length === 0

        return (
            <div className="max-w-xl mx-auto space-y-6 pt-2 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Account */}
                <div className={cn('space-y-2', noHoldings && 'opacity-50 pointer-events-none')}>
                    <label className="text-xs font-mono uppercase text-slate-400 ml-1">
                        {isBuy ? 'Cuenta / Banco / Broker' : 'Cuenta con FCI'}
                    </label>
                    <AccountSelectCreatable
                        value={state.accountId}
                        onChange={val => setState(s => ({ ...s, accountId: val, fund: null, price: 0, priceManual: false, sellQtyStr: '', sellTotalStr: '' }))}
                        accounts={!isBuy ? accountsWithFci : sortedAccounts}
                        placeholder={!isBuy ? 'Cuentas con FCI...' : 'Seleccionar o crear cuenta...'}
                    />
                </div>

                {/* Fund */}
                <div className={cn('space-y-2 transition-opacity', (!state.accountId && !noHoldings) ? 'opacity-50 pointer-events-none' : '')}>
                    <label className="text-xs font-mono uppercase text-slate-400 ml-1">Fondo FCI</label>
                    <FciTypeahead
                        value={state.fund}
                        onChange={(fund: FciFund | null) => {
                            if (!fund) {
                                setState(s => ({ ...s, fund: null, price: 0, priceManual: false }))
                                return
                            }
                            const id = generateFciSlug(fund)
                            setState(s => ({
                                ...s,
                                fund: {
                                    id,
                                    name: fund.name,
                                    manager: fund.manager,
                                    category: fund.category,
                                    currency: fund.currency,
                                    vcp: fund.vcp,
                                    date: fund.date,
                                },
                                price: fund.vcp,
                                priceManual: false,
                                sellQtyStr: '',
                                sellTotalStr: '',
                                buyQtyStr: '',
                                buyTotalStr: '',
                            }))
                        }}
                        restrictToIds={!isBuy ? ownedFciIdsForAccount : undefined}
                        disabled={!state.accountId && !noHoldings}
                        placeholder={!isBuy ? 'Buscar FCI con tenencia...' : 'Buscar fondo FCI...'}
                    />
                </div>

                {/* No holdings empty state */}
                {noHoldings && (
                    <div className="p-5 rounded-xl bg-slate-900/50 border border-amber-500/20 flex items-start gap-3 animate-in fade-in duration-200">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <div className="text-sm text-amber-300 font-medium">Sin posiciones FCI</div>
                            <div className="text-xs text-slate-400 mt-1">
                                No tenés cuotapartes de FCI para rescatar. Registrá una suscripción primero.
                            </div>
                        </div>
                    </div>
                )}

                {/* Available badge for sell */}
                {!isBuy && state.fund && state.accountId && (
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 flex justify-between items-center animate-in fade-in duration-200">
                        <div>
                            <div className="text-xs text-slate-500 font-mono mb-1">
                                Disponible en {accounts.find(a => a.id === state.accountId)?.name || ''}
                            </div>
                            <div className="text-xl text-white font-mono font-bold tracking-tight">
                                {fmtQty(availableQty)} cuotapartes
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-500 font-mono mb-1">Valor Aprox.</div>
                            <div className="text-lg text-slate-300 font-mono">
                                {fmtMoney(availableQty * state.price, fundCurrency)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Fund info card */}
                {state.fund && (
                    <div className="p-4 rounded-xl bg-slate-900/30 border border-white/5 space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-bold uppercase text-slate-300">{state.fund.currency}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">{state.fund.category}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">{state.fund.manager}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">VCP</span>
                            <span className="font-mono text-white">
                                {currencySymbol(fundCurrency)} {state.fund.vcp.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Última cotización</span>
                            <span className="text-slate-400">{state.fund.date}</span>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // STEP 2: Details (bidirectional inputs)
    // ---------------------------------------------------------------------------
    const renderStep2 = () => {
        const noMarketPrice = state.price <= 0 && !state.priceManual

        return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* LEFT: Inputs */}
                <div className="lg:col-span-7 space-y-6">

                    {/* Qty input */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-mono uppercase text-slate-400 ml-1">
                                Cantidad (cuotapartes)
                            </label>
                            {!isBuy && (
                                <div className="flex gap-2">
                                    {[0.25, 0.5, 1].map(pct => (
                                        <button
                                            key={pct}
                                            onClick={() => {
                                                const v = availableQty * pct
                                                handleSellQtyChange(v.toFixed(6))
                                            }}
                                            className={cn(
                                                'text-[10px] px-2 py-0.5 rounded transition',
                                                pct === 1
                                                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold'
                                                    : 'bg-slate-800 text-slate-400 hover:text-white',
                                            )}
                                        >
                                            {pct === 1 ? 'MAX' : `${pct * 100}%`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={isBuy ? state.buyQtyStr : state.sellQtyStr}
                                onChange={e => isBuy ? handleBuyQtyChange(e.target.value) : handleSellQtyChange(e.target.value)}
                                placeholder="0,000000"
                                className={cn(
                                    'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-xl py-4 px-5 text-2xl font-mono text-white placeholder-slate-600 focus:outline-none transition',
                                    isBuy ? 'focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500' : 'focus:border-rose-500 focus:ring-1 focus:ring-rose-500',
                                )}
                            />
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-mono">
                                cuotap.
                            </span>
                        </div>
                        {!isBuy && (
                            <div className="text-[10px] text-slate-500 font-mono text-right">
                                Disponible: {fmtQty(availableQty)} cuotapartes
                                {maxTotal > 0 && ` — Máx: ${fmtMoney(maxTotal, fundCurrency)}`}
                            </div>
                        )}
                    </div>

                    {/* Total input (bidirectional) */}
                    <div className="space-y-2">
                        <label className="text-xs font-mono uppercase text-slate-400 ml-1">
                            Total Operación ({fundCurrency})
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg font-mono pointer-events-none">
                                {currencySymbol(fundCurrency)}
                            </span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={isBuy ? state.buyTotalStr : state.sellTotalStr}
                                onChange={e => isBuy ? handleBuyTotalChange(e.target.value) : handleSellTotalChange(e.target.value)}
                                placeholder="0,00"
                                className={cn(
                                    'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-xl py-4 pl-12 pr-5 text-2xl font-mono text-white placeholder-slate-600 focus:outline-none transition',
                                    isBuy ? 'focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500' : 'focus:border-rose-500 focus:ring-1 focus:ring-rose-500',
                                )}
                            />
                        </div>
                    </div>

                    {/* Price & Fee row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-mono uppercase text-slate-400 ml-1">
                                    Precio Unit. (VCP)
                                </label>
                                <button
                                    onClick={() => {
                                        if (state.fund) {
                                            const p = getPrice(state.fund.id)
                                            if (p && p.vcp > 0) setState(s => ({ ...s, price: p.vcp, priceManual: false }))
                                        }
                                    }}
                                    className={cn(
                                        'text-[10px] hover:underline flex items-center gap-1',
                                        isBuy ? 'text-indigo-400' : 'text-rose-400',
                                    )}
                                >
                                    <RefreshCw className="w-3 h-3" /> Mercado
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                                    {currencySymbol(fundCurrency)}
                                </span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={state.price || ''}
                                    onChange={e => setState(s => ({ ...s, price: parseFloat(e.target.value) || 0, priceManual: true }))}
                                    className={cn(
                                        'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 pr-3 font-mono text-sm text-white focus:outline-none transition',
                                        fundCurrency === 'USD' ? 'pl-12' : 'pl-8',
                                        isBuy ? 'focus:border-indigo-500' : 'focus:border-rose-500',
                                    )}
                                />
                                {!state.priceManual && state.price > 0 && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase">
                                        Auto
                                    </span>
                                )}
                                {state.priceManual && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase">
                                        Manual
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-mono uppercase text-slate-400 ml-1">Comisión</label>
                                <button
                                    onClick={() => setState(s => ({
                                        ...s,
                                        feeMode: s.feeMode === 'PERCENT' ? 'FIXED' : 'PERCENT',
                                        feeValue: s.feeMode === 'PERCENT' ? '0' : '0',
                                    }))}
                                    className={cn(
                                        'text-[10px] hover:underline uppercase',
                                        isBuy ? 'text-indigo-400' : 'text-rose-400',
                                    )}
                                >
                                    {state.feeMode === 'PERCENT' ? '%' : fundCurrency}
                                </button>
                            </div>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={state.feeValue}
                                onChange={e => setState(s => ({ ...s, feeValue: e.target.value }))}
                                className={cn(
                                    'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 font-mono text-sm text-white focus:outline-none transition',
                                    isBuy ? 'focus:border-indigo-500' : 'focus:border-rose-500',
                                )}
                            />
                        </div>
                    </div>

                    {/* No market price warning */}
                    {noMarketPrice && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-sm text-amber-300">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            Sin precio de mercado: ingresá un precio manual.
                        </div>
                    )}

                    {/* Datetime */}
                    <div className="space-y-2">
                        <label className="text-xs font-mono uppercase text-slate-400 ml-1">Fecha y Hora</label>
                        <input
                            type="datetime-local"
                            value={state.datetime}
                            onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                            className={cn(
                                'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 text-sm text-white focus:outline-none transition',
                                isBuy ? 'focus:border-indigo-500' : 'focus:border-rose-500',
                            )}
                        />
                    </div>
                </div>

                {/* RIGHT: Summary */}
                <div className="lg:col-span-5 relative">
                    <div className="sticky top-0 bg-slate-950/40 rounded-xl border border-white/5 p-6 flex flex-col space-y-6">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <h3 className="font-display text-lg text-white">
                                {isBuy ? 'Resumen de Suscripción' : 'Resumen de Rescate'}
                            </h3>
                            <span className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                                isBuy ? 'bg-indigo-500/20 text-indigo-400' : 'bg-rose-500/20 text-rose-400',
                            )}>
                                {isBuy ? 'Ingreso' : 'Egreso'}
                            </span>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Cuotapartes</span>
                                <span className="text-white font-mono">{fmtQty(computed.qty)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">VCP</span>
                                <span className="text-white font-mono">{currencySymbol(fundCurrency)} {state.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Bruto</span>
                                <span className="text-white font-mono">{fmtMoney(computed.gross, fundCurrency)}</span>
                            </div>
                            {computed.fee > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Comisión</span>
                                    <span className="text-rose-400 font-mono">- {fmtMoney(computed.fee, fundCurrency)}</span>
                                </div>
                            )}
                        </div>

                        {/* Net */}
                        <div className={cn(
                            'p-4 rounded-lg border',
                            isBuy ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-rose-500/10 border-rose-500/20',
                        )}>
                            <div className={cn('text-xs font-mono mb-1 uppercase',
                                isBuy ? 'text-indigo-300' : 'text-rose-300')}>
                                {isBuy ? 'Total a Pagar' : 'Neto a Recibir'}
                            </div>
                            <div className="text-2xl text-white font-mono font-bold tracking-tight">
                                {fmtMoney(isBuy ? computed.totalPaid : computed.net, fundCurrency)}
                            </div>
                        </div>

                        {/* Equivalences */}
                        <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 border border-white/5">
                            <div className="text-xs text-slate-500 font-mono uppercase mb-1">Equivalencias (FX Oficial)</div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">ARS</span>
                                <span className="text-slate-300 font-mono">{formatMoneyARS(equivalences.ars)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">USD</span>
                                <span className="text-slate-300 font-mono">{formatMoneyUSD(equivalences.usd)}</span>
                            </div>
                        </div>

                        {/* Sell: show what gets credited */}
                        {!isBuy && computed.net > 0 && (
                            <div className="text-xs text-slate-500 text-center">
                                Se acreditarán <span className="text-white font-medium">{fmtMoney(computed.net, fundCurrency)}</span> en la misma cuenta como liquidez {fundCurrency}.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // ---------------------------------------------------------------------------
    // STEP 3: Confirm
    // ---------------------------------------------------------------------------
    const renderStep3 = () => (
        <div className="max-w-md mx-auto pt-6 text-center space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Icon */}
            <div className={cn(
                'relative w-20 h-20 mx-auto flex items-center justify-center rounded-full',
                isBuy ? 'bg-indigo-500/10 text-indigo-400' : 'bg-rose-500/10 text-rose-400',
            )}>
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d={isBuy ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6'} />
                </svg>
                <div className="absolute inset-0 rounded-full border border-white/10 animate-pulse" />
            </div>

            <div>
                <h2 className="text-3xl font-display font-bold text-white mb-2">
                    Confirmar {isBuy ? 'Suscripción' : 'Rescate'}
                </h2>
                <p className="text-slate-400 text-sm">
                    {isBuy ? 'Se registrará la compra de cuotapartes.' : 'Se actualizarán posiciones y liquidez al instante.'}
                </p>
            </div>

            {/* Detail card */}
            <div className="bg-slate-900/40 rounded-xl border border-white/10 p-6 space-y-4 text-sm text-left">
                <div className="flex justify-between">
                    <span className="text-slate-500">Cuenta</span>
                    <span className="text-white font-medium">{accounts.find(a => a.id === state.accountId)?.name || ''}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Fondo</span>
                    <span className="text-white text-xs text-right max-w-[60%] truncate">{state.fund?.name || ''}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Cuotapartes</span>
                    <span className="text-white font-mono font-bold text-lg">{fmtQty(computed.qty)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Precio Unit. (VCP)</span>
                    <span className="text-white font-mono">
                        {currencySymbol(fundCurrency)} {state.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        {!state.priceManual && <span className="ml-1 text-emerald-400 text-[9px]">AUTO</span>}
                        {state.priceManual && <span className="ml-1 text-amber-400 text-[9px]">MANUAL</span>}
                    </span>
                </div>
                {computed.fee > 0 && (
                    <div className="flex justify-between">
                        <span className="text-slate-500">Comisión</span>
                        <span className="text-rose-400 font-mono">{fmtMoney(computed.fee, fundCurrency)}</span>
                    </div>
                )}
                <div className="w-full h-px bg-white/10 my-2" />
                <div className="flex justify-between items-center">
                    <span className="text-slate-500">{isBuy ? 'Total a Pagar' : 'Total a Recibir'}</span>
                    <span className="text-xl text-white font-mono font-bold">
                        {fmtMoney(isBuy ? computed.totalPaid : computed.net, fundCurrency)}
                    </span>
                </div>
                {!isBuy && (
                    <div className="flex justify-between items-center text-xs mt-1">
                        <span className="text-slate-500">Acreditación</span>
                        <span className="text-emerald-400 font-mono">
                            + {fmtMoney(computed.net, fundCurrency)} en liquidez {fundCurrency}
                        </span>
                    </div>
                )}
            </div>

            {/* Equivalences in confirm */}
            <div className="bg-slate-900/30 rounded-lg p-4 border border-white/5 text-xs text-left space-y-1">
                <div className="text-slate-500 font-mono uppercase mb-1">Equivalencias (FX Oficial)</div>
                <div className="flex justify-between">
                    <span className="text-slate-400">ARS</span>
                    <span className="text-slate-300 font-mono">{formatMoneyARS(equivalences.ars)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">USD</span>
                    <span className="text-slate-300 font-mono">{formatMoneyUSD(equivalences.usd)}</span>
                </div>
            </div>
        </div>
    )

    // ---------------------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------------------
    return (
        <>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0F172A]">
                <ModeTabs />
                {state.step === 1 && renderStep1()}
                {state.step === 2 && renderStep2()}
                {state.step === 3 && renderStep3()}
            </div>

            {/* Footer */}
            <WizardFooter
                onBack={state.step > 1 ? prevStep : (onBackToAssetType ?? onClose)}
                onCancel={onClose}
                primaryLabel={state.step < 3 ? 'Siguiente' : 'Confirmar'}
                onPrimary={nextStep}
                primaryVariant={state.step < 3 ? 'indigo' : 'emerald'}
                primaryDisabled={!canAdvance}
            />
        </>
    )
}
