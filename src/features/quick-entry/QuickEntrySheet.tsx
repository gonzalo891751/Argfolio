/**
 * "Cargar" — one sheet, three quick flows:
 *  - Compra / venta of crypto or CEDEARs, with the broker's price.
 *  - Ingreso / retiro of pesos or dollars in any account.
 *  - Actualizar saldo: type what the app shows today; the difference is booked
 *    as interest, money in/out or a correction. Also sets the account's TNA.
 * Anything else (plazo fijo, FCI, transferencias, swaps) opens the full wizard.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { useToast } from '@/components/ui/toast'
import { usePortfolioV2 } from '@/features/portfolioV2'
import { useAccounts, useCreateAccount, useCreateInstrument, useInstruments, useUpdateAccount } from '@/hooks/use-instruments'
import { useCreateMovement } from '@/hooks/use-movements'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useCedearPrices } from '@/hooks/use-cedear-prices'
import { listCedears } from '@/domain/cedears/master'
import { getCoingeckoId } from '@/data/providers/crypto-coingecko'
import { sortAccountsForAssetClass } from '@/pages/movements/components/wizard-helpers'
import type { Account, AccountKind, FxRates, FxType, Instrument } from '@/domain/types'
import type { MovementWizardPrefill } from '@/pages/movements/movement-wizard-prefill'
import { buildOverview, type OverviewPosition } from '@/features/overview/overview-model'
import { fmtArs, fmtMoney, fmtQty, fmtSignedArs, fmtSignedUsd, fmtUsd } from '@/features/overview/format'
import { AssetPicker, type AssetChoice } from './AssetPicker'
import { Field, NumberInput, Segmented, dateInputToISO, inputClass, parseAmount, todayInputValue } from './fields'
import { buildBalanceUpdate, buildCashMovement, buildTradeMovements, type BalanceDiffReason } from './quick-movements'
import type { QuickEntryMode, QuickEntryPrefill } from './QuickEntryContext'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Dollar used to value USD movements of an account, same family as Mis Activos. */
function fxForAccount(account: Account | undefined, fx: FxRates | undefined): { rate: number; kind: FxType } {
    if (!fx) return { rate: 0, kind: 'MEP' }
    if (account?.kind === 'EXCHANGE') return { rate: fx.cripto.sell ?? 0, kind: 'CRIPTO' }
    if (account?.kind === 'BROKER') return { rate: fx.mep.sell ?? 0, kind: 'MEP' }
    return { rate: fx.oficial.sell ?? 0, kind: 'OFICIAL' }
}

const isCashKind = (p: OverviewPosition) => p.kind === 'cash_ars' || p.kind === 'cash_usd' || p.kind === 'wallet_yield' || p.kind === 'frasco'

function cashBalance(positions: OverviewPosition[], accountId: string, currency: 'ARS' | 'USD'): number {
    return positions
        .filter(p => p.accountId === accountId && isCashKind(p))
        .filter(p => (currency === 'USD') === (p.groupId === 'dolares'))
        .reduce((s, p) => s + (currency === 'USD' ? p.valueUsd : p.valueArs), 0)
}

function useCashInstrument() {
    const { data: instruments = [] } = useInstruments()
    const createInstrument = useCreateInstrument()
    return async (currency: 'ARS' | 'USD'): Promise<string> => {
        const category = currency === 'ARS' ? 'ARS_CASH' : 'USD_CASH'
        const existing = instruments.find(i => i.symbol === currency && i.category === category)
        if (existing) return existing.id
        const inst: Instrument = {
            id: currency,
            symbol: currency,
            name: currency === 'ARS' ? 'Pesos Argentinos' : 'Dólares Estadounidenses',
            category,
            nativeCurrency: currency,
            priceKey: currency.toLowerCase(),
        }
        await createInstrument.mutateAsync(inst)
        return inst.id
    }
}

function AccountSelect({
    accounts,
    value,
    onChange,
    newAccountKind,
}: {
    accounts: Account[]
    value: string
    onChange: (id: string) => void
    newAccountKind: AccountKind
}) {
    const createAccount = useCreateAccount()
    const [creating, setCreating] = useState(false)
    const [name, setName] = useState('')

    if (creating) {
        return (
            <div className="flex gap-2">
                <input
                    className={inputClass}
                    placeholder="Nombre (ej: Naranja X, IOL, Binance)"
                    value={name}
                    autoFocus
                    onChange={e => setName(e.target.value)}
                />
                <button
                    type="button"
                    className="h-11 shrink-0 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    disabled={!name.trim() || createAccount.isPending}
                    onClick={async () => {
                        const account: Account = {
                            id: crypto.randomUUID(),
                            name: name.trim(),
                            kind: newAccountKind,
                            defaultCurrency: newAccountKind === 'EXCHANGE' ? 'USDT' : 'ARS',
                        }
                        const saved = await createAccount.mutateAsync(account)
                        onChange(saved.id)
                        setCreating(false)
                        setName('')
                    }}
                >
                    Crear
                </button>
                <button type="button" className="h-11 shrink-0 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted" onClick={() => setCreating(false)}>
                    Cancelar
                </button>
            </div>
        )
    }

    return (
        <select
            className={inputClass}
            value={value}
            onChange={e => {
                if (e.target.value === '__new__') setCreating(true)
                else onChange(e.target.value)
            }}
        >
            {!value && <option value="">Elegí una cuenta…</option>}
            {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
            <option value="__new__">+ Nueva cuenta…</option>
        </select>
    )
}

function ErrorText({ children }: { children: React.ReactNode }) {
    if (!children) return null
    return <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">{children}</p>
}

function SubmitButton({ disabled, busy, children, onClick }: { disabled?: boolean; busy?: boolean; children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled || busy}
            onClick={onClick}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
        </button>
    )
}

// ---------------------------------------------------------------------------
// Compra / venta
// ---------------------------------------------------------------------------

function useCoingeckoPrice(coingeckoId: string | undefined) {
    return useQuery({
        queryKey: ['quickEntryPrice', coingeckoId],
        enabled: Boolean(coingeckoId),
        staleTime: 60_000,
        queryFn: async () => {
            const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`)
            if (!res.ok) throw new Error(String(res.status))
            const data = await res.json() as Record<string, { usd?: number }>
            return data[coingeckoId!]?.usd ?? null
        },
    })
}

function TradeForm({ prefill, positions, onDone }: { prefill: QuickEntryPrefill; positions: OverviewPosition[]; onDone: () => void }) {
    const { toast } = useToast()
    const { data: accounts = [] } = useAccounts()
    const { data: instruments = [] } = useInstruments()
    const { data: fxRates } = useFxRates()
    const { data: cedearPrices } = useCedearPrices()
    const createMovement = useCreateMovement()
    const createInstrument = useCreateInstrument()

    const [side, setSide] = useState<'buy' | 'sell'>(prefill.side ?? 'buy')
    const [assetClass, setAssetClass] = useState<'crypto' | 'cedear'>(prefill.assetClass ?? 'crypto')
    const [asset, setAsset] = useState<AssetChoice | null>(null)
    const [accountId, setAccountId] = useState(prefill.accountId ?? '')
    const [qty, setQty] = useState('')
    const [price, setPrice] = useState('')
    const [priceTouched, setPriceTouched] = useState(false)
    const [fee, setFee] = useState('')
    const [showFee, setShowFee] = useState(false)
    const [date, setDate] = useState(todayInputValue())
    const [settleWithStable, setSettleWithStable] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const ownedPositions = useMemo(() => positions.filter(p =>
        assetClass === 'crypto' ? (p.kind === 'crypto' || p.kind === 'stable') : p.kind === 'cedear'
    ), [positions, assetClass])

    const owned: AssetChoice[] = useMemo(() => {
        const bySymbol = new Map<string, { choice: AssetChoice; qty: number }>()
        for (const p of ownedPositions) {
            const entry = bySymbol.get(p.symbol) ?? {
                choice: {
                    symbol: p.symbol,
                    name: p.label,
                    category: assetClass === 'cedear' ? 'CEDEAR' as const : (p.kind === 'stable' ? 'STABLE' as const : 'CRYPTO' as const),
                    coingeckoId: getCoingeckoId(p.symbol) ?? undefined,
                },
                qty: 0,
            }
            entry.qty += p.qty ?? 0
            bySymbol.set(p.symbol, entry)
        }
        return [...bySymbol.values()].map(({ choice, qty }) => ({ ...choice, hint: `Tenés ${fmtQty(qty)}` }))
    }, [ownedPositions, assetClass])

    const cedearCatalog: AssetChoice[] = useMemo(
        () => listCedears().map(c => ({ symbol: c.ticker, name: c.name, category: 'CEDEAR' as const })),
        [],
    )

    // Prefill asset from context (e.g. "Vender BTC" from a row)
    useEffect(() => {
        if (!prefill.symbol || asset) return
        const match = owned.find(o => o.symbol === prefill.symbol)
            ?? cedearCatalog.find(o => o.symbol === prefill.symbol)
        if (match) setAsset(match)
    }, [prefill.symbol, owned, cedearCatalog, asset])

    const sortedAccounts = useMemo(() => sortAccountsForAssetClass(accounts, assetClass), [accounts, assetClass])
    const accountsWithAsset = useMemo(
        () => new Set(ownedPositions.filter(p => p.symbol === asset?.symbol).map(p => p.accountId)),
        [ownedPositions, asset],
    )

    // Default account: where you already hold it, else the most suitable one
    useEffect(() => {
        if (accountId && accounts.some(a => a.id === accountId)) return
        const holding = [...accountsWithAsset][0]
        const fallback = sortedAccounts[0]?.id
        if (holding || fallback) setAccountId(holding ?? fallback)
    }, [accountsWithAsset, sortedAccounts, accountId, accounts])

    const account = accounts.find(a => a.id === accountId)
    const isExchange = account?.kind === 'EXCHANGE'
    const isStable = asset?.category === 'STABLE'

    // Live price suggestion
    const coingeckoId = asset?.coingeckoId ?? (asset ? getCoingeckoId(asset.symbol) ?? undefined : undefined)
    const { data: cryptoPrice } = useCoingeckoPrice(assetClass === 'crypto' && !isStable ? coingeckoId : undefined)
    const suggestedPrice = assetClass === 'cedear'
        ? (asset ? cedearPrices?.[asset.symbol]?.lastPriceArs : undefined)
        : (isStable ? 1 : cryptoPrice ?? undefined)

    useEffect(() => {
        if (!priceTouched && suggestedPrice && suggestedPrice > 0) {
            setPrice(String(suggestedPrice).replace('.', ','))
        }
    }, [suggestedPrice, priceTouched])

    const qtyNum = parseAmount(qty)
    const priceNum = parseAmount(price)
    const feeNum = showFee ? parseAmount(fee) : 0
    const gross = qtyNum > 0 && priceNum > 0 ? qtyNum * priceNum : 0
    const net = side === 'buy' ? gross + (feeNum > 0 ? feeNum : 0) : gross - (feeNum > 0 ? feeNum : 0)
    const fxRate = assetClass === 'crypto' ? (fxRates?.cripto.sell ?? 0) : (fxRates?.mep.sell ?? 0)
    const currency = assetClass === 'crypto' ? 'USD' : 'ARS'

    const heldInAccount = ownedPositions
        .filter(p => p.symbol === asset?.symbol && p.accountId === accountId)
        .reduce((s, p) => s + (p.qty ?? 0), 0)

    const usesStableLeg = assetClass === 'crypto' && isExchange && !isStable && settleWithStable

    const save = async () => {
        setError(null)
        if (!asset) return setError('Elegí qué activo operaste.')
        if (side === 'sell' && qtyNum > heldInAccount + 1e-9) {
            return setError(`En ${account?.name ?? 'esa cuenta'} tenés ${fmtQty(heldInAccount)} ${asset.symbol}.`)
        }
        setBusy(true)
        try {
            const category = assetClass === 'cedear' ? 'CEDEAR' : asset.category
            let inst = instruments.find(i => i.symbol === asset.symbol && (assetClass === 'cedear' ? i.category === 'CEDEAR' : i.category === 'CRYPTO' || i.category === 'STABLE'))
            if (!inst) {
                inst = {
                    id: crypto.randomUUID(),
                    symbol: asset.symbol,
                    name: asset.name,
                    category,
                    nativeCurrency: assetClass === 'cedear' ? 'ARS' : 'USD',
                    priceKey: asset.symbol.toLowerCase(),
                    ...(asset.coingeckoId ? { coingeckoId: asset.coingeckoId } : {}),
                }
                await createInstrument.mutateAsync(inst)
            }

            let stableInstrumentId: string | undefined
            if (usesStableLeg) {
                let usdt = instruments.find(i => i.symbol === 'USDT')
                if (!usdt) {
                    usdt = { id: 'usdt', symbol: 'USDT', name: 'Tether', category: 'STABLE', nativeCurrency: 'USDT', priceKey: 'usdt' }
                    await createInstrument.mutateAsync(usdt)
                }
                stableInstrumentId = usdt.id
            }

            const movements = buildTradeMovements({
                side,
                assetClass,
                instrumentId: inst.id,
                symbol: asset.symbol,
                name: asset.name,
                accountId,
                isExchange: Boolean(isExchange),
                qty: qtyNum,
                unitPrice: priceNum,
                fee: feeNum > 0 ? feeNum : undefined,
                datetimeISO: dateInputToISO(date),
                fxRate,
                settleWithStable: usesStableLeg,
                stableInstrumentId,
            })
            for (const m of movements) await createMovement.mutateAsync(m)

            toast({
                title: side === 'buy' ? 'Compra cargada' : 'Venta cargada',
                description: `${fmtQty(qtyNum)} ${asset.symbol} a ${fmtMoney(priceNum, currency, { cents: true })}`,
            })
            onDone()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <Segmented value={side} onChange={setSide} options={[{ value: 'buy', label: 'Compré' }, { value: 'sell', label: 'Vendí' }]} />
                <Segmented
                    value={assetClass}
                    onChange={v => { setAssetClass(v); setAsset(null); setPriceTouched(false); setPrice('') }}
                    options={[{ value: 'crypto', label: 'Cripto' }, { value: 'cedear', label: 'CEDEAR' }]}
                />
            </div>

            <Field label="Activo">
                <AssetPicker
                    assetClass={assetClass}
                    value={asset}
                    onChange={a => { setAsset(a); setPriceTouched(false) }}
                    owned={owned}
                    catalog={assetClass === 'cedear' ? cedearCatalog : undefined}
                />
            </Field>

            <Field label={assetClass === 'crypto' ? 'Exchange o billetera' : 'Broker'}>
                <AccountSelect
                    accounts={sortedAccounts}
                    value={accountId}
                    onChange={setAccountId}
                    newAccountKind={assetClass === 'crypto' ? 'EXCHANGE' : 'BROKER'}
                />
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <Field
                    label="Cantidad"
                    hint={side === 'sell' && asset ? `Tenés ${fmtQty(heldInAccount)}` : (qtyNum > 0 ? `= ${fmtQty(qtyNum)}` : undefined)}
                >
                    <NumberInput value={qty} onChange={setQty} placeholder={assetClass === 'crypto' ? '0,01' : '10'} ariaLabel="Cantidad" />
                </Field>
                <Field
                    label={`Precio (${assetClass === 'crypto' ? 'US$' : '$'})`}
                    hint={suggestedPrice ? `Hoy: ${fmtMoney(suggestedPrice, currency, { cents: true })}` : 'El que te figura en el broker'}
                >
                    <NumberInput
                        value={price}
                        onChange={v => { setPrice(v); setPriceTouched(true) }}
                        placeholder="0"
                        ariaLabel="Precio unitario"
                    />
                </Field>
            </div>

            {showFee ? (
                <Field label={`Comisión (${assetClass === 'crypto' ? 'US$' : '$'})`}>
                    <NumberInput value={fee} onChange={setFee} placeholder="0" ariaLabel="Comisión" />
                </Field>
            ) : (
                <button type="button" className="text-sm font-medium text-primary" onClick={() => setShowFee(true)}>
                    + Agregar comisión
                </button>
            )}

            <Field label="Fecha">
                <input type="date" className={inputClass} value={date} max={todayInputValue()} onChange={e => setDate(e.target.value)} />
            </Field>

            {assetClass === 'crypto' && isExchange && !isStable && (
                <label className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={settleWithStable} onChange={e => setSettleWithStable(e.target.checked)} />
                    <span>
                        {side === 'buy' ? 'Pagué con USDT de esta cuenta' : 'Recibí USDT en esta cuenta'}
                        <span className="block text-xs text-muted-foreground">Así el saldo de USDT queda bien.</span>
                    </span>
                </label>
            )}

            {gross > 0 && (
                <div className="rounded-xl border bg-background p-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">{side === 'buy' ? 'Total pagado' : 'Total cobrado'}</span>
                        <span className="font-semibold tabular-nums">{fmtMoney(net, currency, { cents: true })}</span>
                    </div>
                    {fxRate > 0 && (
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                            <span>{assetClass === 'crypto' ? 'En pesos (dólar cripto)' : 'En dólares (MEP)'}</span>
                            <span className="tabular-nums">{assetClass === 'crypto' ? fmtArs(net * fxRate) : fmtUsd(net / fxRate)}</span>
                        </div>
                    )}
                </div>
            )}

            <ErrorText>{error}</ErrorText>
            <SubmitButton busy={busy} disabled={!asset || !(qtyNum > 0) || !(priceNum > 0) || !accountId} onClick={save}>
                {side === 'buy' ? 'Guardar compra' : 'Guardar venta'}
            </SubmitButton>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Ingreso / retiro
// ---------------------------------------------------------------------------

function CashForm({ prefill, positions, onDone }: { prefill: QuickEntryPrefill; positions: OverviewPosition[]; onDone: () => void }) {
    const { toast } = useToast()
    const { data: accounts = [] } = useAccounts()
    const { data: fxRates } = useFxRates()
    const createMovement = useCreateMovement()
    const resolveCashInstrument = useCashInstrument()

    const [direction, setDirection] = useState<'in' | 'out'>(prefill.direction ?? 'in')
    const [accountId, setAccountId] = useState(prefill.accountId ?? '')
    const [currency, setCurrency] = useState<'ARS' | 'USD'>(prefill.currency ?? 'ARS')
    const [amount, setAmount] = useState('')
    const [date, setDate] = useState(todayInputValue())
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const sortedAccounts = useMemo(() => sortAccountsForAssetClass(accounts, 'wallet'), [accounts])
    useEffect(() => {
        if (!accountId && sortedAccounts[0]) setAccountId(sortedAccounts[0].id)
    }, [accountId, sortedAccounts])

    const account = accounts.find(a => a.id === accountId)
    const available = cashBalance(positions, accountId, currency)
    const amountNum = parseAmount(amount)
    const fx = fxForAccount(account, fxRates)

    const save = async () => {
        setError(null)
        if (direction === 'out' && amountNum > available + 0.005) {
            return setError(`En ${account?.name ?? 'esa cuenta'} tenés ${fmtMoney(available, currency, { cents: true })}.`)
        }
        setBusy(true)
        try {
            const instrumentId = await resolveCashInstrument(currency)
            const movement = buildCashMovement({
                direction,
                accountId,
                currency,
                amount: amountNum,
                datetimeISO: dateInputToISO(date),
                instrumentId,
                fxRate: fx.rate,
                fxKind: fx.kind,
                notes: note.trim() || undefined,
            })
            await createMovement.mutateAsync(movement)
            toast({
                title: direction === 'in' ? 'Ingreso cargado' : 'Retiro cargado',
                description: `${fmtMoney(amountNum, currency, { cents: true })} en ${account?.name ?? 'la cuenta'}`,
            })
            onDone()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <Segmented value={direction} onChange={setDirection} options={[{ value: 'in', label: 'Ingresé' }, { value: 'out', label: 'Saqué' }]} />
                <Segmented value={currency} onChange={setCurrency} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} />
            </div>
            <Field label="Cuenta" hint={accountId ? `Saldo: ${fmtMoney(available, currency, { cents: true })}` : undefined}>
                <AccountSelect accounts={sortedAccounts} value={accountId} onChange={setAccountId} newAccountKind="WALLET" />
            </Field>
            <Field label="Monto">
                <NumberInput value={amount} onChange={setAmount} prefix={currency === 'USD' ? 'US$' : '$'} placeholder="0" ariaLabel="Monto" />
            </Field>
            <Field label="Fecha">
                <input type="date" className={inputClass} value={date} max={todayInputValue()} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Nota (opcional)">
                <input className={inputClass} value={note} onChange={e => setNote(e.target.value)} placeholder="Sueldo, ahorro, gastos…" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <SubmitButton busy={busy} disabled={!accountId || !(amountNum > 0)} onClick={save}>
                {direction === 'in' ? 'Guardar ingreso' : 'Guardar retiro'}
            </SubmitButton>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Actualizar saldo
// ---------------------------------------------------------------------------

function yesterdayKey(now: Date = new Date()): string {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return todayInputValue(d)
}

function BalanceForm({ prefill, positions, onDone }: { prefill: QuickEntryPrefill; positions: OverviewPosition[]; onDone: () => void }) {
    const { toast } = useToast()
    const { data: accounts = [] } = useAccounts()
    const { data: fxRates } = useFxRates()
    const createMovement = useCreateMovement()
    const updateAccount = useUpdateAccount()
    const resolveCashInstrument = useCashInstrument()

    // Accounts that hold cash first (wallets, banks, frascos, brokers' liquidity)
    const cashAccounts = useMemo(() => {
        const withCash = new Set(positions.filter(isCashKind).map(p => p.accountId))
        return [...accounts].sort((a, b) => Number(withCash.has(b.id)) - Number(withCash.has(a.id)) || a.name.localeCompare(b.name))
    }, [accounts, positions])

    const [accountId, setAccountId] = useState(prefill.accountId ?? '')
    const [currency, setCurrency] = useState<'ARS' | 'USD'>(prefill.currency ?? 'ARS')
    const [real, setReal] = useState('')
    const [reason, setReason] = useState<BalanceDiffReason | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!accountId && cashAccounts[0]) setAccountId(cashAccounts[0].id)
    }, [accountId, cashAccounts])

    const account = accounts.find(a => a.id === accountId)
    const [yieldOn, setYieldOn] = useState(false)
    const [tna, setTna] = useState('')
    useEffect(() => {
        setYieldOn(Boolean(account?.cashYield?.enabled))
        setTna(account?.cashYield?.tna ? String(account.cashYield.tna).replace('.', ',') : '')
        setReason(null)
        setReal('')
    }, [account?.id, account?.cashYield?.enabled, account?.cashYield?.tna])

    const system = cashBalance(positions, accountId, currency)
    const realNum = parseAmount(real)
    const diff = Number.isFinite(realNum) ? realNum - system : 0
    const hasDiff = Number.isFinite(realNum) && Math.abs(diff) >= 0.005
    const tnaNum = parseAmount(tna)
    const fx = fxForAccount(account, fxRates)

    const defaultReason: BalanceDiffReason = diff > 0 ? (yieldOn && currency === 'ARS' ? 'interest' : 'deposit') : 'withdraw'
    const effectiveReason = reason && ((diff > 0) === (reason === 'interest' || reason === 'deposit') || reason === 'adjustment') ? reason : defaultReason

    const reasonOptions: Array<{ value: BalanceDiffReason; label: string; hint: string }> = diff > 0
        ? [
            { value: 'interest', label: 'Son intereses o rendimientos', hint: 'Cuenta como ganancia' },
            { value: 'deposit', label: 'Ingresé plata', hint: 'No cuenta como ganancia' },
            { value: 'adjustment', label: 'Es una corrección', hint: 'Arregla un saldo mal cargado' },
        ]
        : [
            { value: 'withdraw', label: 'Saqué o gasté plata', hint: 'No cuenta como pérdida' },
            { value: 'adjustment', label: 'Es una corrección', hint: 'Arregla un saldo mal cargado' },
        ]

    const yieldChanged = currency === 'ARS' && (
        yieldOn !== Boolean(account?.cashYield?.enabled)
        || (yieldOn && Number.isFinite(tnaNum) && tnaNum !== (account?.cashYield?.tna ?? 0))
    )

    const save = async () => {
        setError(null)
        if (!account) return setError('Elegí la cuenta.')
        if (yieldOn && !(tnaNum > 0)) return setError('Poné la tasa (TNA) de la cuenta.')
        setBusy(true)
        try {
            let saved = false
            if (hasDiff) {
                const instrumentId = await resolveCashInstrument(currency)
                const movement = buildBalanceUpdate({
                    accountId,
                    currency,
                    systemBalance: system,
                    realBalance: realNum,
                    reason: effectiveReason,
                    datetimeISO: new Date().toISOString(),
                    instrumentId,
                    fxRate: fx.rate,
                    fxKind: fx.kind,
                })
                if (movement) {
                    await createMovement.mutateAsync(movement)
                    saved = true
                }
            }

            if (yieldChanged || (hasDiff && yieldOn && currency === 'ARS')) {
                // The typed balance already includes today's interest: daily
                // accrual continues from here, never re-counting past days.
                const previous = account.cashYield?.lastAccruedDate
                const yesterday = yesterdayKey()
                await updateAccount.mutateAsync({
                    id: account.id,
                    updates: {
                        cashYield: {
                            enabled: yieldOn,
                            tna: yieldOn ? tnaNum : (account.cashYield?.tna ?? 0),
                            currency: 'ARS',
                            compounding: 'DAILY',
                            lastAccruedDate: previous && previous > yesterday ? previous : yesterday,
                        },
                    },
                })
                saved = true
            }

            if (!saved) {
                setBusy(false)
                return setError('No hay cambios: el saldo coincide.')
            }
            toast({ title: 'Saldo actualizado', description: `${account.name}: ${fmtMoney(hasDiff ? realNum : system, currency, { cents: true })}` })
            onDone()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo guardar.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <Field label="Cuenta">
                <AccountSelect accounts={cashAccounts} value={accountId} onChange={setAccountId} newAccountKind="WALLET" />
            </Field>
            <Segmented value={currency} onChange={v => { setCurrency(v); setReal('') }} options={[{ value: 'ARS', label: 'Pesos' }, { value: 'USD', label: 'Dólares' }]} />

            <div className="rounded-xl border bg-background p-3">
                <p className="text-xs text-muted-foreground">Argfolio calcula que tenés</p>
                <p className="text-xl font-semibold tabular-nums">{fmtMoney(system, currency, { cents: true })}</p>
            </div>

            <Field label="¿Cuánto te figura hoy en la app?">
                <NumberInput value={real} onChange={setReal} prefix={currency === 'USD' ? 'US$' : '$'} placeholder={String(Math.round(system))} autoFocus ariaLabel="Saldo real" />
            </Field>

            {hasDiff && (
                <div className="space-y-2">
                    <p className="text-sm">
                        Diferencia:{' '}
                        <span className={cn('font-semibold tabular-nums', diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                            {currency === 'USD' ? fmtSignedUsd(diff, { cents: true }) : fmtSignedArs(diff, { cents: true })}
                        </span>
                    </p>
                    <div className="space-y-2">
                        {reasonOptions.map(opt => (
                            <label key={opt.value} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', effectiveReason === opt.value && 'border-primary bg-primary/5')}>
                                <input type="radio" className="mt-1" checked={effectiveReason === opt.value} onChange={() => setReason(opt.value)} />
                                <span>
                                    <span className="block text-sm font-medium">{opt.label}</span>
                                    <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {currency === 'ARS' && (
                <div className="space-y-3 rounded-xl border p-3">
                    <label className="flex items-center justify-between gap-3">
                        <span>
                            <span className="block text-sm font-medium">Esta cuenta genera intereses</span>
                            <span className="block text-xs text-muted-foreground">Se suman solos todos los días</span>
                        </span>
                        <input type="checkbox" className="h-5 w-5" checked={yieldOn} onChange={e => setYieldOn(e.target.checked)} />
                    </label>
                    {yieldOn && (
                        <Field label="Tasa nominal anual (TNA %)" hint={tnaNum > 0 ? `Con ${fmtArs(realNum > 0 ? realNum : system)} rinde unos ${fmtArs(((realNum > 0 ? realNum : system) * tnaNum) / 100 / 365, { cents: true })} por día` : undefined}>
                            <NumberInput value={tna} onChange={setTna} placeholder="20" ariaLabel="TNA" />
                        </Field>
                    )}
                </div>
            )}

            <ErrorText>{error}</ErrorText>
            <SubmitButton busy={busy} disabled={!accountId || (!hasDiff && !yieldChanged)} onClick={save}>
                Guardar
            </SubmitButton>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

const MODES: Array<{ value: QuickEntryMode; label: string }> = [
    { value: 'trade', label: 'Compra/venta' },
    { value: 'cash', label: 'Ingreso/retiro' },
    { value: 'balance', label: 'Saldo' },
]

export function QuickEntrySheet({
    prefill,
    onClose,
    onOpenAdvanced,
}: {
    prefill: QuickEntryPrefill
    onClose: () => void
    onOpenAdvanced: (prefill?: MovementWizardPrefill) => void
}) {
    const [mode, setMode] = useState<QuickEntryMode>(prefill.mode ?? 'trade')
    const portfolio = usePortfolioV2()
    const positions = useMemo(() => {
        const ov = buildOverview(portfolio)
        return [...ov.pesos.groups, ...ov.dolares.groups].flatMap(g => g.positions)
    }, [portfolio])

    return (
        <ResponsiveModal
            open
            onOpenChange={open => { if (!open) onClose() }}
            title="Cargar"
            description="Lo que hiciste, en pocos pasos."
            footer={
                <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenAdvanced()}
                >
                    <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Plazo fijo, FCI, transferencia u otra operación</span>
                    <ArrowRight className="h-4 w-4" />
                </button>
            }
        >
            <Segmented value={mode} onChange={setMode} options={MODES} className="mb-5" />
            {mode === 'trade' && <TradeForm prefill={prefill} positions={positions} onDone={onClose} />}
            {mode === 'cash' && <CashForm prefill={prefill} positions={positions} onDone={onClose} />}
            {mode === 'balance' && <BalanceForm prefill={prefill} positions={positions} onDone={onClose} />}
        </ResponsiveModal>
    )
}
