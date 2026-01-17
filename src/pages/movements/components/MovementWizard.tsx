import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
    X,
    ArrowRight,
    Check,
    Building2,
    Bitcoin,
    Hourglass,
    PieChart,
    RefreshCw,
    Wallet,
    Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssetTypeahead, type AssetOption, MOCK_ASSETS } from './AssetTypeahead'
import { formatMoneyARS, formatMoneyUSD } from '@/lib/format'
import type { Movement, Currency, FxType, MovementType, AssetCategory, Instrument } from '@/domain/types'
import { BankTypeahead } from './BankTypeahead'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useInstruments, useAccounts, useCreateInstrument } from '@/hooks/use-instruments'
import { useCreateMovement, useUpdateMovement } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'
import { listCedears } from '@/domain/cedears/master'
import { pfStore } from '@/domain/pf/store'
import { CryptoTypeahead, type CryptoOption } from './CryptoTypeahead'
import type { PFPosition } from '@/domain/pf/types'

// Asset class type for wizard
type AssetClass = 'cedear' | 'crypto' | 'pf' | 'fci' | 'currency' | 'wallet'
type OpType = 'buy' | 'sell' | 'constitute' | 'redeem' | 'deposit' | 'withdraw' | 'buy_usd' | 'sell_usd'

interface WizardState {
    assetClass: AssetClass
    opType: OpType
    asset: AssetOption | null
    datetime: string
    accountId: string
    currency: Currency
    qty: number
    price: number
    fxType: FxType
    fxRate: number
    notes: string
    // Fee State
    feeMode?: 'PERCENT' | 'FIXED'
    feeValue?: number // can be %
    feeCurrency: Currency
    // PF State
    bank?: string
    alias?: string
    tna?: number
    termDays?: number
    // Crypto specific
    coingeckoId?: string
}

interface MovementWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prefillMovement?: Movement | null
}

const ASSET_CLASS_CONFIG: Record<
    AssetClass,
    { label: string; description: string; icon: typeof Building2; color: string }
> = {
    cedear: {
        label: 'CEDEAR / Acción',
        description: 'Apple, SPY, GGAL...',
        icon: Building2,
        color: 'bg-indigo-500/20 text-indigo-400',
    },
    crypto: {
        label: 'Cripto',
        description: 'Bitcoin, USDT, Ethereum...',
        icon: Bitcoin,
        color: 'bg-emerald-500/20 text-emerald-400',
    },
    currency: {
        label: 'Moneda / Dólares',
        description: 'Compra/Venta de USD',
        icon: Banknote,
        color: 'bg-green-500/20 text-green-400',
    },
    wallet: {
        label: 'Billetera / Caja',
        description: 'Efectivo, MP, Bancos...',
        icon: Wallet,
        color: 'bg-purple-500/20 text-purple-400',
    },
    pf: {
        label: 'Plazos fijos / Frascos',
        icon: Hourglass,
        description: 'Tradicional, UVA, Frascos',
        color: 'bg-amber-500/10 text-amber-500',
    },
    fci: {
        label: 'FCI',
        description: 'Money Market, Renta Mixta...',
        icon: PieChart,
        color: 'bg-blue-500/20 text-blue-400',
    },
}

const FX_RATES_FALLBACK: Record<FxType, number> = {
    MEP: 1180.5,
    CCL: 1190,
    CRIPTO: 1210,
    OFICIAL: 890.5,
}

export function MovementWizard({ open, onOpenChange, prefillMovement }: MovementWizardProps) {
    const [step, setStep] = useState(1)
    const { data: fxRates } = useFxRates()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const updateMovement = useUpdateMovement()
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()
    const { toast } = useToast()

    // Initial state
    const getInitialState = (): WizardState => {
        const now = new Date()
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset())

        if (prefillMovement) {
            const pm = prefillMovement
            let opType: OpType = 'buy'
            switch (pm.type) {
                case 'BUY': opType = 'buy'; break;
                case 'SELL': opType = 'sell'; break;
                case 'BUY_USD': opType = 'buy_usd'; break;
                case 'SELL_USD': opType = 'sell_usd'; break;
                case 'DEPOSIT': opType = 'deposit'; break;
                case 'WITHDRAW': opType = 'withdraw'; break;
            }
            // Heuristic for constitute
            if (pm.assetClass === 'pf' && pm.type === 'BUY') opType = 'constitute'
            if (pm.assetClass === 'pf' && pm.type === 'SELL') opType = 'redeem'

            // Lookup asset
            let asset: AssetOption | null = null
            if (pm.instrumentId) {
                const inst = instrumentsList.find(i => i.id === pm.instrumentId)
                if (inst) {
                    asset = {
                        id: inst.symbol,
                        ticker: inst.symbol,
                        name: inst.name,
                        category: inst.category
                    }
                }
            }

            return {
                assetClass: pm.assetClass || 'cedear',
                opType,
                asset,
                datetime: pm.datetimeISO.slice(0, 16),
                accountId: pm.accountId,
                currency: pm.tradeCurrency,
                qty: pm.quantity || 0,
                price: pm.unitPrice || 0,
                fxType: (pm.fx?.kind as FxType) || 'MEP',
                fxRate: pm.fxAtTrade || pm.fx?.rate || 0,
                notes: pm.notes || '',
                feeMode: pm.fee?.mode || 'PERCENT',
                feeValue: pm.fee?.percent || pm.fee?.amount || 0,
                feeCurrency: pm.fee?.currency || pm.tradeCurrency,
                coingeckoId: (pm.assetClass === 'crypto' && asset) ? (asset as CryptoOption).coingeckoId : undefined,
            }
        }

        return {
            assetClass: 'cedear',
            opType: 'buy',
            asset: null,
            datetime: now.toISOString().slice(0, 16),
            accountId: accountsList[0]?.id || '',
            currency: 'ARS',
            qty: 0,
            price: 0,
            fxType: 'MEP',
            fxRate: fxRates?.mep?.sell ?? FX_RATES_FALLBACK.MEP,
            notes: '',
            feeMode: 'PERCENT',
            feeValue: 0,
            feeCurrency: 'ARS',
            // PF Defaults
            bank: '',
            alias: '',
            tna: 35, // Market avg
            termDays: 30,
        }
    }

    const [state, setState] = useState<WizardState>(getInitialState)

    // Update FX rate when fxType or fxRates change
    useEffect(() => {
        if (!fxRates) return
        const rateMap: Record<FxType, number | null> = {
            MEP: fxRates.mep?.sell,
            CCL: fxRates.ccl?.sell,
            CRIPTO: fxRates.cripto?.sell,
            OFICIAL: fxRates.oficial?.sell,
        }
        const newRate = rateMap[state.fxType] ?? FX_RATES_FALLBACK[state.fxType]
        setState(s => ({ ...s, fxRate: newRate }))
    }, [state.fxType, fxRates])

    // Reset when closing
    useEffect(() => {
        if (!open) {
            setStep(1)
            setState(getInitialState())
        }
    }, [open])

    // Handle class change - update defaults
    const handleClassChange = (cls: AssetClass) => {
        let currency: Currency = 'ARS'
        let fxType: FxType = 'MEP'
        let opType: OpType = 'buy'
        let asset: AssetOption | null = null
        let coingeckoId: string | undefined = undefined

        if (cls === 'crypto') {
            currency = 'USD'
            fxType = 'CRIPTO'
        } else if (cls === 'pf') {
            opType = 'constitute'
        } else if (cls === 'currency') {
            opType = 'buy_usd'
            currency = 'ARS' // Paying in ARS to buy USD usually
            fxType = 'OFICIAL' // Default to oficial/mep
            asset = { id: 'USD', ticker: 'USD', name: 'Dólar Estadounidense', category: 'CURRENCY' }
        } else if (cls === 'wallet') {
            opType = 'deposit'
            asset = { id: 'CASH', ticker: 'CASH', name: 'Saldo', category: 'WALLET' }
        }

        setState(s => ({ ...s, assetClass: cls, currency, fxType, opType, asset, coingeckoId }))
    }

    // ESC to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false)
        }
        if (open) {
            document.addEventListener('keydown', handleEsc)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = ''
        }
    }, [open, onOpenChange])

    // Calculations
    const totals = useMemo(() => {
        // Base Gross Calculation
        const nativeGross = state.qty * state.price

        // Fee Calculation
        let feeNative = 0
        if (state.feeMode === 'PERCENT') {
            feeNative = nativeGross * ((state.feeValue || 0) / 100)
        } else {
            feeNative = state.feeValue || 0
        }

        // Net Calculation
        let nativeNet = nativeGross
        // Logic:
        // Buy/Debit: Net = Gross + Fee (Total Cost)
        // Sell/Credit: Net = Gross - Fee (Total Proceeds)

        const isBuySide = ['buy', 'constitute', 'buy_usd', 'withdraw'].includes(state.opType)

        if (isBuySide) {
            nativeNet = nativeGross + feeNative
        } else {
            nativeNet = nativeGross - feeNative
        }

        let ars: number, usd: number, netArs: number, netUsd: number

        if (state.currency === 'ARS') {
            ars = nativeGross
            usd = state.fxRate > 0 ? nativeGross / state.fxRate : 0

            netArs = nativeNet
            netUsd = state.fxRate > 0 ? nativeNet / state.fxRate : 0
        } else {
            usd = nativeGross
            ars = nativeGross * state.fxRate

            netUsd = nativeNet
            netArs = nativeNet * state.fxRate
        }

        return {
            native: nativeGross,
            nativeNet,
            feeNative,
            ars, usd,
            netArs, netUsd
        }
    }, [state.qty, state.price, state.currency, state.fxRate, state.feeMode, state.feeValue, state.opType])

    // Submit
    const handleConfirm = async () => {
        try {
            // Validation
            if (state.assetClass === 'pf') {
                if (!state.bank) {
                    toast({
                        title: 'Error de validación',
                        description: 'Ingresá el banco o entidad.',
                        variant: 'error',
                    })
                    return
                }

                if (state.opType === 'redeem') {
                    if (!state.qty || state.qty <= 0) {
                        toast({ title: 'Error de validación', description: 'El monto cobrado debe ser mayor a 0.', variant: 'error' })
                        return
                    }
                } else {
                    // Constitute defaults
                    if (!state.qty || state.qty <= 0) {
                        toast({ title: 'Error de validación', description: 'El capital debe ser mayor a 0.', variant: 'error' })
                        return
                    }
                    if (!state.termDays || state.termDays <= 0) {
                        toast({ title: 'Error de validación', description: 'El plazo debe ser mayor a 0.', variant: 'error' })
                        return
                    }
                }
            } else {
                // Normal validation for non-pf
                if (!state.qty || state.qty <= 0) {
                    toast({
                        title: 'Error de validación',
                        description: 'La cantidad debe ser mayor a 0.',
                        variant: 'error',
                    })
                    return
                }

                if (state.assetClass !== 'wallet' && state.assetClass !== 'currency' && (!state.price || state.price < 0)) {
                    // Warning or specific logic? For now permit 0 but check logic elsewhere
                }

                if (!state.accountId) {
                    toast({
                        title: 'Error de validación',
                        description: 'Seleccioná una cuenta o broker.',
                        variant: 'error',
                    })
                    return
                }
                if (state.assetClass !== 'currency' && state.assetClass !== 'wallet' && !state.asset) {
                    toast({
                        title: 'Error de validación',
                        description: 'Seleccioná un activo.',
                        variant: 'error',
                    })
                    return
                }
            }

            // Find or create instrument
            let instrumentId: string | undefined
            if (state.assetClass !== 'pf' && state.asset) {
                const existing = instrumentsList.find(i => i.symbol === state.asset!.ticker)

                if (existing) {
                    instrumentId = existing.id
                } else {
                    if (!instrumentId) {
                        // Create logic
                        // ...
                        const newInstrument: Instrument = {
                            id: crypto.randomUUID(),
                            symbol: state.asset?.ticker || 'UNKNOWN',
                            name: state.asset?.name || 'Unknown Asset',
                            category: (state.asset?.category || 'STOCK') as AssetCategory,
                            nativeCurrency: state.currency || 'ARS',
                            priceKey: `${state.asset?.ticker?.toLowerCase()}`, // Mock key
                            coingeckoId: state.coingeckoId // Save it!
                        }

                        // ... save
                        await (createInstrument as any).mutateAsync(newInstrument)
                        instrumentId = newInstrument.id
                    }
                }
            }

            // Map OpType to MovementType
            let movementType: MovementType = 'BUY'
            switch (state.opType) {
                case 'buy': movementType = 'BUY'; break;
                case 'sell': movementType = 'SELL'; break;
                case 'constitute': movementType = 'BUY'; break; // Fixed mapping
                case 'redeem': movementType = 'SELL'; break; // Fixed mapping
                case 'buy_usd': movementType = 'BUY_USD'; break;
                case 'sell_usd': movementType = 'SELL_USD'; break;
                case 'deposit': movementType = 'DEPOSIT'; break;
                case 'withdraw': movementType = 'WITHDRAW'; break;
            }

            const movementId = prefillMovement?.id || crypto.randomUUID()

            // Correct Payload construction
            // PF Specific Mapping: Bank -> AccountId
            const accountIdToUse = state.assetClass === 'pf' ? (state.bank || 'PF_GENERIC') : state.accountId

            const movementPayload: Movement = {
                id: movementId,
                datetimeISO: new Date(state.datetime).toISOString(),
                type: movementType,
                assetClass: state.assetClass as any,
                instrumentId: instrumentId,
                accountId: accountIdToUse,

                // Fallback fields always saved
                ticker: state.asset?.ticker || (state.assetClass === 'pf' ? state.bank : ''),
                assetName: state.asset?.name || (state.assetClass === 'pf' ? 'Plazo Fijo' : ''),

                // PF Specific Payload
                bank: state.bank,
                alias: state.alias,
                principalARS: state.assetClass === 'pf' ? state.qty : undefined,
                termDays: state.termDays,
                tna: state.tna,

                quantity: state.qty,
                unitPrice: state.price,
                tradeCurrency: state.currency,

                fxAtTrade: state.fxRate,
                // Construct FX Snapshot
                fx: {
                    kind: state.fxType,
                    rate: state.fxRate,
                    side: 'mid', // simplified
                    asOf: new Date().toISOString(),
                    source: 'manual'
                },

                notes: state.notes,

                totalAmount: totals.native, // Gross

                // New Fee Object
                fee: (state.feeValue || 0) > 0 ? {
                    mode: state.feeMode || 'PERCENT',
                    percent: state.feeMode === 'PERCENT' ? (state.feeValue || 0) : undefined,
                    amount: state.feeMode === 'FIXED' ? (state.feeValue || 0) : ((state.qty || 0) * (state.price || 0) * ((state.feeValue || 0) / 100)), // Approximate fee amount for record
                    currency: state.feeCurrency,
                } : undefined,

                // Net & Totals
                netAmount: totals.nativeNet,
                totalARS: totals.netArs,
                totalUSD: totals.netUsd,
            }

            if (state.assetClass === 'pf' && state.opType === 'constitute') {
                // Save to PF Store
                const principal = state.qty
                const rate = (state.tna || 0) / 100
                const days = state.termDays || 30
                const interest = principal * rate * (days / 365)
                const total = principal + interest

                // TEA = (1 + r)^n - 1
                const tea = (Math.pow(1 + rate * (days / 365), 365 / days) - 1) * 100

                const maturityDate = new Date(state.datetime)
                maturityDate.setDate(maturityDate.getDate() + days)

                const pfPos: PFPosition = {
                    id: crypto.randomUUID(),
                    bank: state.bank || 'Banco',
                    alias: state.alias,
                    principalARS: principal,
                    termDays: days,
                    tna: state.tna || 0,
                    tea,
                    startTs: new Date(state.datetime).toISOString(),
                    maturityTs: maturityDate.toISOString(),
                    expectedInterestARS: interest,
                    expectedTotalARS: total,
                    status: 'active',
                    movementId: movementId
                }

                pfStore.save(pfPos)
            }

            if (prefillMovement?.id) {
                await updateMovement.mutateAsync({
                    id: prefillMovement.id,
                    updates: movementPayload // Hook expects 'updates' key
                })
                toast({
                    title: 'Movimiento actualizado',
                    description: 'Los cambios se guardaron correctamente.',
                    variant: 'default',
                })
            } else {
                await createMovement.mutateAsync({
                    ...movementPayload,
                    id: movementId
                } as Movement)

                toast({
                    title: 'Movimiento creado',
                    description: 'Tu portafolio se actualizó correctamente.',
                    variant: 'default',
                })
            }

            onOpenChange(false)
        } catch (error) {
            console.error('Failed to save movement', error)
            toast({
                title: 'Error al guardar',
                description: 'No se pudo registrar el movimiento. Intenta nuevamente.',
                variant: 'error',
            })
        }
    }

    // Filter assets based on class
    const filteredAssets = useMemo(() => {
        // Special classes have no list
        if (state.assetClass === 'currency' || state.assetClass === 'wallet') return []

        // Use Master List for Cedears
        if (state.assetClass === 'cedear') {
            return listCedears().map(c => ({
                id: c.ticker, // Use ticker as ID for master items
                ticker: c.ticker,
                name: c.name,
                category: 'CEDEAR' as AssetCategory // Cast string to type
            }))
        }

        // Fallback to MOCK/Existing for others
        return MOCK_ASSETS.filter(a => {
            if (state.assetClass === 'crypto') return a.category === 'CRYPTO' || a.category === 'STABLE'
            if (state.assetClass === 'fci') return a.category === 'FCI'
            return true
        })
    }, [state.assetClass])

    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[#0B1121]/90 backdrop-blur-md"
                onClick={() => onOpenChange(false)}
            />

            {/* Modal */}
            <div className="absolute inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 w-full md:max-w-4xl h-full md:h-[85vh] bg-[#0F172A] md:rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0F172A] shrink-0">
                    <div>
                        <h2 className="font-display text-xl font-bold text-white">Nuevo Movimiento</h2>
                        <div className="flex gap-2 mt-2">
                            {[1, 2, 3, 4].map(s => (
                                <div
                                    key={s}
                                    className={cn(
                                        'h-1 w-8 rounded-full transition-all duration-300',
                                        s < step
                                            ? 'bg-emerald-500'
                                            : s === step
                                                ? 'bg-indigo-500'
                                                : 'bg-white/10'
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0F172A]">
                    {/* Step 1 */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h3 className="text-lg font-medium text-white mb-4">
                                ¿Qué tipo de activo operaste?
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {(Object.entries(ASSET_CLASS_CONFIG) as [AssetClass, typeof ASSET_CLASS_CONFIG.cedear][]).map(
                                    ([key, config]) => {
                                        const Icon = config.icon
                                        return (
                                            <label key={key} className="cursor-pointer group relative">
                                                <input
                                                    type="radio"
                                                    name="asset_class"
                                                    value={key}
                                                    checked={state.assetClass === key}
                                                    onChange={() => handleClassChange(key)}
                                                    className="peer sr-only"
                                                />
                                                <div
                                                    className={cn(
                                                        'p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all',
                                                        'peer-checked:border-indigo-500 peer-checked:bg-indigo-500/10 peer-checked:shadow-[0_0_20px_rgba(99,102,241,0.15)]',
                                                        'flex flex-col gap-3 h-full'
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                                                            config.color
                                                        )}
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <span className="block font-medium text-white">
                                                            {config.label}
                                                        </span>
                                                        <span className="text-xs text-slate-400 mt-1">
                                                            {config.description}
                                                        </span>
                                                    </div>
                                                </div>
                                            </label>
                                        )
                                    }
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2 */}
                    {step === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Operation Type */}
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-3">
                                    Tipo de operación
                                </label>
                                <div className="flex p-1 bg-black/40 rounded-lg border border-white/10 w-fit">
                                    {state.assetClass === 'currency' ? (
                                        <>
                                            <button
                                                onClick={() => setState(s => ({ ...s, opType: 'buy_usd' }))}
                                                className={cn(
                                                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition whitespace-nowrap',
                                                    state.opType === 'buy_usd'
                                                        ? 'bg-emerald-600 text-white shadow'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                )}
                                            >
                                                Comprar USD
                                            </button>
                                            <button
                                                onClick={() => setState(s => ({ ...s, opType: 'sell_usd' }))}
                                                className={cn(
                                                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition whitespace-nowrap',
                                                    state.opType === 'sell_usd'
                                                        ? 'bg-emerald-600 text-white shadow'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                )}
                                            >
                                                Vender USD
                                            </button>
                                        </>
                                    ) : state.assetClass === 'wallet' ? (
                                        <>
                                            <button
                                                onClick={() => setState(s => ({ ...s, opType: 'deposit' }))}
                                                className={cn(
                                                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition whitespace-nowrap',
                                                    state.opType === 'deposit'
                                                        ? 'bg-purple-600 text-white shadow'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                )}
                                            >
                                                Ingreso
                                            </button>
                                            <button
                                                onClick={() => setState(s => ({ ...s, opType: 'withdraw' }))}
                                                className={cn(
                                                    'flex-1 py-2 px-4 rounded-md text-sm font-medium transition whitespace-nowrap',
                                                    state.opType === 'withdraw'
                                                        ? 'bg-purple-600 text-white shadow'
                                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                                )}
                                            >
                                                Egreso
                                            </button>
                                        </>
                                    ) : state.assetClass === 'pf' ? (
                                        <>
                                            <label
                                                className={cn(
                                                    'flex-1 px-4 py-2 rounded-md cursor-pointer transition text-center text-sm font-medium whitespace-nowrap',
                                                    state.opType === 'constitute'
                                                        ? 'bg-indigo-500 text-white'
                                                        : 'hover:bg-white/5 text-slate-400'
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="op_type"
                                                    value="constitute"
                                                    checked={state.opType === 'constitute'}
                                                    onChange={() => setState(s => ({ ...s, opType: 'constitute' }))}
                                                    className="sr-only"
                                                />
                                                Constituir
                                            </label>
                                            <label
                                                className={cn(
                                                    'flex-1 px-4 py-2 rounded-md cursor-pointer transition text-center text-sm font-medium whitespace-nowrap',
                                                    state.opType === 'redeem'
                                                        ? 'bg-indigo-500 text-white'
                                                        : 'hover:bg-white/5 text-slate-400'
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="op_type"
                                                    value="redeem"
                                                    checked={state.opType === 'redeem'}
                                                    onChange={() => setState(s => ({ ...s, opType: 'redeem' }))}
                                                    className="sr-only"
                                                />
                                                Rescatar
                                            </label>
                                        </>
                                    ) : (
                                        <>
                                            <label
                                                className={cn(
                                                    'flex-1 px-4 py-2 rounded-md cursor-pointer transition text-center text-sm font-medium whitespace-nowrap',
                                                    state.opType === 'buy'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                                        : 'hover:bg-white/5 text-slate-400 border border-transparent'
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="op_type"
                                                    value="buy"
                                                    checked={state.opType === 'buy'}
                                                    onChange={() => setState(s => ({ ...s, opType: 'buy' }))}
                                                    className="sr-only"
                                                />
                                                Compra
                                            </label>
                                            <label
                                                className={cn(
                                                    'flex-1 px-4 py-2 rounded-md cursor-pointer transition text-center text-sm font-medium whitespace-nowrap',
                                                    state.opType === 'sell'
                                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                                                        : 'hover:bg-white/5 text-slate-400 border border-transparent'
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="op_type"
                                                    value="sell"
                                                    checked={state.opType === 'sell'}
                                                    onChange={() => setState(s => ({ ...s, opType: 'sell' }))}
                                                    className="sr-only"
                                                />
                                                Venta
                                            </label>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Asset Typeahead or Bank Selector */}
                            {state.assetClass !== 'currency' && state.assetClass !== 'wallet' && (
                                <div>
                                    {state.assetClass === 'pf' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                                    Banco / Entidad
                                                </label>
                                                <BankTypeahead
                                                    value={state.bank || ''}
                                                    onChange={val => setState(s => ({ ...s, bank: val }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                                    Alias (Opcional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={state.alias || ''}
                                                    onChange={e => setState(s => ({ ...s, alias: e.target.value }))}
                                                    placeholder="Ej: PF Aguinaldo"
                                                    className="input-base w-full rounded-lg px-4 py-3 text-white"
                                                />
                                            </div>
                                        </div>
                                    ) : state.assetClass === 'crypto' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                Criptoactivo
                                            </label>
                                            <CryptoTypeahead
                                                value={state.asset ? {
                                                    ticker: state.asset.ticker,
                                                    name: state.asset.name,
                                                    category: state.asset.category as any,
                                                    coingeckoId: (state.asset as any).coingeckoId || ''
                                                } : null}
                                                onChange={crypto => {
                                                    if (!crypto) {
                                                        setState(s => ({ ...s, asset: null }))
                                                    } else {
                                                        const assetOpt: AssetOption = {
                                                            ticker: crypto.ticker,
                                                            name: crypto.name,
                                                            category: crypto.category,
                                                            id: crypto.coingeckoId // temporary ID for state
                                                        }
                                                        // Store extra metadata in state for confirmation
                                                        setState(s => ({ ...s, asset: assetOpt, coingeckoId: crypto.coingeckoId }))
                                                    }
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                Activo / Ticker
                                            </label>
                                            <AssetTypeahead
                                                value={state.asset}
                                                onChange={asset => setState(s => ({ ...s, asset }))}
                                                options={filteredAssets}
                                                placeholder={state.assetClass === 'cedear' ? 'Buscar CEDEAR (ej: SPY, KO)' : 'Buscar activo'}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Date & Account */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                        Fecha y Hora
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={state.datetime}
                                        onChange={e => setState(s => ({ ...s, datetime: e.target.value }))}
                                        className="input-base w-full rounded-lg px-4 py-2.5 text-white"
                                    />
                                </div>
                                {state.assetClass !== 'pf' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                            Cuenta / Broker
                                        </label>
                                        <select
                                            value={state.accountId}
                                            onChange={e => setState(s => ({ ...s, accountId: e.target.value }))}
                                            className="input-base w-full rounded-lg px-4 py-2.5 text-white appearance-none"
                                        >
                                            {accountsList.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.name}
                                                </option>
                                            ))}
                                            {accountsList.length === 0 && (
                                                <option value="">Sin cuentas</option>
                                            )}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3 */}
                    {step === 3 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left: Inputs */}
                                <div className="lg:col-span-7 space-y-6">
                                    {state.assetClass === 'pf' ? (
                                        <div className="space-y-6">
                                            {/* PF Inputs */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                                    Capital a Invertir (ARS)
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-3.5 text-slate-500 font-mono">$</span>
                                                    <input
                                                        type="number"
                                                        value={state.qty || ''}
                                                        onChange={e =>
                                                            setState(s => ({ ...s, qty: parseFloat(e.target.value) || 0, price: 1, currency: 'ARS' }))
                                                        }
                                                        placeholder="0.00"
                                                        className="input-base w-full rounded-lg pl-8 pr-4 py-3 text-white font-mono text-lg"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                                        Plazo (Días)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={state.termDays || ''}
                                                        onChange={e =>
                                                            setState(s => ({ ...s, termDays: parseFloat(e.target.value) || 30 }))
                                                        }
                                                        className="input-base w-full rounded-lg px-4 py-3 text-white font-mono text-lg"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                                        TNA (%)
                                                    </label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={state.tna || ''}
                                                            onChange={e =>
                                                                setState(s => ({ ...s, tna: parseFloat(e.target.value) || 0 }))
                                                            }
                                                            className="input-base w-full rounded-lg px-4 py-3 text-white font-mono text-lg"
                                                        />
                                                        <span className="absolute right-4 top-3.5 text-slate-500 font-mono text-sm">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Standard Currency, Qty, Price Inputs */}

                                            {/* Currency Toggle */}
                                            <div>
                                                <label className="block text-xs font-mono text-slate-500 uppercase mb-2">
                                                    Moneda de operación
                                                </label>
                                                <div className="flex space-x-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="currency"
                                                            value="ARS"
                                                            checked={state.currency === 'ARS'}
                                                            onChange={() => setState(s => ({ ...s, currency: 'ARS' }))}
                                                            className="text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600"
                                                        />
                                                        <span className="text-white font-mono">ARS (Pesos)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="currency"
                                                            value="USD"
                                                            checked={state.currency === 'USD'}
                                                            onChange={() => setState(s => ({ ...s, currency: 'USD' }))}
                                                            className="text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600"
                                                        />
                                                        <span className="text-white font-mono">USD (Dólares)</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Qty & Price */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className={cn(state.assetClass === 'wallet' ? 'col-span-2' : '')}>
                                                    <label className="block text-sm font-medium text-slate-400 mb-2">
                                                        {state.assetClass === 'wallet' ? 'Monto Total' : 'Cantidad'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={state.qty || ''}
                                                        onChange={e =>
                                                            setState(s => ({ ...s, qty: parseFloat(e.target.value) || 0 }))
                                                        }
                                                        placeholder="0"
                                                        step={state.assetClass === 'crypto' ? "0.00000001" : "1"}
                                                        inputMode={state.assetClass === 'crypto' ? "decimal" : "numeric"}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        className="input-base w-full rounded-lg px-4 py-3 text-white font-mono text-lg"
                                                    />
                                                </div>
                                                {state.assetClass !== 'wallet' && (
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                                            Precio Unitario
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-3.5 text-slate-500 font-mono">
                                                                {state.currency === 'USD' ? 'u$s' : '$'}
                                                            </span>
                                                            <input
                                                                type="number"
                                                                value={state.price || ''}
                                                                onChange={e =>
                                                                    setState(s => ({
                                                                        ...s,
                                                                        price: parseFloat(e.target.value) || 0,
                                                                    }))
                                                                }
                                                                placeholder="0.00"
                                                                className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white font-mono text-lg"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Commission Section */}
                                            <div className="pt-2 border-t border-white/5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm font-medium text-white flex items-center gap-2">
                                                        <span className="p-1 rounded bg-slate-800 text-slate-400">
                                                            <Building2 className="w-3 h-3" />
                                                        </span>
                                                        Comisión del Broker
                                                    </div>
                                                </div>

                                                <div className="bg-white/5 rounded-lg p-3 space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex bg-black/20 rounded-lg p-1 shrink-0">
                                                            <button
                                                                onClick={() => setState(s => ({ ...s, feeMode: 'PERCENT' }))}
                                                                className={cn(
                                                                    "px-3 py-1.5 text-xs font-medium rounded-md transition",
                                                                    state.feeMode === 'PERCENT' ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"
                                                                )}
                                                            >
                                                                %
                                                            </button>
                                                            <button
                                                                onClick={() => setState(s => ({ ...s, feeMode: 'FIXED' }))}
                                                                className={cn(
                                                                    "px-3 py-1.5 text-xs font-medium rounded-md transition",
                                                                    state.feeMode === 'FIXED' ? "bg-slate-500 text-white" : "text-slate-500 hover:text-white"
                                                                )}
                                                            >
                                                                $ Fijo
                                                            </button>
                                                        </div>
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="number"
                                                                placeholder="0.00"
                                                                value={state.feeValue || ''}
                                                                onChange={e => setState(s => ({ ...s, feeValue: parseFloat(e.target.value) }))}
                                                                className="input-base w-full p-2 pl-3 pr-8 rounded-lg text-right font-mono text-sm"
                                                            />
                                                            <span className="absolute right-3 top-2 text-slate-500 text-xs font-bold">
                                                                {state.feeMode === 'PERCENT' ? '%' : state.currency}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {(state.feeValue || 0) > 0 && (
                                                        <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-white/5">
                                                            <span className="text-slate-500">Monto Comisión Est.</span>
                                                            <span className="text-rose-400 font-mono">
                                                                - {state.currency === 'ARS' ? formatMoneyARS(totals.feeNative) : formatMoneyUSD(totals.feeNative)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* FX Section */}
                                            <div className="p-4 rounded-xl bg-slate-900/50 border border-white/5 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                                        <RefreshCw className="w-4 h-4 text-indigo-500" />
                                                        Tipo de Cambio
                                                    </label>
                                                    <span className="text-xs text-sky-400 cursor-pointer hover:underline">
                                                        Editar fuente
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <select
                                                        value={state.fxType}
                                                        onChange={e =>
                                                            setState(s => ({ ...s, fxType: e.target.value as FxType }))
                                                        }
                                                        className="input-base rounded-lg px-3 py-2 text-sm text-slate-300"
                                                    >
                                                        <option value="MEP">Dólar MEP</option>
                                                        <option value="CRIPTO">Dólar Cripto</option>
                                                        <option value="CCL">Dólar CCL</option>
                                                        <option value="OFICIAL">Oficial</option>
                                                    </select>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-slate-500 text-sm">$</span>
                                                        <input
                                                            type="number"
                                                            value={state.fxRate || ''}
                                                            onChange={e =>
                                                                setState(s => ({
                                                                    ...s,
                                                                    fxRate: parseFloat(e.target.value) || 0,
                                                                }))
                                                            }
                                                            className="input-base w-full rounded-lg pl-6 pr-3 py-2 text-white font-mono text-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-slate-500 text-right">
                                                    Cotización histórica sugerida por DollarAPI
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Right: Live Summary */}
                                <div className="lg:col-span-5">
                                    <div className="p-6 rounded-xl bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 sticky top-0">
                                        <h4 className="text-xs font-mono text-indigo-500 uppercase tracking-widest mb-4">
                                            Resumen Estimado
                                        </h4>

                                        {state.assetClass === 'pf' ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">Total al Vencimiento</div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {formatMoneyARS(state.qty + (state.qty * (state.tna || 0) / 100 * (state.termDays || 30) / 365))}
                                                    </div>
                                                </div>

                                                <div className="h-px bg-white/10 my-4" />

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">Interés Estimado</span>
                                                        <span className="text-sm font-mono text-emerald-400">
                                                            +{formatMoneyARS(state.qty * (state.tna || 0) / 100 * (state.termDays || 30) / 365)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">Fecha Vencimiento</span>
                                                        <span className="text-sm font-mono text-white">
                                                            {new Date(new Date().setDate(new Date().getDate() + (state.termDays || 30))).toLocaleDateString('es-AR')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">TEA (Informativa)</span>
                                                        <span className="text-sm font-mono text-slate-300">
                                                            {((Math.pow(1 + (state.tna || 0) / 100 * (state.termDays || 30) / 365, 365 / (state.termDays || 30)) - 1) * 100).toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">Total Operación</div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {state.currency === 'USD'
                                                            ? formatMoneyUSD(totals.native)
                                                            : formatMoneyARS(totals.native)}
                                                    </div>
                                                </div>

                                                <div className="h-px bg-white/10 my-4" />

                                                <div className="grid grid-cols-1 gap-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">Equivalente USD</span>
                                                        <span className="text-sm font-mono text-white">
                                                            {formatMoneyUSD(totals.usd)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">Equivalente ARS</span>
                                                        <span className="text-sm font-mono text-white">
                                                            {formatMoneyARS(totals.ars)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4 */}
                    {step === 4 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 text-center py-8">
                            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Check className="w-10 h-10 text-indigo-500" />
                            </div>
                            <h3 className="font-display text-2xl text-white font-bold">¡Todo listo!</h3>
                            <p className="text-slate-400 max-w-md mx-auto">
                                Revisá los datos antes de confirmar. Esta operación impactará en tu tablero de
                                tenencias.
                            </p>

                            <div className="max-w-md mx-auto bg-slate-900 border border-white/10 rounded-xl p-6 text-left space-y-4 mt-6">
                                {state.assetClass === 'pf' ? (
                                    <>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Operación</span>
                                            <span className="text-white font-medium">Plazo Fijo</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Banco / Entidad</span>
                                            <span className="text-white font-medium">{state.bank || '—'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Capital Invertido</span>
                                            <span className="text-white font-mono font-medium">{formatMoneyARS(state.qty)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Plazo / TNA</span>
                                            <span className="text-white font-mono flex gap-2">
                                                <span>{state.termDays} días</span>
                                                <span className="text-slate-500">@ {state.tna}%</span>
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Interés Estimado</span>
                                            <span className="text-emerald-400 font-mono font-medium">
                                                +{formatMoneyARS(state.qty * (state.tna || 0) / 100 * (state.termDays || 30) / 365)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="text-slate-200 text-sm font-bold">Total a Cobrar</span>
                                            <span className="text-indigo-400 font-mono font-bold text-lg">
                                                {formatMoneyARS(state.qty + (state.qty * (state.tna || 0) / 100 * (state.termDays || 30) / 365))}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Operación</span>
                                            <span className="text-white font-medium">
                                                {state.opType === 'buy' || state.opType === 'constitute'
                                                    ? 'Compra'
                                                    : 'Venta'}{' '}
                                                {ASSET_CLASS_CONFIG[state.assetClass].label}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Activo</span>
                                            <span className="text-white font-medium">
                                                {state.asset?.ticker || '—'} {state.asset?.name ? `(${state.asset.name})` : ''}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-500 text-sm">Total Bruto</span>
                                            <span className="text-white font-mono font-medium">
                                                {state.currency === 'USD'
                                                    ? formatMoneyUSD(totals.native)
                                                    : formatMoneyARS(totals.native)}
                                            </span>
                                        </div>
                                        {totals.feeNative > 0 && (
                                            <div className="flex justify-between border-b border-white/5 pb-2">
                                                <span className="text-slate-500 text-sm">Comisión</span>
                                                <span className="text-rose-400 font-mono font-medium">
                                                    - {state.currency === 'USD'
                                                        ? formatMoneyUSD(totals.feeNative)
                                                        : formatMoneyARS(totals.feeNative)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between border-b border-white/5 pb-2">
                                            <span className="text-slate-200 text-sm font-bold">Total Neto</span>
                                            <span className="text-indigo-400 font-mono font-bold text-lg">
                                                {state.currency === 'USD'
                                                    ? formatMoneyUSD(totals.nativeNet)
                                                    : formatMoneyARS(totals.nativeNet)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between pt-1">
                                            <span className="text-slate-500 text-xs">FX Aplicado</span>
                                            <span className="text-slate-300 font-mono text-xs">
                                                {state.fxType} ${Math.round(state.fxRate)}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/10 bg-[#0F172A] flex justify-between items-center shrink-0">
                    <button
                        onClick={() => setStep(s => s - 1)}
                        className={cn(
                            'px-4 py-2 text-slate-400 hover:text-white font-medium text-sm transition',
                            step === 1 && 'invisible'
                        )}
                    >
                        Atrás
                    </button>
                    <div className="ml-auto flex gap-3">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="px-4 py-2 text-slate-400 hover:text-white font-medium text-sm transition"
                        >
                            Cancelar
                        </button>
                        {step < 4 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg rounded-lg text-sm font-medium transition flex items-center gap-2"
                            >
                                Siguiente <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                onClick={handleConfirm}
                                disabled={createMovement.isPending || updateMovement.isPending}
                                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg rounded-lg text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Check className="w-4 h-4" />
                                {createMovement.isPending || updateMovement.isPending ? 'Guardando...' : 'Confirmar'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
