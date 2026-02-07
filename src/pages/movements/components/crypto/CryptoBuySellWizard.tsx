import { useState, useMemo, useEffect } from 'react'
import { ArrowLeft, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Movement, Currency, Account, Instrument, MovementType, MovementFee } from '@/domain/types'
import { CryptoTypeahead, type CryptoOption } from '../CryptoTypeahead'
import { AccountSelectCreatable } from '../AccountSelectCreatable'
import { useCreateMovement } from '@/hooks/use-movements'
import { useCreateInstrument } from '@/hooks/use-instruments'
import { useCryptoPrices } from '@/hooks/use-crypto-prices'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useToast } from '@/components/ui/toast'
import { buildFifoLots } from '@/domain/portfolio/fifo'
import { allocateSale, COSTING_METHODS, type CostingMethod, type ManualAllocation } from '@/domain/portfolio/lot-allocation'
import type { LotDetail } from '@/features/portfolioV2/types'
import { sortAccountsForAssetClass } from '../wizard-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Mode = 'buy' | 'sell'
type Step = 1 | 2 | 3

interface CryptoWizardState {
    mode: Mode
    step: Step
    asset: CryptoOption | null
    accountId: string
    // Buy
    buyMode: 'amount' | 'qty'
    buyAmount: string
    buyQty: string
    // Sell
    sellQty: string
    costingMethod: CostingMethod
    manualAllocations: ManualAllocation[]
    // Shared
    price: number
    priceManual: boolean
    feeMode: 'PERCENT' | 'FIXED'
    feeValue: string
    datetime: string
    autoBalanceUsdt: boolean
    notes: string
}

interface CryptoBuySellWizardProps {
    accounts: Account[]
    movements: Movement[]
    instruments: Instrument[]
    prefillMovement?: Movement | null
    onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const safeFloat = (s: string): number => {
    const v = parseFloat(s.replace(',', '.'))
    return Number.isFinite(v) ? v : 0
}

const fmt8 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 0 })
const fmt2 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CryptoBuySellWizard({
    accounts,
    movements,
    instruments,
    prefillMovement: _prefillMovement,
    onClose,
}: CryptoBuySellWizardProps) {
    void _prefillMovement // reserved for future edit-mode
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const { data: fxRates } = useFxRates()
    const { toast } = useToast()

    // Collect all crypto symbols from instruments for price fetch
    const allCryptoSymbols = useMemo(() => {
        const syms = new Set<string>()
        instruments.forEach(i => {
            if (i.category === 'CRYPTO' || i.category === 'STABLE') syms.add(i.symbol)
        })
        // Always include common ones
        ;['BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'BNB'].forEach(s => syms.add(s))
        return Array.from(syms)
    }, [instruments])

    const { data: cryptoPrices } = useCryptoPrices(allCryptoSymbols)

    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

    const [state, setState] = useState<CryptoWizardState>({
        mode: 'buy',
        step: 1,
        asset: null,
        accountId: '',
        buyMode: 'amount',
        buyAmount: '',
        buyQty: '',
        sellQty: '',
        costingMethod: 'FIFO',
        manualAllocations: [],
        price: 0,
        priceManual: false,
        feeMode: 'PERCENT',
        feeValue: '0.1',
        datetime: now.toISOString().slice(0, 16),
        autoBalanceUsdt: true,
        notes: '',
    })

    const isBuy = state.mode === 'buy'

    // Sorted accounts for crypto
    const sortedAccounts = useMemo(
        () => sortAccountsForAssetClass(accounts, 'crypto'),
        [accounts],
    )

    // ---------------------------------------------------------------------------
    // Derived: holdings per ticker+account from movements
    // ---------------------------------------------------------------------------
    const holdingsByTicker = useMemo(() => {
        const map = new Map<string, Map<string, number>>() // ticker -> accountId -> qty
        movements.forEach(m => {
            if (m.assetClass !== 'crypto') return
            const ticker = m.ticker || instruments.find(i => i.id === m.instrumentId)?.symbol
            if (!ticker) return
            const q = m.quantity || 0
            if (!map.has(ticker)) map.set(ticker, new Map())
            const accMap = map.get(ticker)!
            const cur = accMap.get(m.accountId) || 0
            if (['BUY', 'DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(m.type)) accMap.set(m.accountId, cur + q)
            if (['SELL', 'WITHDRAW', 'TRANSFER_OUT'].includes(m.type)) accMap.set(m.accountId, cur - q)
        })
        return map
    }, [movements, instruments])

    // Available qty for sell (asset + account specific)
    const availableQty = useMemo(() => {
        if (!state.asset || !state.accountId || isBuy) return 0
        const ticker = state.asset.ticker
        return Math.max(0, holdingsByTicker.get(ticker)?.get(state.accountId) || 0)
    }, [state.asset, state.accountId, isBuy, holdingsByTicker])

    // Lots for sell (FIFO-based)
    const fifoLots = useMemo((): LotDetail[] => {
        if (!state.asset || !state.accountId || isBuy) return []
        const ticker = state.asset.ticker
        const instId = instruments.find(i => i.symbol === ticker)?.id
        if (!instId) return []

        const assetMoves = movements.filter(m =>
            m.assetClass === 'crypto' &&
            m.accountId === state.accountId &&
            (m.instrumentId === instId || (!m.instrumentId && m.ticker === ticker))
        )
        if (assetMoves.length === 0) return []

        const fifo = buildFifoLots(assetMoves)
        const currentPrice = cryptoPrices?.[ticker] || 0

        return fifo.lots.map((lot, idx) => ({
            id: `lot-${idx}`,
            dateISO: lot.date,
            qty: lot.quantity,
            unitCostNative: lot.unitCostUsd,
            totalCostNative: lot.quantity * lot.unitCostUsd,
            currentValueNative: lot.quantity * currentPrice,
            pnlNative: lot.quantity * currentPrice - lot.quantity * lot.unitCostUsd,
            pnlPct: lot.unitCostUsd > 0 ? (currentPrice - lot.unitCostUsd) / lot.unitCostUsd : 0,
        }))
    }, [state.asset, state.accountId, isBuy, movements, instruments, cryptoPrices])

    // Accounts with balance for a ticker (sell mode)
    const accountsWithBalance = useMemo(() => {
        if (!state.asset) return []
        const ticker = state.asset.ticker
        const accMap = holdingsByTicker.get(ticker)
        if (!accMap) return []
        return accounts.filter(a => (accMap.get(a.id) || 0) > 0.00000001)
    }, [state.asset, accounts, holdingsByTicker])

    // Auto-select account when only 1 option (sell)
    useEffect(() => {
        if (!isBuy && accountsWithBalance.length === 1 && state.accountId !== accountsWithBalance[0].id) {
            setState(s => ({ ...s, accountId: accountsWithBalance[0].id }))
        }
    }, [isBuy, accountsWithBalance, state.accountId])

    // Auto-fill price from market when asset changes
    useEffect(() => {
        if (state.asset && cryptoPrices && !state.priceManual) {
            const p = cryptoPrices[state.asset.ticker] || 0
            if (p > 0) setState(s => ({ ...s, price: p }))
        }
    }, [state.asset, cryptoPrices, state.priceManual])

    // ---------------------------------------------------------------------------
    // Computed values
    // ---------------------------------------------------------------------------
    const computed = useMemo(() => {
        const feeVal = safeFloat(state.feeValue)
        const price = state.price

        if (isBuy) {
            let qty: number, gross: number, fee: number

            if (state.buyMode === 'amount') {
                const amount = safeFloat(state.buyAmount)
                if (state.feeMode === 'PERCENT') {
                    gross = amount / (1 + feeVal / 100)
                    fee = amount - gross
                } else {
                    fee = feeVal
                    gross = Math.max(0, amount - fee)
                }
                qty = price > 0 ? gross / price : 0
            } else {
                qty = safeFloat(state.buyQty)
                gross = qty * price
                fee = state.feeMode === 'PERCENT' ? gross * (feeVal / 100) : feeVal
            }

            const totalPaid = gross + fee
            return { qty, gross, fee, net: 0, totalPaid, costBasis: 0, pnl: 0 }
        } else {
            const qty = safeFloat(state.sellQty)
            const gross = qty * price
            const fee = state.feeMode === 'PERCENT' ? gross * (feeVal / 100) : feeVal
            const net = gross - fee

            // Allocation for costing
            const alloc = allocateSale(fifoLots, qty, price, state.costingMethod,
                state.costingMethod === 'MANUAL' ? state.manualAllocations : undefined)

            // If manual, qty comes from allocations
            const effectiveQty = state.costingMethod === 'MANUAL'
                ? alloc.totalQtySold
                : qty

            if (state.costingMethod === 'MANUAL') {
                const manGross = effectiveQty * price
                const manFee = state.feeMode === 'PERCENT' ? manGross * (feeVal / 100) : feeVal
                return {
                    qty: effectiveQty,
                    gross: manGross,
                    fee: manFee,
                    net: manGross - manFee,
                    totalPaid: 0,
                    costBasis: alloc.totalCostUsd,
                    pnl: (manGross - manFee) - alloc.totalCostUsd,
                }
            }

            return {
                qty,
                gross,
                fee,
                net,
                totalPaid: 0,
                costBasis: alloc.totalCostUsd,
                pnl: net - alloc.totalCostUsd,
            }
        }
    }, [state, isBuy, fifoLots])

    // ---------------------------------------------------------------------------
    // Step Validation
    // ---------------------------------------------------------------------------
    const canAdvance = useMemo(() => {
        if (state.step === 1) {
            if (!state.asset) return false
            if (!state.accountId) return false
            if (!isBuy && availableQty <= 0) return false
            return true
        }
        if (state.step === 2) {
            if (computed.qty <= 0) return false
            if (state.price <= 0) return false
            if (!isBuy) {
                if (computed.qty > availableQty + 0.00000001) return false
                if (state.costingMethod === 'MANUAL') {
                    const sumManual = state.manualAllocations.reduce((s, a) => s + a.qty, 0)
                    if (sumManual <= 0) return false
                }
            }
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

    const setMode = (mode: Mode) => {
        setState(s => ({
            ...s,
            mode,
            step: 1,
            asset: null,
            accountId: '',
            buyAmount: '',
            buyQty: '',
            sellQty: '',
            manualAllocations: [],
            priceManual: false,
            price: 0,
        }))
    }

    // ---------------------------------------------------------------------------
    // Confirm / Persist
    // ---------------------------------------------------------------------------
    const handleConfirm = async () => {
        if (!state.asset || !state.accountId) return

        try {
            // 1. Find or create instrument
            const ticker = state.asset.ticker
            const inst = instruments.find(i => i.symbol === ticker)
            let instrumentId = inst?.id

            if (!instrumentId) {
                const newInst: Instrument = {
                    id: crypto.randomUUID(),
                    symbol: ticker,
                    name: state.asset.name,
                    category: state.asset.category === 'STABLE' ? 'STABLE' : 'CRYPTO',
                    nativeCurrency: 'USD',
                    priceKey: ticker.toLowerCase(),
                    coingeckoId: state.asset.coingeckoId,
                }
                await (createInstrument as any).mutateAsync(newInst)
                instrumentId = newInst.id
            }

            const fxRate = fxRates?.cripto?.sell || fxRates?.mep?.sell || 1
            const movementType: MovementType = isBuy ? 'BUY' : 'SELL'
            const qty = computed.qty
            const gross = computed.gross
            const feeAmount = computed.fee
            const netAmount = isBuy ? gross + feeAmount : gross - feeAmount
            const movementId = crypto.randomUUID()

            const fee: MovementFee | undefined = feeAmount > 0 ? {
                mode: state.feeMode,
                percent: state.feeMode === 'PERCENT' ? safeFloat(state.feeValue) : undefined,
                amount: feeAmount,
                currency: 'USD',
            } : undefined

            // Allocation meta for sells
            const alloc = !isBuy
                ? allocateSale(fifoLots, qty, state.price, state.costingMethod,
                    state.costingMethod === 'MANUAL' ? state.manualAllocations : undefined)
                : null

            const movementPayload: Movement = {
                id: movementId,
                datetimeISO: new Date(state.datetime).toISOString(),
                type: movementType,
                assetClass: 'crypto',
                instrumentId: instrumentId!,
                accountId: state.accountId,
                ticker,
                assetName: state.asset.name,
                quantity: qty,
                unitPrice: state.price,
                tradeCurrency: 'USD',
                totalAmount: gross,
                fee,
                netAmount,
                totalUSD: netAmount,
                totalARS: netAmount * fxRate,
                fxAtTrade: fxRate,
                fx: {
                    kind: 'CRIPTO',
                    rate: fxRate,
                    side: 'sell',
                    asOf: new Date().toISOString(),
                },
                notes: state.notes || undefined,
                meta: !isBuy ? {
                    costingMethod: state.costingMethod,
                    allocations: alloc?.allocations.map(a => ({
                        lotId: a.lotId,
                        qty: a.qty,
                        costUsd: a.costUsd,
                    })),
                    // Stablecoin settlement
                    ...(ticker === 'USDT' || ticker === 'USDC' || ticker === 'DAI' ? {
                        settlementCurrency: 'ARS' as Currency,
                    } : {}),
                } : undefined,
            }

            await createMovement.mutateAsync(movementPayload)

            // Auto-balance USDT
            const account = accounts.find(a => a.id === state.accountId)
            const isExchange = account?.kind === 'EXCHANGE'
            const isNotStable = !['USDT', 'USDC', 'DAI'].includes(ticker)

            if (isExchange && isNotStable && state.autoBalanceUsdt) {
                const autoType: MovementType = isBuy ? 'SELL' : 'BUY'
                const autoQty = netAmount

                if (autoQty > 0) {
                    const usdtInst = instruments.find(i => i.symbol === 'USDT')
                    const autoMovement: Movement = {
                        id: crypto.randomUUID(),
                        datetimeISO: movementPayload.datetimeISO,
                        type: autoType,
                        assetClass: 'crypto',
                        instrumentId: usdtInst?.id,
                        ticker: 'USDT',
                        assetName: 'Tether USD',
                        accountId: state.accountId,
                        quantity: autoQty,
                        unitPrice: 1,
                        tradeCurrency: 'USD',
                        totalAmount: autoQty,
                        netAmount: autoQty,
                        totalUSD: autoQty,
                        totalARS: autoQty * fxRate,
                        fxAtTrade: fxRate,
                        isAuto: true,
                        linkedMovementId: movementId,
                        reason: 'auto_usdt_balance',
                    }
                    await createMovement.mutateAsync(autoMovement)
                }
            }

            toast({
                title: isBuy ? 'Compra registrada' : 'Venta registrada',
                description: `${qty > 0 ? fmt8(qty) : '0'} ${ticker} a USD ${fmt2(state.price)}`,
                variant: 'default',
            })
            onClose()
        } catch (err) {
            console.error('Crypto wizard: failed to save', err)
            toast({ title: 'Error al guardar', description: 'Intenta nuevamente.', variant: 'error' })
        }
    }

    // ---------------------------------------------------------------------------
    // Stepper UI
    // ---------------------------------------------------------------------------
    const stepLabels = ['Activo', 'Detalles', 'Confirmar']

    const Stepper = () => (
        <div className="flex items-center w-full max-w-sm mx-auto relative mb-6">
            <div className="absolute left-0 top-1/2 w-full h-px bg-white/10 -z-10" />
            {stepLabels.map((label, i) => {
                const num = i + 1
                const active = num === state.step
                const past = num < state.step
                return (
                    <div key={i} className={cn('flex-1 flex flex-col items-center gap-1.5 transition-all', active || past ? 'opacity-100' : 'opacity-40')}>
                        <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-4 border-[#0F172A] transition-colors',
                            active ? (isBuy ? 'bg-indigo-500 text-white' : 'bg-rose-500 text-white')
                                : past ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 border-white/10',
                        )}>
                            {past ? <Check className="w-3.5 h-3.5" /> : num}
                        </div>
                        <span className={cn('text-[10px] font-mono uppercase tracking-wider px-1',
                            active ? 'text-white' : past ? 'text-emerald-500' : 'text-slate-500')}>
                            {label}
                        </span>
                    </div>
                )
            })}
        </div>
    )

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
                Compra
            </button>
            <button
                onClick={() => setMode('sell')}
                className={cn('flex-1 sm:flex-none px-8 py-2 rounded-md text-sm font-medium transition-all',
                    !isBuy ? 'bg-rose-500 text-white shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]' : 'text-slate-400 hover:text-white')}
            >
                Venta
            </button>
        </div>
    )

    // ---------------------------------------------------------------------------
    // STEP 1: Asset + Account
    // ---------------------------------------------------------------------------
    const renderStep1 = () => (
        <div className="max-w-xl mx-auto space-y-6 pt-2 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Crypto Typeahead */}
            <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-slate-400 ml-1">Criptoactivo</label>
                <CryptoTypeahead
                    value={state.asset}
                    onChange={asset => {
                        setState(s => ({
                            ...s,
                            asset,
                            accountId: '',
                            priceManual: false,
                            price: asset ? (cryptoPrices?.[asset.ticker] || 0) : 0,
                            sellQty: '',
                            manualAllocations: [],
                        }))
                    }}
                    placeholder={!isBuy ? 'Buscar cripto con saldo...' : 'Buscar cripto (ej: BTC, ETH)...'}
                />
            </div>

            {/* Account Selector */}
            <div className={cn('space-y-2 transition-opacity', !state.asset ? 'opacity-50 pointer-events-none' : '')}>
                <label className="text-xs font-mono uppercase text-slate-400 ml-1">Cuenta / Exchange</label>
                <AccountSelectCreatable
                    value={state.accountId}
                    onChange={val => setState(s => ({ ...s, accountId: val }))}
                    accounts={!isBuy ? accountsWithBalance : sortedAccounts}
                    placeholder={!isBuy ? 'Cuentas con saldo...' : 'Seleccionar o crear cuenta...'}
                />
            </div>

            {/* Available badge for sell */}
            {!isBuy && state.asset && state.accountId && (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 flex justify-between items-center animate-in fade-in duration-200">
                    <div>
                        <div className="text-xs text-slate-500 font-mono mb-1">
                            Disponible en {accounts.find(a => a.id === state.accountId)?.name || ''}
                        </div>
                        <div className="text-xl text-white font-mono font-bold tracking-tight">
                            {fmt8(availableQty)} {state.asset.ticker}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500 font-mono mb-1">Valor Aprox.</div>
                        <div className="text-lg text-slate-300 font-mono">
                            USD {fmt2(availableQty * (cryptoPrices?.[state.asset.ticker] || 0))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )

    // ---------------------------------------------------------------------------
    // STEP 2 BUY
    // ---------------------------------------------------------------------------
    const renderBuyStep2 = () => (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* LEFT: Inputs */}
            <div className="lg:col-span-7 space-y-6">
                {/* Toggle Monto/Qty */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-xs font-mono uppercase text-slate-400 ml-1">
                            {state.buyMode === 'amount' ? '¿Cuánto querés invertir?' : '¿Cuánto querés comprar?'}
                        </label>
                        <div className="flex bg-slate-950 rounded p-0.5 border border-white/10">
                            <button
                                onClick={() => setState(s => ({ ...s, buyMode: 'amount', buyAmount: '', buyQty: '' }))}
                                className={cn('px-3 py-1 rounded text-[10px] font-bold uppercase transition',
                                    state.buyMode === 'amount' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white')}
                            >
                                Monto
                            </button>
                            <button
                                onClick={() => setState(s => ({ ...s, buyMode: 'qty', buyAmount: '', buyQty: '' }))}
                                className={cn('px-3 py-1 rounded text-[10px] font-bold uppercase transition',
                                    state.buyMode === 'qty' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-white')}
                            >
                                Cantidad
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={state.buyMode === 'amount' ? state.buyAmount : state.buyQty}
                            onChange={e => {
                                const raw = e.target.value.replace(/[^0-9.,]/g, '')
                                if (state.buyMode === 'amount') setState(s => ({ ...s, buyAmount: raw }))
                                else setState(s => ({ ...s, buyQty: raw }))
                            }}
                            placeholder="0.00"
                            className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-xl py-4 px-5 text-2xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        />
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-mono">
                            {state.buyMode === 'amount' ? 'USD' : state.asset?.ticker || ''}
                        </span>
                    </div>
                </div>

                {/* Price & Fee */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-mono uppercase text-slate-400 ml-1">Precio Unit.</label>
                            <button
                                onClick={() => {
                                    const p = cryptoPrices?.[state.asset?.ticker || ''] || 0
                                    if (p > 0) setState(s => ({ ...s, price: p, priceManual: false }))
                                }}
                                className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                            >
                                <RefreshCw className="w-3 h-3" /> Mercado
                            </button>
                        </div>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                            <input
                                type="number"
                                value={state.price || ''}
                                onChange={e => setState(s => ({ ...s, price: parseFloat(e.target.value) || 0, priceManual: true }))}
                                className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 pl-6 pr-3 font-mono text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-mono uppercase text-slate-400 ml-1">Comisión</label>
                            <button
                                onClick={() => setState(s => ({
                                    ...s,
                                    feeMode: s.feeMode === 'PERCENT' ? 'FIXED' : 'PERCENT',
                                    feeValue: s.feeMode === 'PERCENT' ? '0' : '0.1',
                                }))}
                                className="text-[10px] text-indigo-400 hover:underline uppercase"
                            >
                                {state.feeMode === 'PERCENT' ? '%' : 'USD'}
                            </button>
                        </div>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={state.feeValue}
                            onChange={e => setState(s => ({ ...s, feeValue: e.target.value }))}
                            className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 font-mono text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        />
                    </div>
                </div>

                {/* Datetime */}
                <div className="space-y-2">
                    <label className="text-xs font-mono uppercase text-slate-400 ml-1">Fecha y Hora</label>
                    <input
                        type="datetime-local"
                        value={state.datetime}
                        onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                        className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                    />
                </div>
            </div>

            {/* RIGHT: Summary */}
            <div className="lg:col-span-5">
                <div className="bg-slate-950/40 rounded-xl border border-white/5 p-6 flex flex-col sticky top-0">
                    <h3 className="font-display text-lg text-white mb-4">Resumen de Compra</h3>
                    <div className="space-y-3 flex-1">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Precio Mercado</span>
                            <span className="text-white font-mono">USD {fmt2(state.price)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Comisión Est.</span>
                            <span className="text-slate-300 font-mono">USD {fmt2(computed.fee)}</span>
                        </div>
                        <div className="p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 mt-4">
                            <div className="text-xs text-indigo-300 font-mono mb-1 uppercase">Recibís (Est.)</div>
                            <div className="text-2xl text-white font-mono font-bold tracking-tight">
                                {fmt8(computed.qty)} {state.asset?.ticker || ''}
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-white/10 pt-4 mt-4">
                        <div className="flex justify-between items-end">
                            <span className="text-sm font-medium text-slate-400">Total a Pagar</span>
                            <span className="font-mono text-xl font-bold text-white">
                                USD {fmt2(computed.totalPaid)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    // ---------------------------------------------------------------------------
    // STEP 2 SELL
    // ---------------------------------------------------------------------------
    const renderSellStep2 = () => {
        const isManual = state.costingMethod === 'MANUAL'

        // Compute allocation for visual display
        const sellQtyNum = safeFloat(state.sellQty)
        const allocation = !isManual
            ? allocateSale(fifoLots, sellQtyNum, state.price, state.costingMethod)
            : allocateSale(fifoLots, 0, state.price, 'MANUAL', state.manualAllocations)

        return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-right-4 duration-300 pb-16">
                {/* LEFT */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Costing Method Pills */}
                    <div className="space-y-2">
                        <label className="text-xs font-mono uppercase text-slate-400 ml-1">Método de Costeo</label>
                        <div className="flex flex-wrap gap-2">
                            {COSTING_METHODS.map(m => (
                                <button
                                    key={m.value}
                                    onClick={() => setState(s => ({
                                        ...s,
                                        costingMethod: m.value,
                                        manualAllocations: [],
                                        sellQty: m.value === 'MANUAL' ? '' : s.sellQty,
                                    }))}
                                    className={cn(
                                        'px-4 py-1.5 rounded-full text-xs font-bold uppercase border transition',
                                        state.costingMethod === m.value
                                            ? 'bg-white text-slate-900 border-white'
                                            : 'bg-transparent text-slate-500 border-white/10 hover:border-white/30',
                                    )}
                                    title={m.description}
                                >
                                    {m.short}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Qty Input */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-mono uppercase text-slate-400 ml-1">Cantidad a Vender</label>
                            <div className="flex gap-2">
                                {[0.25, 0.5, 1].map(pct => (
                                    <button
                                        key={pct}
                                        onClick={() => {
                                            const v = availableQty * pct
                                            setState(s => ({ ...s, sellQty: v.toString() }))
                                        }}
                                        disabled={isManual}
                                        className={cn(
                                            'text-[10px] px-2 py-0.5 rounded transition',
                                            pct === 1
                                                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 font-bold'
                                                : 'bg-slate-800 text-slate-400 hover:text-white',
                                            isManual && 'opacity-30 cursor-not-allowed',
                                        )}
                                    >
                                        {pct === 1 ? 'MAX' : `${pct * 100}%`}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={isManual
                                    ? (state.manualAllocations.reduce((s, a) => s + a.qty, 0) || '').toString()
                                    : state.sellQty}
                                onChange={e => {
                                    if (isManual) return
                                    setState(s => ({ ...s, sellQty: e.target.value.replace(/[^0-9.,]/g, '') }))
                                }}
                                readOnly={isManual}
                                placeholder="0.00"
                                className={cn(
                                    'w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-xl py-4 px-5 text-2xl font-mono text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition',
                                    isManual && 'opacity-50 cursor-not-allowed',
                                )}
                            />
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-mono">
                                {state.asset?.ticker || ''}
                            </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono text-right">
                            Disponible: {fmt8(availableQty)}
                        </div>
                    </div>

                    {/* Price & Fee */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-mono uppercase text-slate-400 ml-1">Precio Unit.</label>
                                <button
                                    onClick={() => {
                                        const p = cryptoPrices?.[state.asset?.ticker || ''] || 0
                                        if (p > 0) setState(s => ({ ...s, price: p, priceManual: false }))
                                    }}
                                    className="text-[10px] text-rose-400 hover:underline flex items-center gap-1"
                                >
                                    <RefreshCw className="w-3 h-3" /> Mercado
                                </button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                <input
                                    type="number"
                                    value={state.price || ''}
                                    onChange={e => setState(s => ({ ...s, price: parseFloat(e.target.value) || 0, priceManual: true }))}
                                    className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 pl-6 pr-3 font-mono text-sm text-white focus:outline-none focus:border-rose-500 transition"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-mono uppercase text-slate-400 ml-1">Comisión</label>
                                <button
                                    onClick={() => setState(s => ({
                                        ...s,
                                        feeMode: s.feeMode === 'PERCENT' ? 'FIXED' : 'PERCENT',
                                        feeValue: s.feeMode === 'PERCENT' ? '0' : '0.1',
                                    }))}
                                    className="text-[10px] text-rose-400 hover:underline uppercase"
                                >
                                    {state.feeMode === 'PERCENT' ? '%' : 'USD'}
                                </button>
                            </div>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={state.feeValue}
                                onChange={e => setState(s => ({ ...s, feeValue: e.target.value }))}
                                className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 font-mono text-sm text-white focus:outline-none focus:border-rose-500 transition"
                            />
                        </div>
                    </div>

                    {/* Datetime */}
                    <div className="space-y-2">
                        <label className="text-xs font-mono uppercase text-slate-400 ml-1">Fecha y Hora</label>
                        <input
                            type="datetime-local"
                            value={state.datetime}
                            onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                            className="w-full bg-[rgba(2,6,23,0.5)] border border-white/[0.08] rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-rose-500 transition"
                        />
                    </div>

                    {/* Lot Table */}
                    {fifoLots.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-xs font-mono uppercase text-slate-400 ml-1">Lotes Disponibles</label>
                            <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-900/30">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-white/5 text-slate-400 border-b border-white/10">
                                        <tr>
                                            {isManual && <th className="p-3 w-8">#</th>}
                                            <th className="p-3 font-normal">Fecha</th>
                                            <th className="p-3 font-normal text-right">Disp.</th>
                                            <th className="p-3 font-normal text-right">Costo Unit.</th>
                                            <th className="p-3 font-normal text-right text-rose-400">
                                                {isManual ? 'Vender' : 'Consumo'}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-slate-300">
                                        {fifoLots.map((lot) => {
                                            // Find consumed qty for auto methods
                                            const consumed = !isManual
                                                ? allocation.allocations.find(a => a.lotId === lot.id)?.qty || 0
                                                : 0
                                            const manualQty = state.manualAllocations.find(a => a.lotId === lot.id)?.qty || 0
                                            const isChecked = state.manualAllocations.some(a => a.lotId === lot.id)

                                            return (
                                                <tr key={lot.id} className={cn(
                                                    'transition',
                                                    consumed > 0 && !isManual && 'bg-rose-500/5',
                                                )}>
                                                    {isManual && (
                                                        <td className="p-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={e => {
                                                                    setState(s => {
                                                                        let allocs = [...s.manualAllocations]
                                                                        if (e.target.checked) {
                                                                            allocs.push({ lotId: lot.id, qty: lot.qty })
                                                                        } else {
                                                                            allocs = allocs.filter(a => a.lotId !== lot.id)
                                                                        }
                                                                        return { ...s, manualAllocations: allocs }
                                                                    })
                                                                }}
                                                                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-rose-500 focus:ring-rose-500"
                                                            />
                                                        </td>
                                                    )}
                                                    <td className="p-3">{new Date(lot.dateISO).toLocaleDateString('es-AR')}</td>
                                                    <td className="p-3 text-right">{fmt8(lot.qty)}</td>
                                                    <td className="p-3 text-right">USD {fmt2(lot.unitCostNative)}</td>
                                                    <td className="p-3 text-right">
                                                        {isManual ? (
                                                            isChecked ? (
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    value={manualQty || ''}
                                                                    onChange={e => {
                                                                        const val = Math.min(safeFloat(e.target.value), lot.qty)
                                                                        setState(s => ({
                                                                            ...s,
                                                                            manualAllocations: s.manualAllocations.map(a =>
                                                                                a.lotId === lot.id ? { ...a, qty: val } : a
                                                                            ),
                                                                        }))
                                                                    }}
                                                                    className="w-24 bg-slate-800 border border-rose-500/30 rounded px-2 py-1 text-right text-rose-400 font-mono text-xs focus:outline-none focus:border-rose-500"
                                                                />
                                                            ) : (
                                                                <span className="text-slate-600">—</span>
                                                            )
                                                        ) : (
                                                            consumed > 0
                                                                ? <span className="text-rose-400 font-bold">{fmt8(consumed)}</span>
                                                                : <span className="text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT: Summary */}
                <div className="lg:col-span-5 relative">
                    <div className="sticky top-0 bg-slate-950/40 rounded-xl border border-white/5 p-6 flex flex-col space-y-6">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <h3 className="font-display text-lg text-white">Resumen de Venta</h3>
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wide">
                                Egreso
                            </span>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Venta Bruta</span>
                                <span className="text-white font-mono">USD {fmt2(computed.gross)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Comisión</span>
                                <span className="text-rose-400 font-mono">- USD {fmt2(computed.fee)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-white/5">
                                <span className="text-slate-400 font-medium">Neto a Recibir</span>
                                <span className="text-white font-mono font-bold">USD {fmt2(computed.net)}</span>
                            </div>
                        </div>

                        <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 border border-white/5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">
                                    Costo ({COSTING_METHODS.find(m => m.value === state.costingMethod)?.short || ''})
                                </span>
                                <span className="text-slate-300 font-mono">USD {fmt2(computed.costBasis)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                                <span className="text-slate-400 font-medium">Resultado (P&L)</span>
                                <span className={cn('font-mono font-bold',
                                    computed.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                    {computed.pnl >= 0 ? '+' : ''}USD {fmt2(computed.pnl)}
                                </span>
                            </div>
                        </div>
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
                    Confirmar {isBuy ? 'Compra' : 'Venta'}
                </h2>
                <p className="text-slate-400 text-sm">Se actualizarán tus saldos al instante.</p>
            </div>

            {/* Detail card */}
            <div className="bg-slate-900/40 rounded-xl border border-white/10 p-6 space-y-4 text-sm text-left">
                <div className="flex justify-between">
                    <span className="text-slate-500">Cuenta</span>
                    <span className="text-white font-medium">{accounts.find(a => a.id === state.accountId)?.name || ''}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Activo</span>
                    <span className="text-white font-mono">{state.asset?.ticker || ''}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Cantidad</span>
                    <span className="text-white font-mono font-bold text-lg">{fmt8(computed.qty)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-500">Precio Unit.</span>
                    <span className="text-white font-mono">USD {fmt2(state.price)}</span>
                </div>
                {computed.fee > 0 && (
                    <div className="flex justify-between">
                        <span className="text-slate-500">Comisión</span>
                        <span className="text-rose-400 font-mono">USD {fmt2(computed.fee)}</span>
                    </div>
                )}
                <div className="w-full h-px bg-white/10 my-2" />
                <div className="flex justify-between items-center">
                    <span className="text-slate-500">{isBuy ? 'Total Pagado' : 'Total Recibido'}</span>
                    <span className="text-xl text-white font-mono font-bold">
                        USD {fmt2(isBuy ? computed.totalPaid : computed.net)}
                    </span>
                </div>
                {!isBuy && (
                    <div className="flex justify-between items-center text-xs mt-2">
                        <span className="text-slate-500">Ganancia / Pérdida</span>
                        <span className={cn('font-mono', computed.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                            {computed.pnl >= 0 ? '+' : ''}USD {fmt2(computed.pnl)}
                        </span>
                    </div>
                )}
            </div>

            {/* Auto-balance USDT checkbox */}
            {state.asset && !['USDT', 'USDC', 'DAI'].includes(state.asset.ticker) &&
                accounts.find(a => a.id === state.accountId)?.kind === 'EXCHANGE' && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-white/5 text-left">
                        <input
                            type="checkbox"
                            checked={state.autoBalanceUsdt}
                            onChange={e => setState(s => ({ ...s, autoBalanceUsdt: e.target.checked }))}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                        />
                        <div className="text-sm">
                            <div className="text-slate-300 font-medium">Liquidación automática en USDT</div>
                            <div className="text-[10px] text-slate-500">Generar movimiento espejo en USDT</div>
                        </div>
                    </div>
                )}
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
                <Stepper />
                {state.step === 1 && renderStep1()}
                {state.step === 2 && (isBuy ? renderBuyStep2() : renderSellStep2())}
                {state.step === 3 && renderStep3()}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 bg-slate-900/60 flex justify-between items-center backdrop-blur-md shrink-0">
                {state.step > 1 ? (
                    <button onClick={prevStep} className="px-6 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Volver
                    </button>
                ) : <div />}
                <button
                    onClick={nextStep}
                    disabled={!canAdvance}
                    className={cn(
                        'px-8 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2 text-white',
                        state.step === 3
                            ? (isBuy
                                ? 'bg-indigo-500 hover:bg-indigo-600 shadow-[0_0_20px_-5px_rgba(99,102,241,0.3)]'
                                : 'bg-rose-500 hover:bg-rose-600 shadow-[0_0_20px_-5px_rgba(244,63,94,0.3)]')
                            : canAdvance
                                ? (isBuy ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-rose-500 hover:bg-rose-600')
                                : 'bg-slate-700 opacity-50 cursor-not-allowed',
                    )}
                >
                    {state.step === 3 ? (isBuy ? 'Confirmar Compra' : 'Confirmar Venta') : 'Siguiente'}
                </button>
            </div>
        </>
    )
}
