import { useState, useMemo, useEffect } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Movement, Account, Instrument, MovementType, MovementFee } from '@/domain/types'
import { AssetTypeahead, type AssetOption } from '../AssetTypeahead'
import { AccountSelectCreatable } from '../AccountSelectCreatable'
import { useCreateMovement } from '@/hooks/use-movements'
import { useCreateInstrument } from '@/hooks/use-instruments'
import { useCedearPrices } from '@/hooks/use-cedear-prices'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useToast } from '@/components/ui/toast'
import { buildFifoLots } from '@/domain/portfolio/fifo'
import { allocateSale, COSTING_METHODS, type CostingMethod, type ManualAllocation } from '@/domain/portfolio/lot-allocation'
import type { LotDetail } from '@/features/portfolioV2/types'
import { listCedears } from '@/domain/cedears/master'
import { sortAccountsForAssetClass } from '../wizard-helpers'
import { formatMoneyARS } from '@/lib/format'
import { WizardStepper } from '../ui/WizardStepper'
import { WizardFooter } from '../ui/WizardFooter'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Mode = 'buy' | 'sell'
type Step = 1 | 2 | 3

interface CedearWizardState {
    mode: Mode
    step: Step
    // Step 1
    asset: AssetOption | null
    accountId: string
    datetime: string
    // Step 2
    currency: 'ARS' | 'USD'
    price: number
    priceManual: boolean
    qty: number
    qtyStr: string
    feeMode: 'PERCENT' | 'FIXED'
    feeValue: string
    fxAtTrade: number
    fxAtTradeManual: boolean
    // Sell
    costingMethod: CostingMethod
    manualAllocations: ManualAllocation[]
    notes: string
}

interface CedearBuySellWizardProps {
    accounts: Account[]
    movements: Movement[]
    instruments: Instrument[]
    onClose: () => void
    onBackToAssetType?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const safeFloat = (s: string): number => {
    const v = parseFloat(s.replace(',', '.'))
    return Number.isFinite(v) ? v : 0
}

const fmt2 = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—'

const fmtArs = (n: number) => Number.isFinite(n) && n !== 0 ? formatMoneyARS(n) : '—'

const FX_MEP_FALLBACK = 1180.5

// Filter COSTING_METHODS to exclude CHEAPEST (not in spec)
const CEDEAR_COSTING_METHODS = COSTING_METHODS.filter(m => m.value !== 'CHEAPEST')

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CedearBuySellWizard({
    accounts,
    movements,
    instruments,
    onClose,
    onBackToAssetType,
}: CedearBuySellWizardProps) {
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const { data: cedearPrices } = useCedearPrices()
    const { data: fxRates } = useFxRates()
    const { toast } = useToast()

    const mepSellRate = fxRates?.mep?.sell ?? FX_MEP_FALLBACK
    const mepBuyRate = fxRates?.mep?.buy ?? mepSellRate

    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

    const [state, setState] = useState<CedearWizardState>({
        mode: 'buy',
        step: 1,
        asset: null,
        accountId: '',
        datetime: now.toISOString().slice(0, 16),
        currency: 'ARS',
        price: 0,
        priceManual: false,
        qty: 0,
        qtyStr: '',
        feeMode: 'PERCENT',
        feeValue: '0.5',
        fxAtTrade: mepSellRate,
        fxAtTradeManual: false,
        costingMethod: 'PPP',
        manualAllocations: [],
        notes: '',
    })

    const isBuy = state.mode === 'buy'

    // Effective FX: use user-edited value, or auto-set based on mode
    const effectiveFx = state.fxAtTrade

    // Sorted accounts for cedear (brokers first)
    const sortedAccounts = useMemo(
        () => sortAccountsForAssetClass(accounts, 'cedear'),
        [accounts],
    )

    // ---------------------------------------------------------------------------
    // CEDEAR master list for typeahead
    // ---------------------------------------------------------------------------
    const cedearOptions: AssetOption[] = useMemo(() => {
        return listCedears().map(c => ({
            id: c.ticker,
            ticker: c.ticker,
            name: c.name,
            category: 'CEDEAR',
        }))
    }, [])

    // ---------------------------------------------------------------------------
    // Holdings: ticker -> accountId -> qty
    // ---------------------------------------------------------------------------
    const holdingsByTicker = useMemo(() => {
        const map = new Map<string, Map<string, number>>()
        movements.forEach(m => {
            if (m.assetClass !== 'cedear') return
            const ticker = m.ticker || instruments.find(i => i.id === m.instrumentId)?.symbol
            if (!ticker) return
            const q = m.quantity || 0
            if (!map.has(ticker)) map.set(ticker, new Map())
            const accMap = map.get(ticker)!
            const cur = accMap.get(m.accountId) || 0
            if (['BUY', 'DEPOSIT', 'TRANSFER_IN'].includes(m.type)) accMap.set(m.accountId, cur + q)
            if (['SELL', 'WITHDRAW', 'TRANSFER_OUT'].includes(m.type)) accMap.set(m.accountId, cur - q)
        })
        return map
    }, [movements, instruments])

    // Available qty for sell
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
            m.assetClass === 'cedear' &&
            m.accountId === state.accountId &&
            (m.instrumentId === instId || (!m.instrumentId && m.ticker === ticker))
        )
        if (assetMoves.length === 0) return []

        const fifo = buildFifoLots(assetMoves)
        const currentPriceArs = cedearPrices?.[ticker]?.lastPriceArs || 0
        const priceNative = state.currency === 'ARS' ? currentPriceArs : (mepSellRate > 0 ? currentPriceArs / mepSellRate : 0)

        return fifo.lots.map((lot, idx) => ({
            id: `lot-${idx}`,
            dateISO: lot.date,
            qty: lot.quantity,
            unitCostNative: lot.unitCostNative,
            totalCostNative: lot.quantity * lot.unitCostNative,
            currentValueNative: lot.quantity * priceNative,
            pnlNative: lot.quantity * priceNative - lot.quantity * lot.unitCostNative,
            pnlPct: lot.unitCostNative > 0 ? (priceNative - lot.unitCostNative) / lot.unitCostNative : 0,
        }))
    }, [state.asset, state.accountId, isBuy, movements, instruments, cedearPrices, state.currency, mepSellRate])

    // Accounts with balance for a ticker (sell mode)
    const accountsWithBalance = useMemo(() => {
        if (!state.asset) return []
        const ticker = state.asset.ticker
        const accMap = holdingsByTicker.get(ticker)
        if (!accMap) return []
        return accounts.filter(a => (accMap.get(a.id) || 0) > 0.5)
    }, [state.asset, accounts, holdingsByTicker])

    // Owned tickers for sell mode filtering
    const ownedTickers = useMemo(() => {
        const tickers = new Set<string>()
        holdingsByTicker.forEach((accMap, ticker) => {
            let total = 0
            accMap.forEach(qty => { total += qty })
            if (total > 0.5) tickers.add(ticker)
        })
        return tickers
    }, [holdingsByTicker])

    // Filtered options for sell mode
    const filteredCedearOptions = useMemo(() => {
        if (isBuy) return cedearOptions
        return cedearOptions.filter(o => ownedTickers.has(o.ticker))
    }, [isBuy, cedearOptions, ownedTickers])

    // Auto-select account when only 1 option (sell)
    useEffect(() => {
        if (!isBuy && accountsWithBalance.length === 1 && state.accountId !== accountsWithBalance[0].id) {
            setState(s => ({ ...s, accountId: accountsWithBalance[0].id }))
        }
    }, [isBuy, accountsWithBalance, state.accountId])

    // Auto-fill price from market when asset or currency changes
    useEffect(() => {
        if (state.asset && cedearPrices && !state.priceManual) {
            const priceArs = cedearPrices[state.asset.ticker]?.lastPriceArs || 0
            if (priceArs > 0) {
                const p = state.currency === 'ARS' ? priceArs : (mepSellRate > 0 ? priceArs / mepSellRate : 0)
                setState(s => ({ ...s, price: p }))
            }
        }
    }, [state.asset, cedearPrices, state.priceManual, state.currency, mepSellRate])

    // Auto-set fxAtTrade when mode changes (if not manually edited)
    useEffect(() => {
        if (!state.fxAtTradeManual) {
            setState(s => ({ ...s, fxAtTrade: isBuy ? mepSellRate : mepBuyRate }))
        }
    }, [isBuy, mepSellRate, mepBuyRate, state.fxAtTradeManual])

    // ---------------------------------------------------------------------------
    // Computed values
    // ---------------------------------------------------------------------------
    const computed = useMemo(() => {
        const feeVal = safeFloat(state.feeValue)
        const price = state.price
        const qty = state.qty

        const gross = qty * price
        const fee = state.feeMode === 'PERCENT' ? gross * (feeVal / 100) : feeVal

        if (isBuy) {
            const totalPaid = gross + fee
            return { qty, gross, fee, net: gross, totalPaid, costBasis: 0, pnl: 0 }
        } else {
            const net = gross - fee

            // Allocation for costing (use ARS-based cost if currency is ARS, etc.)
            const alloc = allocateSale(fifoLots, qty, price, state.costingMethod,
                state.costingMethod === 'MANUAL' ? state.manualAllocations : undefined)

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

    // Total in the alternate currency (uses user-editable TC)
    const altCurrency = useMemo(() => {
        if (state.currency === 'ARS') {
            return { label: 'USD (MEP)', value: effectiveFx > 0 ? computed.gross / effectiveFx : 0 }
        }
        return { label: 'ARS', value: computed.gross * effectiveFx }
    }, [state.currency, computed.gross, effectiveFx])

    // Market price reference (always uses market MEP sell for display)
    const marketPriceRef = useMemo(() => {
        if (!state.asset || !cedearPrices) return null
        const priceArs = cedearPrices[state.asset.ticker]?.lastPriceArs
        if (!priceArs) return null
        return {
            ars: priceArs,
            usd: mepSellRate > 0 ? priceArs / mepSellRate : 0,
        }
    }, [state.asset, cedearPrices, mepSellRate])

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
            if (state.qty <= 0) return false
            if (!Number.isInteger(state.qty)) return false
            if (state.price <= 0) return false
            if (!isBuy) {
                if (state.qty > availableQty) return false
                if (state.costingMethod === 'MANUAL') {
                    const sumManual = state.manualAllocations.reduce((s, a) => s + a.qty, 0)
                    if (sumManual <= 0) return false
                }
            }
            return true
        }
        return true // step 3
    }, [state, isBuy, availableQty])

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
        else if (onBackToAssetType) onBackToAssetType()
        else onClose()
    }

    const setMode = (mode: Mode) => {
        setState(s => ({
            ...s,
            mode,
            step: 1,
            asset: null,
            accountId: '',
            qty: 0,
            qtyStr: '',
            manualAllocations: [],
            priceManual: false,
            price: 0,
            fxAtTrade: mode === 'buy' ? mepSellRate : mepBuyRate,
            fxAtTradeManual: false,
        }))
    }

    const autoPrice = () => {
        if (!state.asset || !cedearPrices) return
        const priceArs = cedearPrices[state.asset.ticker]?.lastPriceArs || 0
        if (priceArs > 0) {
            const p = state.currency === 'ARS' ? priceArs : (mepSellRate > 0 ? priceArs / mepSellRate : 0)
            setState(s => ({ ...s, price: p, priceManual: false }))
        }
    }

    // ---------------------------------------------------------------------------
    // Confirm / Persist
    // ---------------------------------------------------------------------------
    const handleConfirm = async () => {
        if (!state.asset || !state.accountId) return

        try {
            const ticker = state.asset.ticker
            const inst = instruments.find(i => i.symbol === ticker)
            let instrumentId = inst?.id

            if (!instrumentId) {
                const newInst: Instrument = {
                    id: crypto.randomUUID(),
                    symbol: ticker,
                    name: state.asset.name,
                    category: 'CEDEAR',
                    nativeCurrency: 'ARS',
                    priceKey: ticker.toLowerCase(),
                }
                await (createInstrument as any).mutateAsync(newInst)
                instrumentId = newInst.id
            }

            const movementType: MovementType = isBuy ? 'BUY' : 'SELL'
            const qty = computed.qty
            const gross = computed.gross
            const feeAmount = computed.fee
            const netAmount = isBuy ? gross + feeAmount : gross - feeAmount
            const movementId = crypto.randomUUID()

            // Dual currency totals (using user-editable TC)
            let totalARS: number, totalUSD: number
            if (state.currency === 'ARS') {
                totalARS = netAmount
                totalUSD = effectiveFx > 0 ? netAmount / effectiveFx : 0
            } else {
                totalUSD = netAmount
                totalARS = netAmount * effectiveFx
            }

            const fee: MovementFee | undefined = feeAmount > 0 ? {
                mode: state.feeMode,
                percent: state.feeMode === 'PERCENT' ? safeFloat(state.feeValue) : undefined,
                amount: feeAmount,
                currency: state.currency as any,
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
                assetClass: 'cedear',
                instrumentId: instrumentId!,
                accountId: state.accountId,
                ticker,
                assetName: state.asset.name,
                quantity: qty,
                unitPrice: state.price,
                tradeCurrency: state.currency as any,
                totalAmount: gross,
                fee,
                netAmount,
                totalUSD,
                totalARS,
                fxAtTrade: effectiveFx,
                fx: {
                    kind: 'MEP',
                    rate: effectiveFx,
                    side: isBuy ? 'sell' : 'buy',
                    asOf: new Date().toISOString(),
                },
                notes: state.notes || undefined,
                meta: !isBuy && alloc ? {
                    allocations: alloc.allocations,
                    costingMethod: state.costingMethod,
                } : undefined,
            }

            await createMovement.mutateAsync(movementPayload as Movement)

            toast({
                title: 'Movimiento creado',
                description: `${isBuy ? 'Compra' : 'Venta'} de ${qty} ${ticker} registrada correctamente.`,
                variant: 'default',
            })

            onClose()
        } catch (error) {
            console.error('Failed to save CEDEAR movement', error)
            toast({
                title: 'Error al guardar',
                description: 'No se pudo registrar el movimiento. Intenta nuevamente.',
                variant: 'error',
            })
        }
    }

    // ---------------------------------------------------------------------------
    // Currency symbol helper
    // ---------------------------------------------------------------------------
    const currSymbol = state.currency === 'ARS' ? '$' : 'US$'

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* LEFT: Wizard Form */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Stepper (offset +1 so internal step 1 shows as visual step 2) */}
                <div className="px-8 pt-4 pb-2 shrink-0">
                    <WizardStepper currentStep={1 + state.step} totalSteps={1 + 3} />
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto px-8 pb-8">
                    {/* ============================================================ */}
                    {/* STEP 1: Selección de Activo                                  */}
                    {/* ============================================================ */}
                    {state.step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Buy/Sell Toggle */}
                            <div className="inline-flex bg-black/40 p-1 rounded-lg border border-white/5">
                                <button
                                    onClick={() => setMode('buy')}
                                    className={cn(
                                        'px-6 py-2 rounded-md text-sm font-bold transition-all',
                                        isBuy
                                            ? 'bg-emerald-500/10 text-emerald-400 shadow-sm ring-1 ring-emerald-500/20'
                                            : 'text-slate-400 hover:text-white'
                                    )}
                                >
                                    Compra
                                </button>
                                <button
                                    onClick={() => setMode('sell')}
                                    className={cn(
                                        'px-6 py-2 rounded-md text-sm font-bold transition-all',
                                        !isBuy
                                            ? 'bg-rose-500/10 text-rose-400 shadow-sm ring-1 ring-rose-500/20'
                                            : 'text-slate-400 hover:text-white'
                                    )}
                                >
                                    Venta
                                </button>
                            </div>

                            <div className="space-y-5 max-w-lg">
                                {/* Ticker */}
                                <div>
                                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                        Activo (CEDEAR)
                                    </label>
                                    <AssetTypeahead
                                        value={state.asset}
                                        onChange={asset => {
                                            setState(s => ({
                                                ...s,
                                                asset,
                                                priceManual: false,
                                                price: 0,
                                                qty: 0,
                                                qtyStr: '',
                                                manualAllocations: [],
                                                // Auto-reset account for sell when changing ticker
                                                ...(!isBuy ? { accountId: '' } : {}),
                                            }))
                                        }}
                                        options={filteredCedearOptions}
                                        placeholder={isBuy ? 'Buscar CEDEAR (ej: SPY, KO, MELI)...' : 'CEDEARs con tenencia...'}
                                    />
                                    {!isBuy && state.asset && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-slate-500">Disponible total:</span>
                                            <span className="text-xs font-mono text-white bg-slate-800 px-2 py-0.5 rounded">
                                                {Math.floor(
                                                    Array.from(holdingsByTicker.get(state.asset.ticker)?.values() || [])
                                                        .reduce((s, q) => s + q, 0)
                                                )} nominales
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Account / Broker */}
                                <div>
                                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                        Cuenta / Broker
                                    </label>
                                    <AccountSelectCreatable
                                        value={state.accountId}
                                        onChange={val => setState(s => ({
                                            ...s,
                                            accountId: val,
                                            // Reset qty/alloc on account change
                                            qty: 0, qtyStr: '', manualAllocations: [],
                                        }))}
                                        accounts={!isBuy && state.asset ? accountsWithBalance : sortedAccounts}
                                        placeholder={!isBuy ? 'Brokers con tenencia...' : 'Ej: IOL, Balanz, Cocos...'}
                                    />
                                    {!isBuy && state.asset && accountsWithBalance.length === 1 && (
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            Única cuenta con tenencia disponible.
                                        </p>
                                    )}
                                </div>

                                {/* Date */}
                                <div>
                                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                        Fecha
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={state.datetime}
                                        onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                                        className="w-full bg-slate-900 border border-white/10 rounded-lg py-3 px-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ============================================================ */}
                    {/* STEP 2: Detalles & Precios                                   */}
                    {/* ============================================================ */}
                    {state.step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Currency & Price Row */}
                            <div className="grid grid-cols-2 gap-6">
                                {/* Currency Toggle */}
                                <div>
                                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                        Moneda
                                    </label>
                                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10 w-fit">
                                        <button
                                            onClick={() => {
                                                setState(s => ({ ...s, currency: 'ARS', priceManual: false, price: 0 }))
                                            }}
                                            className={cn(
                                                'px-4 py-1.5 rounded-md text-xs font-bold transition',
                                                state.currency === 'ARS'
                                                    ? 'bg-white/10 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            )}
                                        >
                                            ARS
                                        </button>
                                        <button
                                            onClick={() => {
                                                setState(s => ({ ...s, currency: 'USD', priceManual: false, price: 0 }))
                                            }}
                                            className={cn(
                                                'px-4 py-1.5 rounded-md text-xs font-bold transition',
                                                state.currency === 'USD'
                                                    ? 'bg-white/10 text-white shadow-sm'
                                                    : 'text-slate-400 hover:text-white'
                                            )}
                                        >
                                            USD (MEP)
                                        </button>
                                    </div>
                                </div>

                                {/* Tipo de Cambio (ARS/USD) */}
                                <div>
                                    <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                        TC (ARS/USD)
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm pointer-events-none">
                                            $
                                        </div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={state.fxAtTrade || ''}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value) || 0
                                                setState(s => ({ ...s, fxAtTrade: val, fxAtTradeManual: true }))
                                            }}
                                            className="w-full pl-8 pr-16 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                                        />
                                        <button
                                            onClick={() => {
                                                setState(s => ({
                                                    ...s,
                                                    fxAtTrade: isBuy ? mepSellRate : mepBuyRate,
                                                    fxAtTradeManual: false,
                                                }))
                                            }}
                                            className="absolute right-2 top-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded uppercase hover:bg-indigo-500/30 transition"
                                        >
                                            Auto
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        MEP: <span className="font-mono text-slate-300">Vta $ {fmt2(mepSellRate)}</span>
                                        {' / '}
                                        <span className="font-mono text-slate-300">Cpa $ {fmt2(mepBuyRate)}</span>
                                    </p>
                                </div>
                            </div>

                            {/* Unit Price */}
                            <div>
                                <label className="block text-xs font-mono text-slate-400 mb-2 uppercase">
                                    Precio Unitario
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm pointer-events-none">
                                        {currSymbol}
                                    </div>
                                    <input
                                        type="number"
                                        value={state.price || ''}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value) || 0
                                            setState(s => ({ ...s, price: val, priceManual: true }))
                                        }}
                                        className={cn("w-full pr-16 py-2.5 bg-slate-900 border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition", state.currency === 'USD' ? 'pl-14' : 'pl-8')}
                                    />
                                    <button
                                        onClick={autoPrice}
                                        className="absolute right-2 top-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded uppercase hover:bg-indigo-500/30 transition"
                                    >
                                        Auto
                                    </button>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                                    <span>
                                        Mercado:{' '}
                                        <span className="text-slate-300">
                                            {marketPriceRef
                                                ? state.currency === 'ARS'
                                                    ? fmtArs(marketPriceRef.ars)
                                                    : `US$ ${fmt2(marketPriceRef.usd)}`
                                                : '—'}
                                        </span>
                                    </span>
                                </div>
                            </div>

                            {/* Quantity & Total Panel */}
                            <div className="p-6 bg-slate-900/40 border border-white/5 rounded-xl space-y-6">
                                {/* Quantity */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-xs font-mono text-slate-400 uppercase">
                                            Cantidad (Nominales)
                                        </label>
                                        {!isBuy && availableQty > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setState(s => ({
                                                    ...s,
                                                    qty: Math.floor(availableQty),
                                                    qtyStr: Math.floor(availableQty).toString(),
                                                }))}
                                                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
                                            >
                                                Máx: {Math.floor(availableQty)}
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={state.qtyStr || ''}
                                        onChange={e => {
                                            const raw = e.target.value
                                            const val = parseInt(raw) || 0
                                            setState(s => ({ ...s, qtyStr: raw, qty: val }))
                                        }}
                                        placeholder="0"
                                        className="w-full text-3xl font-display font-bold bg-transparent border-b border-white/10 pb-2 text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition"
                                    />
                                </div>

                                {/* Total */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-xs font-mono text-slate-400 uppercase">
                                            Total Operación
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xl text-slate-400 font-mono pointer-events-none">
                                            {currSymbol}
                                        </span>
                                        <input
                                            type="number"
                                            value={computed.gross > 0 ? computed.gross.toFixed(2) : ''}
                                            onChange={e => {
                                                const total = parseFloat(e.target.value) || 0
                                                if (state.price > 0) {
                                                    const newQty = Math.floor(total / state.price)
                                                    setState(s => ({
                                                        ...s,
                                                        qty: newQty,
                                                        qtyStr: newQty.toString(),
                                                    }))
                                                }
                                            }}
                                            placeholder="0.00"
                                            className={cn("w-full text-xl font-mono bg-transparent border-b border-white/10 pb-2 text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition", state.currency === 'USD' ? 'pl-14' : 'pl-8')}
                                        />
                                    </div>
                                </div>

                                {/* Commission */}
                                <div className="flex items-center gap-4 pt-2">
                                    <label className="text-xs font-mono text-slate-400 uppercase">Comisión</label>
                                    <div className="flex items-center bg-black/40 rounded border border-white/10 overflow-hidden">
                                        <button
                                            onClick={() => setState(s => ({ ...s, feeMode: 'PERCENT' }))}
                                            className={cn(
                                                'px-2 py-1 text-xs font-medium',
                                                state.feeMode === 'PERCENT' ? 'bg-white/10 text-white' : 'text-slate-500'
                                            )}
                                        >
                                            %
                                        </button>
                                        <button
                                            onClick={() => setState(s => ({ ...s, feeMode: 'FIXED' }))}
                                            className={cn(
                                                'px-2 py-1 text-xs font-medium',
                                                state.feeMode === 'FIXED' ? 'bg-white/10 text-white' : 'text-slate-500'
                                            )}
                                        >
                                            {currSymbol}
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        value={state.feeValue}
                                        onChange={e => setState(s => ({ ...s, feeValue: e.target.value }))}
                                        className="w-20 bg-transparent border-b border-white/10 text-sm text-right text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* SELL: Lot Selection */}
                            {!isBuy && (
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <h3 className="font-display text-sm text-slate-300">
                                        Método de descarga (Costos)
                                    </h3>
                                    <div className="flex gap-2 flex-wrap">
                                        {CEDEAR_COSTING_METHODS.map(m => (
                                            <button
                                                key={m.value}
                                                onClick={() => setState(s => ({
                                                    ...s,
                                                    costingMethod: m.value,
                                                    manualAllocations: [],
                                                }))}
                                                className={cn(
                                                    'px-3 py-1.5 rounded-full border text-xs transition',
                                                    state.costingMethod === m.value
                                                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 font-bold'
                                                        : 'border-white/10 text-slate-400 hover:text-white'
                                                )}
                                                title={m.description}
                                            >
                                                {m.short}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Lot Table */}
                                    {fifoLots.length > 0 && (
                                        <LotTable
                                            lots={fifoLots}
                                            qty={state.qty}
                                            costingMethod={state.costingMethod}
                                            manualAllocations={state.manualAllocations}
                                            onManualChange={allocs => setState(s => ({ ...s, manualAllocations: allocs }))}
                                            currSymbol={currSymbol}
                                        />
                                    )}

                                    {/* Sell qty validation */}
                                    {state.qty > availableQty && availableQty > 0 && (
                                        <p className="text-xs text-rose-400">
                                            No podés vender más de {Math.floor(availableQty)} nominales.
                                        </p>
                                    )}
                                    {state.costingMethod === 'MANUAL' && state.manualAllocations.length > 0 && (
                                        <p className="text-xs text-slate-400">
                                            Seleccionado: {state.manualAllocations.reduce((s, a) => s + a.qty, 0)} /{' '}
                                            {state.qty > 0 ? state.qty : '—'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* BUY: Holding Preview */}
                            {isBuy && computed.qty > 0 && (
                                <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                    <p className="text-xs text-emerald-400 font-medium mb-1">Impacto en cartera</p>
                                    <p className="text-[11px] text-slate-400">
                                        Sumarás {computed.qty} nominales de {state.asset?.ticker || '—'} a tu posición.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============================================================ */}
                    {/* STEP 3: Confirmación                                          */}
                    {/* ============================================================ */}
                    {state.step === 3 && (
                        <div className="flex flex-col items-center justify-center pt-10 text-center animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6 ring-1 ring-white/10">
                                <span className="text-3xl">{isBuy ? '📥' : '📤'}</span>
                            </div>
                            <h2 className="font-display text-2xl font-bold text-white mb-2">Revisá los datos</h2>
                            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-8">
                                Estás a punto de registrar un movimiento en tu portafolio. Esto no opera en el mercado real.
                            </p>

                            {/* Confirm Card */}
                            <div className="w-full max-w-md bg-slate-900/50 rounded-xl border border-white/10 p-6 text-left space-y-4">
                                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                                    <span className="text-sm text-slate-400">Operación</span>
                                    <span className={cn(
                                        'font-mono font-bold',
                                        isBuy ? 'text-emerald-400' : 'text-rose-400'
                                    )}>
                                        {isBuy ? 'COMPRA' : 'VENTA'} CEDEAR
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Activo</span>
                                    <span className="font-mono text-white">
                                        {state.asset?.ticker} ({accounts.find(a => a.id === state.accountId)?.name || '—'})
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Cantidad</span>
                                    <span className="font-mono text-white">{computed.qty}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Precio</span>
                                    <span className="font-mono text-white">
                                        {currSymbol} {fmt2(state.price)}
                                    </span>
                                </div>
                                {computed.fee > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-400">Comisión</span>
                                        <span className="font-mono text-rose-400">
                                            -{currSymbol} {fmt2(computed.fee)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-400">Tipo de Cambio</span>
                                    <span className="font-mono text-slate-300 text-xs">
                                        $ {fmt2(effectiveFx)} {state.fxAtTradeManual && <span className="text-amber-400">(manual)</span>}
                                    </span>
                                </div>
                                {!isBuy && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-slate-400">Método costeo</span>
                                        <span className="font-mono text-slate-300 text-xs">
                                            {CEDEAR_COSTING_METHODS.find(m => m.value === state.costingMethod)?.label || state.costingMethod}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-3 border-t border-white/5">
                                    <span className="text-sm text-white font-medium">
                                        {isBuy ? 'Total a Pagar' : 'Neto a Recibir'}
                                    </span>
                                    <span className="font-mono font-bold text-white text-lg">
                                        {currSymbol} {fmt2(isBuy ? computed.totalPaid : computed.net)}
                                    </span>
                                </div>
                            </div>

                            {/* Movements to generate */}
                            <div className="mt-8 space-y-3 w-full max-w-xs">
                                <div className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-2">
                                    Movimientos a generar
                                </div>
                                <div className="space-y-2 text-left">
                                    {isBuy ? (
                                        <>
                                            <div className="p-3 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                Alta Título: {state.asset?.ticker} x {computed.qty}
                                            </div>
                                            <div className="p-3 rounded border bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                Egreso Liquidez: {currSymbol} {fmt2(computed.totalPaid)}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="p-3 rounded border bg-rose-500/10 border-rose-500/20 text-rose-400 text-xs font-mono flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                Baja Título: {state.asset?.ticker} x {computed.qty}
                                            </div>
                                            <div className="p-3 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                Ingreso Liquidez: {currSymbol} {fmt2(computed.net)}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <WizardFooter
                    onBack={prevStep}
                    onCancel={onClose}
                    primaryLabel={state.step < 3 ? 'Siguiente' : 'Confirmar'}
                    onPrimary={nextStep}
                    primaryVariant={state.step < 3 ? 'indigo' : 'emerald'}
                    primaryDisabled={state.step < 3 ? !canAdvance : false}
                    primaryLoading={state.step === 3 && createMovement.isPending}
                />
            </div>

            {/* RIGHT: Summary Panel */}
            <div className="hidden md:flex w-80 border-l border-white/5 bg-slate-950/50 p-6 flex-col justify-center relative">
                {/* Grid BG */}
                <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                />

                <h3 className="font-display font-bold text-slate-400 uppercase text-xs tracking-widest mb-6 relative z-10">
                    Resumen Estimado
                </h3>

                <div className="space-y-6 relative z-10">
                    {/* Main Total */}
                    <div className="p-4 rounded-xl border border-white/10 bg-slate-900/80 shadow-lg">
                        <div className="text-xs text-slate-400 mb-1">
                            Total a {isBuy ? 'Pagar' : 'Recibir (Neto)'}
                        </div>
                        <div className={cn(
                            'font-mono text-2xl font-bold tracking-tight',
                            !isBuy ? 'text-emerald-400' : 'text-white'
                        )}>
                            {currSymbol} {fmt2(isBuy ? computed.totalPaid : computed.net)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                            ≈ {altCurrency.label} {fmt2(altCurrency.value)}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            TC: $ {fmt2(effectiveFx)} {state.fxAtTradeManual && <span className="text-amber-400">(manual)</span>}
                        </div>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Subtotal</span>
                            <span className="font-mono text-slate-300">
                                {currSymbol} {fmt2(computed.gross)}
                            </span>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="text-slate-400">Comisión</span>
                            <span className="font-mono text-rose-400">
                                {computed.fee > 0 ? `${isBuy ? '+' : '-'}${currSymbol} ${fmt2(computed.fee)}` : '—'}
                            </span>
                        </div>
                        <div className="h-px bg-white/10 my-2" />

                        {/* Sell: Cost & Result */}
                        {!isBuy && (
                            <>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-slate-400">Costo (Est.)</span>
                                    <span className="font-mono text-slate-500">
                                        {currSymbol} {fmt2(computed.costBasis)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center p-2 rounded bg-white/5 border border-white/5">
                                    <span className="text-xs font-bold text-white">Resultado</span>
                                    <span className={cn(
                                        'font-mono font-bold',
                                        computed.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    )}>
                                        {currSymbol} {fmt2(computed.pnl)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Info */}
                    <div className="p-3 rounded border border-blue-500/20 bg-blue-500/5 flex gap-3 items-start">
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-300 leading-relaxed">
                            Los valores son estimados. El impacto real dependerá de la ejecución en el mercado.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// =============================================================================
// Sub-component: Lot Table
// =============================================================================

interface LotTableProps {
    lots: LotDetail[]
    qty: number
    costingMethod: CostingMethod
    manualAllocations: ManualAllocation[]
    onManualChange: (allocs: ManualAllocation[]) => void
    currSymbol: string
}

function LotTable({ lots, qty, costingMethod, manualAllocations, onManualChange, currSymbol }: LotTableProps) {
    // Compute auto-selected lots for FIFO/LIFO
    const autoSelected = useMemo(() => {
        if (costingMethod === 'MANUAL' || costingMethod === 'PPP') return new Map<string, number>()
        const alloc = allocateSale(lots, qty, 0, costingMethod)
        const map = new Map<string, number>()
        alloc.allocations.forEach(a => map.set(a.lotId, a.qty))
        return map
    }, [lots, qty, costingMethod])

    const handleManualInput = (lotId: string, value: number, maxQty: number) => {
        const capped = Math.min(Math.max(Math.floor(value), 0), Math.floor(maxQty))
        const existing = manualAllocations.filter(a => a.lotId !== lotId)
        if (capped > 0) {
            existing.push({ lotId, qty: capped })
        }
        onManualChange(existing)
    }

    return (
        <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-500 font-mono uppercase">
                    <tr>
                        <th className="px-4 py-2 font-normal">Fecha</th>
                        <th className="px-4 py-2 font-normal text-right">Qty</th>
                        <th className="px-4 py-2 font-normal text-right">Precio</th>
                        <th className="px-4 py-2 font-normal text-right">A Vender</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-900/30">
                    {lots.map(lot => {
                        const autoQty = autoSelected.get(lot.id) || 0
                        const manualQty = manualAllocations.find(a => a.lotId === lot.id)?.qty || 0
                        const isConsumed = costingMethod !== 'MANUAL' && costingMethod !== 'PPP' && autoQty > 0
                        const isManualActive = costingMethod === 'MANUAL' && manualQty > 0

                        return (
                            <tr
                                key={lot.id}
                                className={cn(
                                    'transition-colors',
                                    (isConsumed || isManualActive) && 'bg-indigo-500/10'
                                )}
                            >
                                <td className="px-4 py-2 text-slate-300 font-mono">
                                    {new Date(lot.dateISO).toLocaleDateString('es-AR')}
                                </td>
                                <td className="px-4 py-2 text-slate-300 text-right font-mono">
                                    {Math.floor(lot.qty)}
                                </td>
                                <td className="px-4 py-2 text-slate-400 text-right font-mono text-[10px]">
                                    {currSymbol} {fmt2(lot.unitCostNative)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    {costingMethod === 'MANUAL' ? (
                                        <input
                                            type="number"
                                            min="0"
                                            max={Math.floor(lot.qty)}
                                            value={manualQty || ''}
                                            onChange={e => handleManualInput(lot.id, parseInt(e.target.value) || 0, lot.qty)}
                                            className="w-16 bg-slate-950 border border-white/10 rounded px-2 py-1 text-right text-white text-xs focus:border-indigo-500 focus:outline-none"
                                        />
                                    ) : isConsumed ? (
                                        <span className="text-indigo-400 font-bold">-{autoQty}</span>
                                    ) : (
                                        <span className="text-slate-600">-</span>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
