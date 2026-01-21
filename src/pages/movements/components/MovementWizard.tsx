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
    Wallet,
    Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Movement, Currency, FxType, MovementType, AssetCategory, Instrument, FixedDepositMeta } from '@/domain/types'
import { AccountSelectCreatable } from './AccountSelectCreatable'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useInstruments, useAccounts, useCreateInstrument } from '@/hooks/use-instruments'
import { useCreateMovement, useUpdateMovement, useMovements } from '@/hooks/use-movements'
import { useToast } from '@/components/ui/toast'
import { listCedears } from '@/domain/cedears/master'
import { CryptoTypeahead, type CryptoOption } from './CryptoTypeahead'
import { FciTypeahead, generateFciSlug } from './FciTypeahead'
import { db } from '@/db'
import { computeTEA } from '@/domain/yield/accrual'

const formatQty = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 8 })
import { AssetTypeahead, type AssetOption, MOCK_ASSETS } from './AssetTypeahead'
import { formatMoneyARS, formatMoneyUSD, formatPercent } from '@/lib/format'

// Helper Component for PF Selection
function ExistingPFSelector({
    accountId,
    movements,
    onSelect
}: {
    accountId: string,
    movements: Movement[],
    onSelect: (m: Movement) => void
}) {
    // Filter active PFs (Constitutions) for this account
    const activePFs = useMemo(() => {
        return movements
            .filter(m => m.assetClass === 'pf' && m.type === 'BUY' && m.accountId === accountId)
            .sort((a, b) => new Date(b.datetimeISO).getTime() - new Date(a.datetimeISO).getTime())
    }, [movements, accountId])

    if (activePFs.length === 0) {
        return <div className="text-sm text-slate-500 italic p-3 border border-white/10 rounded-lg">No hay Plazos Fijos registrados en esta cuenta.</div>
    }

    return (
        <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Seleccionar PF Vigente</label>
            <select
                onChange={(e) => {
                    const m = activePFs.find(p => p.id === e.target.value)
                    if (m) onSelect(m)
                }}
                className="input-base w-full rounded-lg px-4 py-3 text-white appearance-none bg-slate-800"
                defaultValue=""
            >
                <option value="" disabled>Seleccioná un PF...</option>
                {activePFs.map(pf => (
                    <option key={pf.id} value={pf.id}>
                        {pf.meta?.pfCode || pf.alias || 'Sin Código'} — {formatMoneyARS(pf.meta?.fixedDeposit?.totalARS ?? pf.pf?.totalToCollectARS ?? 0)} ({new Date(pf.meta?.fixedDeposit?.maturityDate ?? pf.pf?.maturityISO ?? '').toLocaleDateString()})
                    </option>
                ))}
            </select>
        </div>
    )
}



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
    qtyStr: string
    price: number
    fxType: FxType
    fxRate: number
    notes: string
    // Fee State
    feeMode?: 'PERCENT' | 'FIXED'
    feeValue?: number // can be %
    feeCurrency: Currency
    // PF State & Cash Yield
    // PF State & Cash Yield
    bank?: string
    // Removed duplicates
    alias?: string
    pfCode?: string // New mandatory code
    selectedPfMovementId?: string // For manual redemption
    tna?: number
    termDays?: number
    yieldEnabled?: boolean
    // Crypto specific
    coingeckoId?: string
    // FCI specific
    fciData?: {
        name: string
        manager: string
        category: string
        currency: 'ARS' | 'USD'
        vcp: number
        date: string
    }
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
    const [autoBalanceUsdt, setAutoBalanceUsdt] = useState(true) // Auto-balance default ON
    const { data: fxRates } = useFxRates()
    const { data: instrumentsList = [] } = useInstruments()
    const { data: accountsList = [] } = useAccounts()
    const { data: allMovements = [] } = useMovements() // Fetch all for PF lookup
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
                qtyStr: (pm.quantity || 0).toString().replace('.', ','),
                price: pm.unitPrice || 0,
                fxType: (pm.fx?.kind as FxType) || 'MEP',
                fxRate: pm.fxAtTrade || pm.fx?.rate || 0,
                notes: pm.notes || '',
                feeMode: pm.fee?.mode || 'PERCENT',
                feeValue: pm.fee?.percent || pm.fee?.amount || 0,
                feeCurrency: pm.fee?.currency || pm.tradeCurrency,
                // PF Restore
                alias: pm.alias || pm.meta?.fixedDeposit?.pfCode || '', // Legacy alias as fallback
                pfCode: pm.meta?.pfCode || pm.alias || '',
                tna: pm.tna || pm.meta?.fixedDeposit?.tna,
                termDays: pm.termDays || pm.meta?.fixedDeposit?.termDays,

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
            qtyStr: '',
            price: 0,
            fxType: 'MEP',
            fxRate: fxRates?.mep?.sell ?? FX_RATES_FALLBACK.MEP,
            notes: '',
            feeMode: 'PERCENT',
            feeValue: 0,
            feeCurrency: 'ARS',
            // PF Defaults
            bank: '',
            // New PF State
            alias: '',
            pfCode: `PF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
            tna: 35,
            termDays: 30,
        }
    }

    const [state, setState] = useState<WizardState>(getInitialState())

    // Compute owned FCI IDs for Typeahead restriction (SELL mode)
    const ownedFciIds = useMemo(() => {
        if (state.opType !== 'sell' && state.opType !== 'sell_usd' && state.opType !== 'redeem') return undefined
        if (state.assetClass !== 'fci') return undefined

        const quantities = new Map<string, number>()
        allMovements.forEach(m => {
            if (m.assetClass !== 'fci') return
            const current = quantities.get(m.instrumentId!) || 0
            const qty = m.quantity || 0
            if (m.type === 'BUY' || m.type === 'DEPOSIT') quantities.set(m.instrumentId!, current + qty)
            if (m.type === 'SELL' || m.type === 'WITHDRAW') quantities.set(m.instrumentId!, current - qty)
        })

        return Array.from(quantities.entries())
            .filter(([_, qty]) => qty > 0.0001)
            .map(([id]) => id)
    }, [allMovements, state.opType, state.assetClass])

    // Available Quantity for Validation
    const availableQty = useMemo(() => {
        if (!state.asset?.id || !['sell', 'sell_usd', 'redeem'].includes(state.opType) || !state.accountId) return Infinity

        const id = state.asset.id
        let val = 0
        allMovements.forEach(m => {
            if (m.instrumentId === id && m.accountId === state.accountId) { // Check Account specific balance
                const q = m.quantity || 0
                if (m.type === 'BUY' || m.type === 'DEPOSIT') val += q
                if (m.type === 'SELL' || m.type === 'WITHDRAW') val -= q
            }
        })
        return Math.max(0, val)
    }, [state.asset, state.opType, state.accountId, allMovements])

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
            asset = null
            opType = 'constitute' // Default
            fxType = 'OFICIAL' // Force Official FX for PF
        } else if (cls === 'currency') {
            opType = 'buy_usd'
            currency = 'ARS' // Paying in ARS to buy USD usually
            fxType = 'OFICIAL' // Default to oficial/mep
            asset = { id: 'USD', ticker: 'USD', name: 'Dólar Estadounidense', category: 'USD_CASH' }
        } else if (cls === 'wallet') {
            opType = 'deposit'
            asset = { id: 'CASH', ticker: 'CASH', name: 'Saldo', category: 'WALLET' }
        } else if (cls === 'fci') {
            opType = 'buy' // Default to buy
            fxType = 'MEP' // FCI uses MEP for conversion
            asset = null
        }

        setState(s => ({ ...s, assetClass: cls, currency, fxType, opType, asset, coingeckoId, fciData: undefined }))
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
                if (!state.accountId) {
                    toast({
                        title: 'Error de validación',
                        description: 'Seleccioná el banco o entidad.',
                        variant: 'error',
                    })
                    return
                }

                if (state.opType === 'redeem') {
                    if (!state.qty || state.qty <= 0) {
                        toast({ title: 'Error de validación', description: 'El monto cobrado debe ser mayor a 0.', variant: 'error' })
                        return
                    }
                    if (state.qty > availableQty) {
                        toast({ title: 'Error de validación', description: `No puedes rescatar más de lo disponible (${formatQty(availableQty)}).`, variant: 'error' })
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
                        description: state.assetClass === 'crypto'
                            ? 'Ingresá una cantidad mayor a 0. Podés usar decimales.'
                            : 'La cantidad debe ser mayor a 0 y entera.',
                        variant: 'error',
                    })
                    return
                }

                // Validate available quantity for sell/redeem operations
                if (['sell', 'redeem'].includes(state.opType) && state.qty > availableQty) {
                    toast({ title: 'Error de validación', description: `No puedes vender más de lo disponible (${formatQty(availableQty)}).`, variant: 'error' })
                    return
                }

                // Integer check for non-crypto
                if (state.assetClass === 'cedear' && !Number.isInteger(state.qty)) {
                    toast({
                        title: 'Error de validación',
                        description: 'La cantidad de CEDEARs o Acciones debe ser un número entero.',
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

            if (state.assetClass === 'wallet') {
                const symbol = state.currency || 'ARS'
                const cat = symbol === 'ARS' ? 'ARS_CASH' : 'USD_CASH'
                const existing = instrumentsList.find(i => i.symbol === symbol && i.category === cat)

                if (existing) {
                    instrumentId = existing.id
                } else {
                    const newId = symbol
                    const newInst: Instrument = {
                        id: newId,
                        symbol: symbol,
                        name: symbol === 'ARS' ? 'Pesos Argentinos' : 'Dólares Estadounidenses',
                        category: cat as AssetCategory,
                        nativeCurrency: symbol,
                        priceKey: symbol.toLowerCase(),
                        coingeckoId: undefined
                    }
                    await (createInstrument as any).mutateAsync(newInst)
                    instrumentId = newId
                }
            } else if (state.assetClass === 'fci' && state.fciData) {
                // FCI: Use deterministic ID based on fund metadata
                const fciId = generateFciSlug(state.fciData)
                const existing = instrumentsList.find(i => i.id === fciId)

                if (existing) {
                    instrumentId = existing.id
                } else {
                    const newInstrument: Instrument = {
                        id: fciId,
                        symbol: fciId,
                        name: state.fciData.name,
                        category: 'FCI' as AssetCategory,
                        nativeCurrency: state.fciData.currency,
                        priceKey: fciId,
                    }
                    await (createInstrument as any).mutateAsync(newInstrument)
                    instrumentId = fciId
                }
            } else if (state.assetClass === 'pf') {
                // PF Deterministic Instrument
                const pfSymbol = 'PF_ARS'
                const existing = instrumentsList.find(i => i.id === 'PF_ARS_GENERIC' || i.symbol === pfSymbol)

                if (existing) {
                    instrumentId = existing.id
                } else {
                    const newInst: Instrument = {
                        id: 'PF_ARS_GENERIC',
                        symbol: pfSymbol,
                        name: 'Plazo Fijo (Generico)',
                        category: 'PF' as AssetCategory,
                        nativeCurrency: 'ARS',
                        priceKey: 'pf_ars'
                    }
                    await (createInstrument as any).mutateAsync(newInst)
                    instrumentId = newInst.id
                }
            } else if (state.asset) {
                const existing = instrumentsList.find(i => i.symbol === state.asset!.ticker)

                if (existing) {
                    instrumentId = existing.id
                } else {
                    if (!instrumentId) {
                        // Create logic
                        const isUSD = state.asset?.ticker === 'USD'
                        const newId = isUSD ? 'USD' : crypto.randomUUID()

                        const newInstrument: Instrument = {
                            id: newId,
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

            // PF Pre-calculations
            let pfGroupId: string | undefined
            let pfCode: string | undefined
            let pfPrincipal = 0
            let pfInterest = 0
            let pfTotal = 0
            let pfDays = 30
            let pfMaturityDate: Date | undefined
            let pfFixedDepositMeta: any = undefined

            if (state.assetClass === 'pf') {
                pfCode = state.pfCode || state.alias
                pfGroupId = state.opType === 'constitute' ? crypto.randomUUID() : undefined

                if (state.opType === 'redeem' && state.selectedPfMovementId) {
                    const originalPF = allMovements.find(m => m.id === state.selectedPfMovementId)
                    if (originalPF) {
                        pfGroupId = originalPF.meta?.pfGroupId || originalPF.meta?.fixedDeposit?.pfGroupId
                        if (!pfGroupId) pfGroupId = crypto.randomUUID()
                        pfCode = originalPF.meta?.pfCode || originalPF.alias || pfCode
                    }
                }

                pfPrincipal = state.qty || 0
                const rate = (state.tna || 0) / 100
                pfDays = state.termDays || 30
                pfInterest = pfPrincipal * rate * (pfDays / 365)
                pfTotal = pfPrincipal + pfInterest

                const matDate = new Date(state.datetime)
                matDate.setDate(matDate.getDate() + pfDays)
                pfMaturityDate = matDate

                pfFixedDepositMeta = {
                    pfGroupId,
                    pfCode,
                    bank: accountsList.find(a => a.id === state.accountId)?.name || 'Desconocido',
                    principalARS: pfPrincipal,
                    interestARS: pfInterest,
                    totalARS: pfTotal,
                    tna: state.tna || 0,
                    termDays: pfDays,
                    startDate: new Date(state.datetime).toISOString(),
                    maturityDate: matDate.toISOString(),
                    expectedInterestARS: pfInterest,
                    expectedTotalARS: pfTotal,
                    settlementMode: 'manual',
                    ...(state.opType === 'redeem' ? { redeemedAt: new Date(state.datetime).toISOString() } : {})
                }
            }

            // Handle Yield Config Update (Wallet)
            if (state.assetClass === 'wallet' && state.accountId && state.yieldEnabled !== undefined) {
                const acc = accountsList?.find(a => a.id === state.accountId)
                if (acc) {
                    const hasChanged = (acc.cashYield?.enabled !== state.yieldEnabled) || (acc.cashYield?.tna !== state.tna);
                    if (hasChanged) {
                        await db.accounts.update(state.accountId, {
                            cashYield: {
                                enabled: !!state.yieldEnabled,
                                tna: state.tna || 0,
                                currency: state.currency,
                                compounding: 'DAILY',
                                lastAccruedDate: acc.cashYield?.lastAccruedDate || new Date().toISOString().slice(0, 10)
                            }
                        });
                    }
                }
            }

            const movementPayload: Movement = {
                id: movementId,
                datetimeISO: new Date(state.datetime).toISOString(),
                type: movementType,
                assetClass: state.assetClass as any,
                instrumentId: instrumentId!, // Asserted
                accountId: state.accountId,

                // Fallback fields always saved
                ticker: state.asset?.ticker || (state.assetClass === 'pf' ? (accountsList.find(a => a.id === state.accountId)?.name || 'PF') : (state.assetClass === 'wallet' ? state.currency : '')),
                assetName: state.asset?.name || (state.assetClass === 'pf' ? 'Plazo Fijo' : (state.assetClass === 'wallet' ? (state.currency === 'ARS' ? 'Pesos' : 'Dólares') : '')),

                // PF Specific Payload
                bank: accountsList.find(a => a.id === state.accountId)?.name || state.bank, // Prefer account name
                alias: state.alias,
                principalARS: state.assetClass === 'pf' ? state.qty : undefined,
                termDays: state.termDays,
                tna: state.tna,

                quantity: state.qty,
                unitPrice: state.price,
                tradeCurrency: state.currency,

                // Meta with FCI/PF snapshot
                meta: {
                    ...(state.assetClass === 'pf' ? {
                        pfGroupId,
                        pfCode,
                        fixedDeposit: pfFixedDepositMeta
                    } : {}),
                    ...(state.assetClass === 'fci' && state.fciData ? {
                        fci: {
                            nameSnapshot: state.fciData.name,
                            managerSnapshot: state.fciData.manager,
                            categorySnapshot: state.fciData.category,
                            vcpAsOf: state.fciData.date
                        }
                    } : {})
                },

                fxAtTrade: state.fxRate,

                // FX Snapshot
                fx: state.assetClass === 'fci' ? {
                    kind: 'MEP',
                    rate: state.currency === 'ARS' ? (fxRates?.mep?.sell || 0) : (fxRates?.mep?.buy || 0),
                    side: state.currency === 'ARS' ? 'sell' : 'buy',
                    asOf: new Date().toISOString()
                } : {
                    kind: state.fxType,
                    rate: state.fxRate,
                    side: 'mid',
                    asOf: new Date().toISOString(),
                    source: 'manual'
                },

                notes: state.notes,

                // For 'currency' (USD Buy/Sell), 'qty' is USD amount, 'price' is ARS total.
                // 'totalAmount' is Qty * Price = ARS Total.
                totalAmount: totals.native, // Gross

                // Fee Object
                fee: (state.feeValue || 0) > 0 ? {
                    mode: state.feeMode || 'PERCENT',
                    percent: state.feeMode === 'PERCENT' ? (state.feeValue || 0) : undefined,
                    amount: state.feeMode === 'FIXED' ? (state.feeValue || 0) : totals.feeNative,
                    currency: state.feeCurrency,
                } : undefined,

                // Net & Totals
                netAmount: totals.nativeNet,
                totalARS: totals.netArs,
                totalUSD: (state.assetClass === 'currency' || (state.assetClass === 'wallet' && state.currency === 'USD')) ? state.qty : totals.netUsd,

                // Legacy PF field population
                pf: state.assetClass === 'pf' ? {
                    kind: state.opType === 'constitute' ? 'constitute' : 'redeem',
                    pfId: pfGroupId!, // Asserted
                    bank: accountsList.find(a => a.id === state.accountId)?.name || 'Desconocido',
                    alias: pfCode,
                    capitalARS: pfPrincipal,
                    tna: state.tna,
                    termDays: pfDays,
                    startAtISO: new Date(state.datetime).toISOString(),
                    maturityISO: pfMaturityDate ? pfMaturityDate.toISOString() : '',
                    fxOficialVentaHist: state.fxRate,
                    interestARS: pfInterest,
                    totalToCollectARS: pfTotal
                } : undefined
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

                // PF Manual Redemption: Create Companion Deposit (Acreditación) & Update Original
                if (state.assetClass === 'pf' && state.opType === 'redeem' && state.selectedPfMovementId && movementPayload.meta?.pfGroupId) {
                    // 1. Create Credit Movement (Deposit)
                    // Logic: The "Redemption" movement (SELL) captures the exit from PF asset.
                    // The "Credit" movement (DEPOSIT) captures the money entering the account.
                    // Auto-settlement does: SELL (pfId) -> DEPOSIT (pfId).

                    const creditId = crypto.randomUUID()
                    const creditMovement: Movement = {
                        id: creditId,
                        datetimeISO: movementPayload.datetimeISO,
                        type: 'DEPOSIT', // Money IN
                        assetClass: 'pf', // Linked to PF
                        instrumentId: movementPayload.instrumentId,
                        accountId: state.accountId,

                        // Titles
                        ticker: 'ARS', // It's cash
                        assetName: 'Acreditación Plazo Fijo',

                        quantity: movementPayload.totalARS || state.qty || 0, // ARS Amount
                        unitPrice: 1,
                        tradeCurrency: 'ARS',

                        totalAmount: movementPayload.totalARS || state.qty || 0,
                        netAmount: movementPayload.totalARS || state.qty || 0,

                        meta: {
                            pfGroupId: movementPayload.meta.pfGroupId,
                            pfCode: movementPayload.meta.pfCode,
                            // Ensure properties match
                            fixedDeposit: movementPayload.meta.fixedDeposit ? {
                                ...movementPayload.meta.fixedDeposit,
                                principalARS: movementPayload.meta.fixedDeposit.principalARS || 0
                            } : undefined,
                        },

                        isAuto: false, // Manual trigger
                        notes: `Acreditación manual PF: ${movementPayload.meta.pfCode}`
                    }

                    await createMovement.mutateAsync(creditMovement)

                    // 2. Mark Original PF as Redeemed
                    // We need to fetch the original (we found it in state logic, but cleaner to just update by ID)
                    const original = allMovements.find(m => m.id === state.selectedPfMovementId)
                    if (original) {
                        const fd = original.meta?.fixedDeposit
                        // Construct robust FixedDepositMeta with defaults for all required fields
                        const newFixedDeposit: FixedDepositMeta = fd ? {
                            principalARS: fd.principalARS ?? 0,
                            interestARS: fd.interestARS ?? 0,
                            totalARS: fd.totalARS ?? ((fd.principalARS ?? 0) + (fd.interestARS ?? 0)),
                            tna: fd.tna ?? 0,
                            termDays: fd.termDays ?? 30,
                            startDate: fd.startDate ?? original.datetimeISO,
                            maturityDate: fd.maturityDate ?? original.pf?.maturityISO ?? original.datetimeISO,

                            // Optional or preserved
                            pfGroupId: fd.pfGroupId,
                            pfCode: fd.pfCode,
                            providerName: fd.providerName,

                            // Update redemption status
                            redeemedAt: movementPayload.datetimeISO,
                            settlementMode: 'manual' as const
                        } : {
                            // Fallback if fixedDeposit meta is missing entirely
                            principalARS: original.principalARS ?? 0,
                            interestARS: original.expectedInterest ?? 0,
                            totalARS: original.expectedTotal ?? 0,
                            tna: original.tna ?? 0,
                            termDays: original.termDays ?? 30,
                            startDate: original.startDate ?? original.datetimeISO,
                            maturityDate: original.maturityDate ?? original.datetimeISO,

                            redeemedAt: movementPayload.datetimeISO,
                            settlementMode: 'manual' as const
                        }

                        const updatedMeta = {
                            ...original.meta,
                            fixedDeposit: newFixedDeposit
                        }
                        await updateMovement.mutateAsync({
                            id: original.id,
                            updates: { meta: updatedMeta }
                        })
                    }
                }

                // AUTO-BALANCE LOGIC (USDT)
                // If creating a Crypto Trade in an Exchange (and not USDT itself), 
                // automatically create the counterpart USDT movement (Buy/Sell) to reflect liquidity change.
                const account = accountsList.find(a => a.id === state.accountId)
                const isExchange = account?.kind === 'EXCHANGE'
                const isCryptoTrade = state.assetClass === 'crypto' && ['BUY', 'SELL'].includes(movementType)
                const isNotUSDT = state.asset?.ticker !== 'USDT'

                if (isExchange && isCryptoTrade && isNotUSDT && autoBalanceUsdt) {
                    const autoType = movementType === 'BUY' ? 'SELL' : 'BUY'
                    // Fix: USDT Quantity is the TOTAL USD Value of the trade
                    const autoQty = movementPayload.totalUSD || 0

                    if (autoQty > 0) {
                        // Find USDT Instrument
                        const usdtInst = instrumentsList.find(i => i.symbol === 'USDT')

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
                            unitPrice: 1, // Stable
                            tradeCurrency: 'USD',

                            // Totals (no fee on this side, purely balance adjustment)
                            totalAmount: autoQty,
                            netAmount: autoQty,
                            totalUSD: autoQty,
                            totalARS: totals.netArs, // ARS Eq

                            fxAtTrade: movementPayload.fxAtTrade,

                            isAuto: true,
                            linkedMovementId: movementId,
                            reason: 'auto_usdt_balance'
                        }

                        await createMovement.mutateAsync(autoMovement)

                        toast({
                            title: 'Movimiento creado',
                            description: 'Tu portafolio se actualizó correctamente.',
                            variant: 'default',
                        })
                    }
                } else {
                    // Standard success without auto-balance
                    toast({
                        title: 'Movimiento creado',
                        description: 'Tu portafolio se actualizó correctamente.',
                        variant: 'default',
                    })
                }
            } // Close create block

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
                                                <AccountSelectCreatable
                                                    value={state.accountId}
                                                    onChange={val => setState(s => ({ ...s, accountId: val }))}
                                                    accounts={accountsList}
                                                    placeholder="Ej: Naranja X, Banco Galicia..."
                                                    className="w-full"
                                                />
                                            </div>
                                            <div>
                                                {state.opType === 'constitute' ? (
                                                    <>
                                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                                            Código PF <span className="text-indigo-400 text-xs ml-1">(Identificador)</span>
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={state.pfCode || ''}
                                                                onChange={e => setState(s => ({ ...s, pfCode: e.target.value }))}
                                                                placeholder="PF-2024..."
                                                                className="input-base w-full rounded-lg px-4 py-3 text-white font-mono uppercase"
                                                            />
                                                            <button
                                                                onClick={() => setState(s => ({
                                                                    ...s,
                                                                    pfCode: `PF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                                                                }))}
                                                                className="p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-slate-400 hover:text-white transition"
                                                                title="Generar nuevo código"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    // REDEEM: Select existing PF
                                                    // Note: We need to define PFSelector or inline it. 
                                                    // Ideally we lift state up, but here we can just use a simple select for now or a custom component.
                                                    // Since we can't easily access 'movements' here without fetching, I'll assume we fetched them.
                                                    // Wait, I need to add the hook call in the component body first! 
                                                    // This tool call is just replacing JSX. I have NOT added the hook call line yet.
                                                    // I should fallback to a placeholder text if I haven't added the hook yet.
                                                    // I will add the hook call in the NEXT step or PREVIOUS?
                                                    // I imported the hook, but didn't call it. 
                                                    // I'll rewrite this block to use a placeholder "Select" for now, 
                                                    // but I really should have added the hook logic first.
                                                    // I'll add the hook logic in this same step if possible with multi_replace?
                                                    // No, I can't easily target the top of body. 
                                                    // I will stick to adding the JSX assuming I will add the hook immediately after.
                                                    <ExistingPFSelector
                                                        accountId={state.accountId}
                                                        movements={allMovements}
                                                        onSelect={(pf) => {
                                                            setState(s => ({
                                                                ...s,
                                                                pfCode: pf.meta?.pfCode || pf.alias || 'PF-UNK',
                                                                selectedPfMovementId: pf.id,
                                                                // Prefill redemption details from Constitution
                                                                qty: pf.meta?.fixedDeposit?.totalARS || pf.pf?.totalToCollectARS || 0,
                                                                qtyStr: (pf.meta?.fixedDeposit?.totalARS || pf.pf?.totalToCollectARS || 0).toString(),
                                                                tna: pf.meta?.fixedDeposit?.tna || pf.pf?.tna || 0,
                                                                termDays: pf.meta?.fixedDeposit?.termDays || pf.pf?.termDays || 0,
                                                                datetime: new Date().toISOString().slice(0, 16) // Default to now (Redemption date)
                                                            }))
                                                        }}
                                                    />
                                                )}
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
                                    ) : state.assetClass === 'fci' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                Fondo FCI
                                            </label>
                                            <FciTypeahead
                                                value={state.fciData ? {
                                                    id: generateFciSlug(state.fciData),
                                                    name: state.fciData.name,
                                                    manager: state.fciData.manager,
                                                    category: state.fciData.category,
                                                    currency: state.fciData.currency,
                                                    vcp: state.fciData.vcp,
                                                    date: state.fciData.date
                                                } : null}
                                                onChange={fund => {
                                                    if (!fund) {
                                                        setState(s => ({ ...s, fciData: undefined, asset: null, price: 0 }))
                                                    } else {
                                                        const assetOpt: AssetOption = {
                                                            id: generateFciSlug(fund),
                                                            ticker: fund.name.slice(0, 20),
                                                            name: fund.name,
                                                            category: 'FCI'
                                                        }
                                                        setState(s => ({
                                                            ...s,
                                                            asset: assetOpt,
                                                            fciData: {
                                                                name: fund.name,
                                                                manager: fund.manager,
                                                                category: fund.category,
                                                                currency: fund.currency,
                                                                vcp: fund.vcp,
                                                                date: fund.date
                                                            },
                                                            currency: fund.currency,
                                                            price: fund.vcp
                                                        }))
                                                    }
                                                }}
                                                restrictToIds={ownedFciIds}
                                            />
                                            {state.fciData && (
                                                <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                                                    <div>
                                                        <span className="text-muted-foreground">VCP Actual:</span>
                                                        <span className="ml-2 font-mono">
                                                            {state.fciData.currency === 'USD' ? 'US$ ' : '$ '}
                                                            {state.fciData.vcp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Fecha VCP:</span>
                                                        <span className="ml-2">{state.fciData.date}</span>
                                                    </div>
                                                </div>
                                            )}
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
                                            Cuenta / Banco / Exchange
                                        </label>
                                        <AccountSelectCreatable
                                            value={state.accountId}
                                            onChange={val => {
                                                const acc = accountsList.find(a => a.id === val)
                                                setState(s => ({
                                                    ...s,
                                                    accountId: val,
                                                    yieldEnabled: acc?.cashYield?.enabled || false,
                                                    tna: acc?.cashYield?.tna || undefined
                                                }))
                                            }}
                                            accounts={accountsList}
                                        />

                                        {/* Yield Configuration for Wallet/Liquidity */}
                                        {state.assetClass === 'wallet' && state.accountId && (
                                            <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 animate-in fade-in slide-in-from-bottom-2">
                                                <div className="flex items-center justify-between mb-4">
                                                    <label className="flex items-center gap-3 text-sm font-medium text-slate-300 cursor-pointer select-none">
                                                        <div className={cn(
                                                            "w-5 h-5 rounded border border-slate-500 flex items-center justify-center transition-colors",
                                                            state.yieldEnabled ? "bg-indigo-500 border-indigo-500" : "bg-transparent"
                                                        )}>
                                                            {state.yieldEnabled && <Check className="w-3.5 h-3.5 text-white" />}
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            className="hidden"
                                                            checked={state.yieldEnabled || false}
                                                            onChange={e => setState(s => ({ ...s, yieldEnabled: e.target.checked }))}
                                                        />
                                                        <span>Cuenta remunerada</span>
                                                    </label>
                                                    {state.yieldEnabled && (
                                                        <div className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/30">
                                                            Acreditación diaria
                                                        </div>
                                                    )}
                                                </div>

                                                {state.yieldEnabled && (
                                                    <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                                                TNA %
                                                            </label>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={state.tna || ''}
                                                                    onChange={e => setState(s => ({ ...s, tna: parseFloat(e.target.value) }))}
                                                                    placeholder="0"
                                                                    className="input-base w-full rounded-lg pl-3 pr-8 py-2 text-white text-sm"
                                                                />
                                                                <span className="absolute right-3 top-2 text-slate-500 text-xs font-bold">%</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                                                TEA (Estimada)
                                                            </label>
                                                            <div className="h-[38px] flex items-center px-3 rounded-lg bg-slate-900/50 border border-slate-700/50 text-emerald-400 font-mono text-sm">
                                                                {state.tna ? formatPercent(computeTEA(state.tna || 0)) : '—'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
                                                        value={state.qtyStr || ''}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setState(s => ({ ...s, qtyStr: e.target.value, qty: val, price: 1, currency: 'ARS' }));
                                                        }}
                                                        placeholder="0.00"
                                                        className="input-base w-full rounded-lg pl-8 pr-4 py-3 text-white font-mono text-lg"
                                                    />
                                                    {(['sell', 'sell_usd', 'redeem'].includes(state.opType) && availableQty < Infinity) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setState(s => ({ ...s, qtyStr: availableQty.toString().replace('.', ','), qty: availableQty }))}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-white/10 hover:bg-white/20 text-indigo-300 px-2 py-1 rounded transition-colors"
                                                        >
                                                            Max: {formatQty(availableQty)}
                                                        </button>
                                                    )}
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
                                    ) : state.assetClass === 'wallet' ? (
                                        <div className="space-y-6">
                                            {/* Currency Toggle */}
                                            <div className="bg-slate-900/50 p-1 rounded-lg border border-white/5 flex">
                                                <button
                                                    onClick={() => setState(s => ({ ...s, currency: 'ARS', price: 1, fxRate: 1, qtyStr: '', qty: 0 }))}
                                                    className={cn(
                                                        "flex-1 py-2 text-xs font-bold rounded-md transition-all",
                                                        state.currency !== 'USD' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                                    )}
                                                >
                                                    ARS (Pesos)
                                                </button>
                                                <button
                                                    onClick={() => setState(s => ({ ...s, currency: 'USD', price: fxRates?.oficial.sell || 0, fxRate: fxRates?.oficial.sell || 0, qtyStr: '', qty: 0 }))}
                                                    className={cn(
                                                        "flex-1 py-2 text-xs font-bold rounded-md transition-all",
                                                        state.currency === 'USD' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                                    )}
                                                >
                                                    USD (Dólares)
                                                </button>
                                            </div>

                                            {state.currency === 'USD' ? (
                                                /* USD Flow - Reusing similar logic to Currency but simplifying */
                                                <div className="space-y-6 animate-in fade-in">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                                            Cantidad (USD)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-3.5 text-slate-500 font-mono">u$s</span>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={state.qtyStr || ''}
                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value.replace(',', '.')) || 0;
                                                                    setState(s => ({ ...s, qtyStr: e.target.value, qty: val }));
                                                                }}
                                                                placeholder="100.00"
                                                                className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white font-mono text-lg"
                                                                autoFocus
                                                            />
                                                            {(['sell', 'sell_usd', 'redeem'].includes(state.opType) && (availableQty || 0) < Infinity) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setState(s => ({ ...s, qtyStr: (availableQty || 0).toString().replace('.', ','), qty: availableQty || 0 }))}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-white/10 hover:bg-white/20 text-indigo-300 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Max: {formatQty(availableQty || 0)}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                                Cotización (ARS/USD)
                                                            </label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-3.5 text-slate-500 font-mono">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={state.fxRate || ''}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0
                                                                        setState(s => ({ ...s, fxRate: val, price: val }))
                                                                    }}
                                                                    className="input-base w-full rounded-lg pl-8 pr-4 py-3 text-white font-mono text-lg"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                                Fuente
                                                            </label>
                                                            <select
                                                                value={state.fxType}
                                                                onChange={e => setState(s => ({ ...s, fxType: e.target.value as FxType }))}
                                                                className="input-base w-full rounded-lg px-4 py-3 text-white appearance-none"
                                                            >
                                                                <option value="OFICIAL">Oficial</option>
                                                                <option value="MEP">MEP</option>
                                                                <option value="CCL">CCL</option>
                                                                <option value="CRIPTO">Cripto</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ARS Flow */
                                                <div className="space-y-6 animate-in fade-in">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                                            Monto (ARS)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-3.5 text-slate-500 font-mono">$</span>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={state.qtyStr || ''}
                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value.replace(',', '.')) || 0;
                                                                    // Price is 1 for ARS
                                                                    setState(s => ({ ...s, qtyStr: e.target.value, qty: val, price: 1 }));
                                                                }}
                                                                placeholder="10000"
                                                                className="input-base w-full rounded-lg pl-8 pr-4 py-3 text-white font-mono text-lg"
                                                                autoFocus
                                                            />
                                                            {(['sell', 'sell_usd', 'redeem'].includes(state.opType) && (availableQty || 0) < Infinity) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setState(s => ({ ...s, qtyStr: (availableQty || 0).toString().replace('.', ','), qty: availableQty || 0 }))}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-white/10 hover:bg-white/20 text-indigo-300 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Max: {formatQty(availableQty || 0)}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {(state.tna || 0) > 0 && (
                                                        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                                                            <span>✨</span>
                                                            <span>Estás configurando una cuenta remunerada ({state.tna}% TNA)</span>
                                                        </div>
                                                    )}

                                                    {/* Informative FX for ARS */}
                                                    <div className="p-3 bg-slate-900/30 rounded border border-white/5 text-xs text-slate-500 flex justify-between items-center">
                                                        <span>Equivalencia referencial (Dólar Oficial)</span>
                                                        <span className="font-mono text-slate-300">
                                                            {formatMoneyARS(fxRates?.oficial.sell)}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Standard Currency, Qty, Price Inputs */}

                                            {state.assetClass === 'currency' ? (
                                                /* Custom UI for USD Buy/Sell */
                                                <div className="space-y-6">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-400 mb-2">
                                                            Cantidad (USD)
                                                        </label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-3.5 text-slate-500 font-mono">u$s</span>
                                                            <input
                                                                type="number"
                                                                value={state.qtyStr || ''}
                                                                onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    // For Currency mode, PRICE is always FX RATE
                                                                    setState(s => ({
                                                                        ...s,
                                                                        qtyStr: e.target.value,
                                                                        qty: val,
                                                                        price: s.fxRate // Ensure price stays synced
                                                                    }));
                                                                }}
                                                                placeholder="100.00"
                                                                className="input-base w-full rounded-lg pl-10 pr-4 py-3 text-white font-mono text-lg"
                                                                autoFocus
                                                            />
                                                            {(['sell', 'sell_usd', 'redeem'].includes(state.opType) && (availableQty || 0) < Infinity) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setState(s => ({ ...s, qtyStr: (availableQty || 0).toString().replace('.', ','), qty: availableQty || 0 }))}
                                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs bg-white/10 hover:bg-white/20 text-indigo-300 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Max: {formatQty(availableQty || 0)}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                                Tipo de Cambio (ARS/USD)
                                                            </label>
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-3.5 text-slate-500 font-mono">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={state.fxRate || ''}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0
                                                                        setState(s => ({
                                                                            ...s,
                                                                            fxRate: val,
                                                                            price: val // Sync Unit Price with FX Rate
                                                                        }))
                                                                    }}
                                                                    className="input-base w-full rounded-lg pl-8 pr-4 py-3 text-white font-mono text-lg"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                                Fuente
                                                            </label>
                                                            <select
                                                                value={state.fxType}
                                                                onChange={e =>
                                                                    setState(s => ({ ...s, fxType: e.target.value as FxType }))
                                                                }
                                                                className="input-base w-full rounded-lg px-4 py-3 text-white appearance-none h-[52px]"
                                                            >
                                                                <option value="MEP">Dólar MEP</option>
                                                                <option value="CCL">Dólar CCL</option>
                                                                <option value="CRIPTO">Dólar Cripto</option>
                                                                <option value="OFICIAL">Oficial</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Standard Generic UI */
                                                <>
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
                                                        <div>
                                                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                                                Cantidad
                                                            </label>
                                                            <input
                                                                type={state.assetClass === 'crypto' ? "text" : "number"}
                                                                value={state.qtyStr || ''}
                                                                onChange={e => {
                                                                    const rawVal = e.target.value;
                                                                    if (state.assetClass === 'crypto') {
                                                                        const sanitized = rawVal.replace(/[^0-9,.]/g, '');
                                                                        const parts = sanitized.split(/[.,]/);
                                                                        if (parts.length > 2) return;
                                                                        if (parts[1] && parts[1].length > 8) return;

                                                                        const normalized = sanitized.replace(',', '.');
                                                                        setState(s => ({
                                                                            ...s,
                                                                            qtyStr: sanitized,
                                                                            qty: parseFloat(normalized) || 0
                                                                        }));
                                                                    } else {
                                                                        const val = parseFloat(rawVal) || 0;
                                                                        setState(s => ({ ...s, qtyStr: rawVal, qty: val }));
                                                                    }
                                                                }}
                                                                placeholder={state.assetClass === 'crypto' ? "0,00000000" : "0"}
                                                                step={state.assetClass === 'crypto' ? "0.00000001" : "1"}
                                                                inputMode="decimal"
                                                                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                                className="input-base w-full rounded-lg px-4 py-3 text-white font-mono text-lg"
                                                            />
                                                        </div>
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
                                                    </div>
                                                </>
                                            )}

                                            {/* Commission Section */}
                                            {/* ... */}
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
                                            /* PF Summary */
                                            <div className="space-y-4">
                                                {/* ... PF code ... */}
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">Total al Vencimiento</div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {formatMoneyARS(state.qty + (state.qty * (state.tna || 0) / 100 * (state.termDays || 30) / 365))}
                                                    </div>
                                                </div>

                                                <div className="h-px bg-white/10 my-4" />
                                                {/* ... Rest of PF ... */}
                                            </div>
                                        ) : state.assetClass === 'currency' ? (
                                            /* Currency Summary */
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">
                                                        {state.opType === 'buy_usd' ? 'Total a Pagar (ARS)' : 'Total a Recibir (ARS)'}
                                                    </div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {formatMoneyARS(totals.netArs)}
                                                    </div>
                                                    {totals.feeNative > 0 && (
                                                        <div className="text-xs text-rose-400 mt-1">
                                                            Incluye comisión: {formatMoneyARS(totals.feeNative)}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="h-px bg-white/10 my-4" />

                                                <div className="grid grid-cols-1 gap-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">
                                                            {state.opType === 'buy_usd' ? 'Comprás' : 'Vendés'}
                                                        </span>
                                                        <span className="text-lg font-mono text-emerald-400 font-bold">
                                                            {formatMoneyUSD(state.qty)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">Tipo de Cambio</span>
                                                        <span className="text-sm font-mono text-white">
                                                            ${formatMoneyARS(state.fxRate).replace('$', '').trim()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : state.assetClass === 'wallet' ? (
                                            /* Wallet Summary */
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">
                                                        {state.currency === 'ARS' ? 'Monto Total (ARS)' : 'Monto Total (USD)'}
                                                    </div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {state.currency === 'ARS' ? formatMoneyARS(state.qty) : formatMoneyUSD(state.qty)}
                                                    </div>
                                                </div>

                                                <div className="h-px bg-white/10 my-4" />

                                                <div className="space-y-3">
                                                    {/* Equivalencias */}
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-400">
                                                            {state.currency === 'ARS' ? 'Equivalente USD' : 'Valuación ARS'}
                                                        </span>
                                                        <span className="text-sm font-mono text-emerald-400">
                                                            {state.currency === 'ARS'
                                                                ? formatMoneyUSD(state.qty / (fxRates?.oficial.sell || 1))
                                                                : formatMoneyARS(state.qty * (state.fxRate || fxRates?.oficial.sell || 1))}
                                                        </span>
                                                    </div>

                                                    {(state.tna || 0) > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-slate-400">TNA / TEA</span>
                                                            <span className="text-sm font-momo text-indigo-400">
                                                                {state.tna}% / {formatPercent(computeTEA(state.tna || 0))}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            /* Generic Summary */
                                            <div className="space-y-4">
                                                <div>
                                                    <div className="text-sm text-slate-400 mb-1">Total Operación</div>
                                                    <div className="text-3xl font-mono font-bold text-white tracking-tight">
                                                        {state.currency === 'USD'
                                                            ? formatMoneyUSD(totals.native)
                                                            : formatMoneyARS(totals.native)}
                                                    </div>
                                                </div>

                                                {/* ...rest of generic summary */}

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
                            {!state.assetClass || state.assetClass === 'crypto' ? ( // Show for crypto
                                state.assetClass === 'crypto' &&
                                accountsList.find(a => a.id === state.accountId)?.kind === 'EXCHANGE' &&
                                state.asset?.ticker !== 'USDT' && (
                                    <div className="flex items-center space-x-2 py-4 border-t border-white/10 mt-4">
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                id="autoBalance"
                                                checked={autoBalanceUsdt}
                                                onChange={(e) => setAutoBalanceUsdt(e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="ml-2 text-sm">
                                            <label htmlFor="autoBalance" className="font-medium text-slate-300">
                                                Liquidación automática en USDT
                                            </label>
                                            <p className="text-xs text-slate-500">Generar movimiento espejo en USDT</p>
                                        </div>
                                    </div>
                                )
                            ) : null}
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
        </div >,
        document.body
    )
}
