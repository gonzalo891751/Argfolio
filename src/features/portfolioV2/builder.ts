/**
 * Portfolio V2 Builder
 * 
 * Transforms data from existing hooks (useAssetsRows, usePF, etc.) into
 * the PortfolioV2 structure for the new Mis Activos UI.
 */

import type {
    PortfolioV2,
    PortfolioKPIs,
    RubroV2,
    ProviderV2,
    ItemV2,
    RubroId,
    FxPolicyLabel,
    FxRatesSnapshot,
    WalletDetail,
    FixedDepositDetail,
    CedearDetail,
    CedearLotDetail,
    CryptoDetail,
    LotDetail,
    FciDetail,
    FciLotDetail,
    ItemKind,
    MoneyPair,
    FxMeta,
} from './types'
import type { Account, Movement, FxRates } from '@/domain/types'
import type { AssetRowMetrics } from '@/domain/assets/types'
import type { PFPosition } from '@/domain/pf/types'
import type { AccountSettings, RubroOverride } from '@/db/schema'
import type { FxOverride, FxOverridesMap } from './fxOverrides'
import { buildFifoLots } from '@/domain/portfolio/fifo'

// =============================================================================
// Rubro Configuration
// =============================================================================

interface RubroConfig {
    id: RubroId
    name: string
    icon: string
    fxPolicy: FxPolicyLabel
    categories: string[] // AssetClass categories that belong to this rubro
}

const RUBRO_CONFIGS: RubroConfig[] = [
    {
        id: 'wallets',
        name: 'Billeteras',
        icon: 'Wallet',
        fxPolicy: 'Oficial Venta',
        categories: ['CASH_ARS', 'CASH_USD'],
    },
    {
        id: 'frascos',
        name: 'Frascos',
        icon: 'PiggyBank',
        fxPolicy: 'Oficial Venta',
        categories: [], // Special handling - yield-enabled accounts
    },
    {
        id: 'plazos',
        name: 'Plazos Fijos',
        icon: 'Calendar',
        fxPolicy: 'Oficial Venta',
        categories: ['PF'],
    },
    {
        id: 'cedears',
        name: 'CEDEARs',
        icon: 'BarChart3',
        fxPolicy: 'MEP',
        categories: ['CEDEAR'],
    },
    {
        id: 'crypto',
        name: 'Cripto',
        icon: 'Bitcoin',
        fxPolicy: 'Cripto',
        categories: ['CRYPTO', 'STABLE'],
    },
    {
        id: 'fci',
        name: 'Fondos (FCI)',
        icon: 'TrendingUp',
        fxPolicy: 'VCP',
        categories: ['FCI'],
    },
]

// =============================================================================
// Account Classification Helpers
// =============================================================================

/** Accounts that are cryptocurrency exchanges - their cash stays in Cripto rubro */
const EXCHANGE_KINDS: string[] = ['EXCHANGE']

/** Accounts that are stock brokers - their cash stays in CEDEARs rubro */
const BROKER_KINDS: string[] = ['BROKER']

/** Accounts that can appear in Billeteras (virtual wallets/banks without yield) */
const WALLET_KINDS: string[] = ['WALLET', 'BANK']

/** Check if account is an exchange (Binance, Nexo, etc.) */
function isExchange(account: Account | undefined): boolean {
    return account ? EXCHANGE_KINDS.includes(account.kind) : false
}

/** Check if account is a broker (InvertirOnline, PPI, etc.) */
function isBroker(account: Account | undefined): boolean {
    return account ? BROKER_KINDS.includes(account.kind) : false
}

/** Check if account qualifies for Billeteras (WALLET/BANK, not exchange/broker) */
function isWalletForBilleteras(account: Account | undefined, rubroOverride?: RubroOverride): boolean {
    if (!account) return false
    // If manually overridden to a different rubro, don't include in Billeteras
    if (rubroOverride && rubroOverride !== 'billeteras') return false
    // If manually set to Billeteras, include it
    if (rubroOverride === 'billeteras') return true
    // Exchanges go to Cripto
    if (isExchange(account)) return false
    // Brokers go to CEDEARs
    if (isBroker(account)) return false
    // All WALLET/BANK (even with yield) stay in Billeteras by default
    return WALLET_KINDS.includes(account.kind) || account.kind === 'OTHER'
}

/** Check if account is explicitly a Frasco (via rubroOverride only) */
function isFrasco(rubroOverride?: RubroOverride): boolean {
    return rubroOverride === 'frascos'
}

/** Get proper display name using account settings and fallbacks */
function getDisplayName(
    accountId: string,
    accountName: string | undefined,
    settingsMap: Map<string, AccountSettings>
): string {
    // 1. Check for override in settings
    const override = settingsMap.get(accountId)?.displayNameOverride
    if (override?.trim()) return override.trim()

    // 2. Check account name (excluding generic placeholders)
    const name = accountName?.trim()
    if (name && name !== 'Account' && name !== 'account' && name.length > 0) {
        return name
    }

    // 3. Humanize account ID (e.g., "binance" -> "Binance")
    const humanized = accountId
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')

    // 4. If ID looks like a UUID or hash, create friendly fallback with last 4 chars
    if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
        const suffix = accountId.slice(-4).toUpperCase()
        return `Liquidez ${suffix}`
    }

    return humanized
}

/** Filter threshold for zero balances (ARS) */
const ZERO_BALANCE_THRESHOLD = 1

/** Check if item has significant value (not near zero) */
function hasSignificantValue(valArs: number, qty?: number, category?: string): boolean {
    // For FCI, never hide positions just because the price feed is missing.
    // We prefer rendering the row and letting the UI show a pricing warning badge.
    if (category === 'FCI') {
        const q = qty ?? 0
        if (q > 0) return true
    }
    // For CASH items, always require significant ARS value (no qty bypass)
    if (category === 'CASH_ARS') {
        return Math.abs(valArs) >= ZERO_BALANCE_THRESHOLD
    }
    // For CASH_USD, allow qty-based significance so USD-only rows don't disappear if FX/valArs is missing
    if (category === 'CASH_USD') {
        const qtyUsd = qty ?? 0
        return Math.abs(valArs) >= ZERO_BALANCE_THRESHOLD || Math.abs(qtyUsd) >= 0.01
    }
    // For tradeable assets (CEDEAR/CRYPTO/etc), show if qty > 0 AND valArs >= threshold
    // This prevents showing $0 rows for assets without price data
    if (qty && qty > 0 && Math.abs(valArs) >= ZERO_BALANCE_THRESHOLD) {
        return true
    }
    return Math.abs(valArs) >= ZERO_BALANCE_THRESHOLD
}

function resolveAccountTnaPct(
    accountId: string,
    account: Account | undefined,
    settingsMap: Map<string, AccountSettings>
): number | null {
    const override = settingsMap.get(accountId)?.tnaOverride
    if (typeof override === 'number' && override > 0) return override
    const tna = account?.cashYield?.tna
    if (typeof tna === 'number' && tna > 0) return tna
    return null
}

function buildYieldMeta(
    accountId: string,
    account: Account | undefined,
    settingsMap: Map<string, AccountSettings>
): ItemV2['yieldMeta'] | undefined {
    if (!account?.cashYield?.enabled) return undefined
    if (account.cashYield.currency !== 'ARS') return undefined

    const tnaPct = resolveAccountTnaPct(accountId, account, settingsMap)
    if (!tnaPct) return undefined

    return {
        tna: tnaPct,
        tea: computeTEA(tnaPct),
        lastAccruedISO: account.cashYield.lastAccruedDate,
    }
}

function maybeAttachYieldMetaToArsCashItem(
    item: ItemV2,
    accountId: string,
    account: Account | undefined,
    settingsMap: Map<string, AccountSettings>
): ItemV2 {
    if (item.kind !== 'cash_ars') return item
    const yieldMeta = buildYieldMeta(accountId, account, settingsMap)
    if (!yieldMeta) return item

    return {
        ...item,
        yieldMeta,
    }
}

// =============================================================================
// Builder Functions
// =============================================================================

export function buildFxSnapshot(fxRates: FxRates): FxRatesSnapshot {
    return {
        officialSell: fxRates.oficial.sell ?? 0,
        officialBuy: fxRates.oficial.buy ?? 0,
        mepSell: fxRates.mep.sell ?? fxRates.mep.buy ?? 0,
        mepBuy: fxRates.mep.buy ?? fxRates.mep.sell ?? 0,
        cclSell: fxRates.ccl?.sell ?? fxRates.ccl?.buy ?? 0,
        cclBuy: fxRates.ccl?.buy ?? fxRates.ccl?.sell ?? 0,
        cryptoSell: fxRates.cripto.sell ?? fxRates.cripto.buy ?? 0,
        cryptoBuy: fxRates.cripto.buy ?? fxRates.cripto.sell ?? 0,
        updatedAtISO: fxRates.updatedAtISO,
    }
}

// =============================================================================
// FX Family Helpers for Smart Valuation
// =============================================================================

type FxFamily = 'Oficial' | 'MEP' | 'Cripto'

/** Determine FX family based on account kind */
function getFxFamilyForAccount(account: Account | undefined): FxFamily {
    if (!account) return 'Oficial'
    if (isExchange(account)) return 'Cripto'
    if (isBroker(account)) return 'MEP'
    return 'Oficial'
}

/** Get the correct FX rate for a given family and side */
function getFxRate(
    fx: FxRatesSnapshot,
    family: FxFamily,
    side: 'C' | 'V'
): number {
    // Convention in V2:
    // - Side C (Compra): buying USD -> you pay "venta" (ask/sell)
    // - Side V (Venta): selling USD -> you receive "compra" (bid/buy)
    switch (family) {
        case 'Cripto':
            return side === 'C' ? fx.cryptoSell : fx.cryptoBuy
        case 'MEP':
            return side === 'C' ? fx.mepSell : fx.mepBuy
        case 'Oficial':
        default:
            return side === 'C' ? fx.officialSell : fx.officialBuy
    }
}

/** Build FxMeta for an item based on account type and currency direction */
function buildFxMeta(
    account: Account | undefined,
    fx: FxRatesSnapshot,
    isUsdToArs: boolean,
    manualOverride?: FxOverride
): FxMeta {
    const autoFamily = getFxFamilyForAccount(account)
    // USD->ARS: selling USD -> side V
    // ARS->USD: buying USD -> side C
    const autoSide: 'C' | 'V' = isUsdToArs ? 'V' : 'C'
    const autoRate = getFxRate(fx, autoFamily, autoSide)

    if (manualOverride) {
        const manualRate = getFxRate(fx, manualOverride.family, manualOverride.side)
        if (Number.isFinite(manualRate) && manualRate > 0) {
            return { family: manualOverride.family, side: manualOverride.side, rate: manualRate }
        }
    }

    return { family: autoFamily, side: autoSide, rate: autoRate }
}

function mapCategoryToKind(category: string): ItemKind {
    switch (category) {
        case 'CEDEAR':
            return 'cedear'
        case 'CRYPTO':
            return 'crypto'
        case 'STABLE':
            return 'stable'
        case 'CASH_ARS':
            return 'cash_ars'
        case 'CASH_USD':
            return 'cash_usd'
        case 'FCI':
            return 'fci'
        case 'PF':
            return 'plazo_fijo'
        default:
            return 'cash_ars'
    }
}

/** Get default FX family for a given asset category */
function getFxFamilyForCategory(category: string, account?: Account): FxMeta['family'] {
    // For cash items, use account-based logic
    if (category === 'CASH_ARS' || category === 'CASH_USD') {
        return getFxFamilyForAccount(account)
    }
    // Asset-specific FX families
    switch (category) {
        case 'CEDEAR':
            return 'MEP'
        case 'CRYPTO':
        case 'STABLE':
            return 'Cripto'
        case 'FCI':
        case 'PF':
        default:
            return 'Oficial'
    }
}

function buildItemFromMetrics(
    metrics: AssetRowMetrics,
    accountId: string,
    fxSnapshot?: FxRatesSnapshot,
    account?: Account,
    fxOverrides?: FxOverridesMap,
    lastTrades?: Map<string, { unitPrice: number; asOfISO: string; tradeCurrency: Movement['tradeCurrency'] }>
): ItemV2 {
    const kind = mapCategoryToKind(metrics.category)

    // Compute fxMeta for ALL items if FX info is available
    let fxMeta: FxMeta | undefined
    let valArs = metrics.valArs ?? 0
    let valUsd = metrics.valUsdEq ?? 0
    let priceMeta: ItemV2['priceMeta'] | undefined

    if (fxSnapshot) {
        const isCashItem = kind === 'cash_ars' || kind === 'cash_usd' || kind === 'wallet_yield'

        if (isCashItem) {
            // CASH_USD: US dollar balance valued to ARS → USD→ARS = Venta
            // CASH_ARS: ARS balance valued to USD → ARS→USD = Compra
            const isUsdToArs = kind === 'cash_usd'
            const overrideKey = `${accountId}:${kind}`
            const manualOverride = fxOverrides?.[overrideKey]
            fxMeta = buildFxMeta(account, fxSnapshot, isUsdToArs, manualOverride)

            // CRITICAL FIX: Recalculate valArs/valUsd with the correct FX rate
            // The upstream metrics use a generic 'oficial' rate, but we need to use
            // the account-specific rate (Cripto for exchanges, MEP for brokers, Oficial for wallets)
            const qty = metrics.quantity ?? 0
            if (kind === 'cash_usd') {
                // USD balance: valUsd = qty, valArs = qty * rate(Venta)
                valUsd = qty
                valArs = qty * fxMeta.rate
            } else {
                // ARS balance (cash_ars or wallet_yield): valArs = qty, valUsd = qty / rate(Compra)
                valArs = qty
                valUsd = fxMeta.rate > 0 ? qty / fxMeta.rate : 0
            }
        } else {
            // Non-cash items (CEDEARs, Crypto, FCI, etc.)
            // These assets are priced in their native currency and we need to convert
            // CEDEARs: priced in ARS, convert to USD using MEP
            // Crypto: priced in USD, convert to ARS using Cripto
            // FCI: priced in ARS (VCP), convert to USD using Oficial
            const family = getFxFamilyForCategory(metrics.category, account)

            // Determine if this is a USD-native asset
            const isUsdNative = metrics.nativeCurrency === 'USD' || metrics.category === 'CRYPTO' || metrics.category === 'STABLE'

            // For USD-native: USD→ARS uses Venta (V)
            // For ARS-native: ARS→USD uses Compra (C)
            const side: 'C' | 'V' = isUsdNative ? 'V' : 'C'
            const rate = getFxRate(fxSnapshot, family, side)

            // Check for manual override
            const overrideKey = `${accountId}:${kind}`
            const manualOverride = fxOverrides?.[overrideKey]

            if (manualOverride) {
                const manualRate = getFxRate(fxSnapshot, manualOverride.family, manualOverride.side)
                if (Number.isFinite(manualRate) && manualRate > 0) {
                    fxMeta = { family: manualOverride.family, side: manualOverride.side, rate: manualRate }
                } else {
                    fxMeta = { family, side, rate }
                }
            } else {
                fxMeta = { family, side, rate }
            }

            // Recalculate USD/ARS equivalents to guarantee consistency with fxMeta
            // (and to avoid mixing upstream metrics FX policies across rubros).
            if (fxMeta && fxMeta.rate > 0) {
                if (isUsdNative) {
                    valUsd = metrics.valUsdEq ?? 0
                    valArs = valUsd * fxMeta.rate
                } else {
                    valArs = metrics.valArs ?? 0
                    valUsd = valArs / fxMeta.rate
                }
            }

            // FCI pricing safety: never allow implicit "price=1" valuations.
            if (metrics.category === 'FCI') {
                const qty = metrics.quantity ?? 0
                const key = `${accountId}:${metrics.instrumentId ?? metrics.symbol}`
                const last = lastTrades?.get(key)

                const quoteUnit = (metrics.currentPrice != null && Number.isFinite(metrics.currentPrice) && metrics.currentPrice > 0)
                    ? metrics.currentPrice
                    : null

                const lastTradeUnit = (last?.unitPrice != null
                    && Number.isFinite(last.unitPrice)
                    && last.unitPrice > 0
                    && (!last.tradeCurrency || last.tradeCurrency === metrics.nativeCurrency))
                    ? last.unitPrice
                    : null

                const avgCostUnit = (metrics.avgCost != null && Number.isFinite(metrics.avgCost) && metrics.avgCost > 0)
                    ? metrics.avgCost
                    : (qty > 0 && metrics.costArs != null && Number.isFinite(metrics.costArs) && metrics.costArs > 0)
                        ? metrics.costArs / qty
                        : null

                const unit = quoteUnit ?? lastTradeUnit ?? avgCostUnit ?? 0
                const source: NonNullable<ItemV2['priceMeta']>['source'] =
                    quoteUnit ? 'quote' : lastTradeUnit ? 'last_trade' : avgCostUnit ? 'avg_cost' : 'missing'

                priceMeta = {
                    source,
                    unitPrice: unit > 0 ? unit : undefined,
                    asOfISO: source === 'last_trade' ? last?.asOfISO : undefined,
                }

                if (fxMeta && fxMeta.rate > 0 && qty > 0 && unit > 0) {
                    const isFciUsd = metrics.nativeCurrency === 'USD'
                    if (isFciUsd) {
                        valUsd = qty * unit
                        valArs = valUsd * fxMeta.rate
                    } else {
                        valArs = qty * unit
                        valUsd = valArs / fxMeta.rate
                    }
                }
            }
        }
    }

    return {
        id: `${accountId}-${metrics.instrumentId || metrics.symbol}`,
        kind,
        symbol: metrics.symbol,
        label: metrics.name || metrics.symbol,
        qty: metrics.quantity,
        valArs,
        valUsd,
        pnlArs: Number.isFinite(metrics.costArs ?? NaN) ? valArs - (metrics.costArs ?? 0) : (metrics.pnlArs ?? undefined),
        pnlUsd: Number.isFinite(metrics.costUsdEq ?? NaN) ? valUsd - (metrics.costUsdEq ?? 0) : (metrics.pnlUsdEq ?? undefined),
        pnlPct: (() => {
            const costArs = metrics.costArs ?? null
            const costUsd = metrics.costUsdEq ?? null
            const isUsdBasis = metrics.nativeCurrency === 'USD' || metrics.category === 'CRYPTO' || metrics.category === 'STABLE'
            if (isUsdBasis && costUsd != null && Number.isFinite(costUsd) && costUsd > 0) return (valUsd - costUsd) / costUsd
            if (costArs != null && Number.isFinite(costArs) && costArs > 0) return (valArs - costArs) / costArs
            return metrics.pnlPct ?? undefined
        })(),
        accountId,
        instrumentId: metrics.instrumentId,
        fxMeta,
        priceMeta,
    }
}


function buildProviderFromGroup(
    accountId: string,
    accountName: string,
    metrics: AssetRowMetrics[],
    settingsMap: Map<string, AccountSettings>,
    account?: Account,
    fxSnapshot?: FxRatesSnapshot,
    fxOverrides?: FxOverridesMap,
    lastTrades?: Map<string, { unitPrice: number; asOfISO: string; tradeCurrency: Movement['tradeCurrency'] }>
): ProviderV2 | null {
    // Filter out zero-balance items
    const filteredMetrics = metrics.filter(m => hasSignificantValue(m.valArs ?? 0, m.quantity, m.category))
    if (filteredMetrics.length === 0) return null
    const items: ItemV2[] = filteredMetrics.map(m => buildItemFromMetrics(m, accountId, fxSnapshot, account, fxOverrides, lastTrades))
    const displayName = getDisplayName(accountId, accountName, settingsMap)

    // Attach yield metadata for remunerated ARS cash (so ItemRow can render TNA chip)
    const enrichedItems = items.map((it, idx) => {
        const m = filteredMetrics[idx]
        if (m.category === 'CASH_ARS') {
            return maybeAttachYieldMetaToArsCashItem(it, accountId, account, settingsMap)
        }
        return it
    })

    // Calculate totals from enriched items (with corrected FX values)
    const totals = {
        valArs: enrichedItems.reduce((s, it) => s + it.valArs, 0),
        valUsd: enrichedItems.reduce((s, it) => s + it.valUsd, 0),
        pnlArs: enrichedItems.reduce((s, it) => s + (it.pnlArs ?? 0), 0),
        pnlUsd: enrichedItems.reduce((s, it) => s + (it.pnlUsd ?? 0), 0),
    }

    // Compute provider-level fxMeta (if all items share the same fxMeta family)
    let providerFxMeta: FxMeta | undefined
    const itemsWithFx = enrichedItems.filter(it => it.fxMeta)
    if (itemsWithFx.length > 0) {
        const families = new Set(itemsWithFx.map(it => it.fxMeta!.family))
        if (families.size === 1) {
            // All items share the same FX family - use first item's fxMeta
            providerFxMeta = itemsWithFx[0].fxMeta
        }
        // If mixed, providerFxMeta stays undefined (UI can show "TC Mixto")
    }

    return {
        id: accountId,
        name: displayName,
        totals: { ars: totals.valArs, usd: totals.valUsd },
        pnl: { ars: totals.pnlArs, usd: totals.pnlUsd },
        items: enrichedItems,
        fxMeta: providerFxMeta,
    }
}


interface GroupedRowEntry {
    accountName: string
    metrics: AssetRowMetrics[]
    totals: {
        valArs: number
        valUsd: number
        pnlArs: number
        pnlUsd: number
    }
}

export interface PFData {
    active: PFPosition[]
    matured: PFPosition[]
    totalActiveARS: number
    totalMaturedARS: number
    totalActiveInterestARS: number
}

export function buildRubros(
    groupedRows: Record<string, GroupedRowEntry>,
    accounts: Account[],
    pfData?: PFData,
    fxSnapshot?: FxRatesSnapshot,
    accountSettings: AccountSettings[] = [],
    fxOverrides?: FxOverridesMap,
    lastTrades?: Map<string, { unitPrice: number; asOfISO: string; tradeCurrency: Movement['tradeCurrency'] }>
): RubroV2[] {
    const rubros: RubroV2[] = []
    const accountMap = new Map(accounts.map(a => [a.id, a]))
    const settingsMap = new Map(accountSettings.map(s => [s.id, s]))
    const oficialSell = fxSnapshot?.officialSell ?? 1

    for (const config of RUBRO_CONFIGS) {
        const providers: ProviderV2[] = []
        const rubroTotals: MoneyPair = { ars: 0, usd: 0 }
        const rubroPnl: MoneyPair = { ars: 0, usd: 0 }

        // Special handling for Frascos (only accounts with rubroOverride='frascos')
        if (config.id === 'frascos') {
            for (const [accountId, group] of Object.entries(groupedRows)) {
                const account = accountMap.get(accountId)
                const rubroOverride = settingsMap.get(accountId)?.rubroOverride

                // Only include if explicitly marked as Frasco via settings
                if (!isFrasco(rubroOverride)) continue

                // Get cash items from this account
                const cashItems = group.metrics.filter(
                    m => m.category === 'CASH_ARS' || m.category === 'CASH_USD'
                )
                // Filter out zero balances
                const filteredCashItems = cashItems.filter(m => hasSignificantValue(m.valArs ?? 0, m.quantity, m.category))
                if (filteredCashItems.length === 0) continue

                // Convert to wallet_yield items
                const yieldItems: ItemV2[] = filteredCashItems.map(m => {
                    const base = buildItemFromMetrics(m, accountId, fxSnapshot, account, fxOverrides, lastTrades)
                    const yieldMeta = buildYieldMeta(accountId, account, settingsMap)

                    // If the item is ARS cash, allow FX override keyed by wallet_yield as well (UI may target that kind).
                    if (fxSnapshot && m.category === 'CASH_ARS') {
                        const manual = fxOverrides?.[`${accountId}:wallet_yield`]
                        if (manual) {
                            const fxMeta = buildFxMeta(account, fxSnapshot, false, manual)
                            const qty = m.quantity ?? 0
                            return {
                                ...base,
                                kind: 'wallet_yield' as ItemKind,
                                yieldMeta,
                                fxMeta,
                                valArs: qty,
                                valUsd: fxMeta.rate > 0 ? qty / fxMeta.rate : 0,
                            }
                        }
                    }

                    return {
                        ...base,
                        kind: 'wallet_yield' as ItemKind,
                        yieldMeta,
                    }
                })

                // Totals must be derived from rendered items (ensures FX overrides affect totals too)
                const itemsTotals = {
                    valArs: yieldItems.reduce((s, it) => s + it.valArs, 0),
                    valUsd: yieldItems.reduce((s, it) => s + it.valUsd, 0),
                    pnlArs: yieldItems.reduce((s, it) => s + (it.pnlArs ?? 0), 0),
                    pnlUsd: yieldItems.reduce((s, it) => s + (it.pnlUsd ?? 0), 0),
                }

                const provider: ProviderV2 = {
                    id: accountId,
                    name: getDisplayName(accountId, account?.name, settingsMap),
                    totals: { ars: itemsTotals.valArs, usd: itemsTotals.valUsd },
                    pnl: { ars: itemsTotals.pnlArs, usd: itemsTotals.pnlUsd },
                    items: yieldItems,
                }

                providers.push(provider)
                rubroTotals.ars += itemsTotals.valArs
                rubroTotals.usd += itemsTotals.valUsd
                rubroPnl.ars += itemsTotals.pnlArs
                rubroPnl.usd += itemsTotals.pnlUsd
            }
        }
        // Special handling for Plazos Fijos from pfData
        else if (config.id === 'plazos' && pfData) {
            const allPf = [...pfData.active, ...pfData.matured]

            // Group by bank
            const byBank = new Map<string, PFPosition[]>()
            for (const pf of allPf) {
                const bank = pf.bank || 'Sin Banco'
                if (!byBank.has(bank)) byBank.set(bank, [])
                byBank.get(bank)!.push(pf)
            }

            for (const [bank, pfPositions] of byBank) {
                const bankTotal = pfPositions.reduce((s, pf) => s + pf.expectedTotalARS, 0)

                const items: ItemV2[] = pfPositions.map(pf => {
                    const daysRemaining = pf.maturityTs
                        ? Math.max(0, Math.ceil((new Date(pf.maturityTs).getTime() - Date.now()) / 86400000))
                        : 0

                    // Build yieldMeta for PF if TNA is available
                    const yieldMeta: ItemV2['yieldMeta'] | undefined = pf.tna && pf.tna > 0
                        ? {
                            tna: pf.tna,
                            tea: pf.tea ?? computeTEA(pf.tna),
                        }
                        : undefined

                    // Build fxMeta for PF (always Oficial)
                    const pfFxMeta: FxMeta | undefined = fxSnapshot
                        ? { family: 'Oficial', side: 'V', rate: oficialSell }
                        : undefined

                    return {
                        id: pf.id,
                        kind: 'plazo_fijo' as ItemKind,
                        symbol: 'PF',
                        label: pf.alias || pf.pfCode || 'Plazo Fijo',
                        valArs: pf.expectedTotalARS,
                        valUsd: pf.expectedTotalARS / oficialSell,
                        accountId: pf.accountId,
                        pfMeta: {
                            startDateISO: pf.startTs,
                            maturityDateISO: pf.maturityTs,
                            daysRemaining,
                            capitalArs: pf.principalARS,
                            expectedInterestArs: pf.expectedInterestARS,
                            expectedTotalArs: pf.expectedTotalARS,
                        },
                        yieldMeta,
                        fxMeta: pfFxMeta,
                    }
                })

                // PF providers use Oficial FX
                const pfProviderFxMeta: FxMeta | undefined = fxSnapshot
                    ? { family: 'Oficial', side: 'V', rate: oficialSell }
                    : undefined

                providers.push({
                    id: `pf-${bank}`,
                    name: bank,
                    totals: { ars: bankTotal, usd: bankTotal / oficialSell },
                    pnl: { ars: 0, usd: 0 }, // PF doesn't have PnL in this sense
                    items,
                    fxMeta: pfProviderFxMeta,
                })

                rubroTotals.ars += bankTotal
                rubroTotals.usd += bankTotal / oficialSell
            }
        }
        // Standard category-based rubros (Wallets, CEDEARs, Crypto, FCI)
        else {
            for (const [accountId, group] of Object.entries(groupedRows)) {
                const account = accountMap.get(accountId)

                // ==========================================================
                // BILLETERAS: WALLET/BANK + cash from brokers/exchanges
                // ==========================================================
                if (config.id === 'wallets') {
                    const rubroOverride = settingsMap.get(accountId)?.rubroOverride

                    // Case A: Standard wallet/bank accounts - include all their cash
                    if (isWalletForBilleteras(account, rubroOverride)) {
                        const matchingMetrics = group.metrics.filter(m =>
                            config.categories.includes(m.category)
                        )
                        if (matchingMetrics.length === 0) continue

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            matchingMetrics,
                            settingsMap,
                            account,
                            fxSnapshot,
                            fxOverrides,
                            lastTrades
                        )
                        if (!provider) continue

                        providers.push(provider)
                        rubroTotals.ars += provider.totals.ars
                        rubroTotals.usd += provider.totals.usd
                        rubroPnl.ars += provider.pnl.ars
                        rubroPnl.usd += provider.pnl.usd
                        continue
                    }

                    // Case B: Broker/Exchange accounts - extract ONLY their cash items
                    if (isBroker(account) || isExchange(account)) {
                        const cashMetrics = group.metrics.filter(m =>
                            (m.category === 'CASH_ARS' || m.category === 'CASH_USD') &&
                            hasSignificantValue(m.valArs ?? 0, m.quantity, m.category)
                        )
                        if (cashMetrics.length === 0) continue

                        // Create provider with suffix to differentiate from main rubro
                        const providerName = getDisplayName(accountId, account?.name, settingsMap)
                        const items = cashMetrics.map(m => {
                            const base = buildItemFromMetrics(m, accountId, fxSnapshot, account, fxOverrides, lastTrades)
                            if (m.category === 'CASH_ARS') {
                                return maybeAttachYieldMetaToArsCashItem(base, accountId, account, settingsMap)
                            }
                            return base
                        })

                        // Recalculate totals from items (with corrected FX values)
                        const correctedTotals = {
                            valArs: items.reduce((s, it) => s + it.valArs, 0),
                            valUsd: items.reduce((s, it) => s + it.valUsd, 0),
                            pnlArs: items.reduce((s, it) => s + (it.pnlArs ?? 0), 0),
                            pnlUsd: items.reduce((s, it) => s + (it.pnlUsd ?? 0), 0),
                        }

                        // Compute provider fxMeta from items
                        let cashProviderFxMeta: FxMeta | undefined
                        const itemsWithFx = items.filter(it => it.fxMeta)
                        if (itemsWithFx.length > 0) {
                            const families = new Set(itemsWithFx.map(it => it.fxMeta!.family))
                            if (families.size === 1) {
                                cashProviderFxMeta = itemsWithFx[0].fxMeta
                            }
                        }

                        const provider: ProviderV2 = {
                            id: `${accountId}-cash`,
                            name: `${providerName} (Liquidez)`,
                            totals: { ars: correctedTotals.valArs, usd: correctedTotals.valUsd },
                            pnl: { ars: correctedTotals.pnlArs, usd: correctedTotals.pnlUsd },
                            items,
                            fxMeta: cashProviderFxMeta,
                        }

                        providers.push(provider)
                        rubroTotals.ars += correctedTotals.valArs
                        rubroTotals.usd += correctedTotals.valUsd
                        rubroPnl.ars += correctedTotals.pnlArs
                        rubroPnl.usd += correctedTotals.pnlUsd
                        continue
                    }

                    // Other account types: skip for wallets rubro
                    continue
                }

                // ==========================================================
                // CRIPTO: Exchange accounts get crypto items (cash goes to Billeteras)
                // ==========================================================
                if (config.id === 'crypto') {
                    // For exchange accounts: include crypto/stable items, EXCLUDE cash
                    if (isExchange(account)) {
                        // Filter out cash items (they go to Billeteras)
                        const cryptoMetrics = group.metrics.filter(m =>
                            m.category !== 'CASH_ARS' && m.category !== 'CASH_USD'
                        )
                        if (cryptoMetrics.length === 0) continue

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            cryptoMetrics,
                            settingsMap,
                            account,
                            fxSnapshot,
                            fxOverrides,
                            lastTrades
                        )
                        if (!provider) continue

                        providers.push(provider)
                        rubroTotals.ars += provider.totals.ars
                        rubroTotals.usd += provider.totals.usd
                        rubroPnl.ars += provider.pnl.ars
                        rubroPnl.usd += provider.pnl.usd
                    } else {
                        // For non-exchange accounts, only CRYPTO/STABLE categories
                        const matchingMetrics = group.metrics.filter(m =>
                            config.categories.includes(m.category)
                        )
                        if (matchingMetrics.length === 0) continue

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            matchingMetrics,
                            settingsMap,
                            account,
                            fxSnapshot,
                            fxOverrides,
                            lastTrades
                        )
                        if (!provider) continue

                        providers.push(provider)
                        rubroTotals.ars += provider.totals.ars
                        rubroTotals.usd += provider.totals.usd
                        rubroPnl.ars += provider.pnl.ars
                        rubroPnl.usd += provider.pnl.usd
                    }
                    continue
                }

                // ==========================================================
                // CEDEARS: Broker accounts get cedear items (cash goes to Billeteras)
                // ==========================================================
                if (config.id === 'cedears') {
                    // For broker accounts: include cedear/stock items, EXCLUDE cash
                    if (isBroker(account)) {
                        // Brokers can hold multiple asset classes (CEDEAR + FCI, etc.).
                        // CEDEARs rubro must include ONLY CEDEAR instruments to avoid duplication and FX mismatches.
                        const cedearMetrics = group.metrics.filter(m => config.categories.includes(m.category))
                        if (cedearMetrics.length === 0) continue

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            cedearMetrics,
                            settingsMap,
                            account,
                            fxSnapshot,
                            fxOverrides,
                            lastTrades
                        )
                        if (!provider) continue

                        providers.push(provider)
                        rubroTotals.ars += provider.totals.ars
                        rubroTotals.usd += provider.totals.usd
                        rubroPnl.ars += provider.pnl.ars
                        rubroPnl.usd += provider.pnl.usd
                    } else {
                        // For non-broker accounts, only CEDEAR category
                        const matchingMetrics = group.metrics.filter(m =>
                            config.categories.includes(m.category)
                        )
                        if (matchingMetrics.length === 0) continue

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            matchingMetrics,
                            settingsMap,
                            account,
                            fxSnapshot,
                            fxOverrides,
                            lastTrades
                        )
                        if (!provider) continue

                        providers.push(provider)
                        rubroTotals.ars += provider.totals.ars
                        rubroTotals.usd += provider.totals.usd
                        rubroPnl.ars += provider.pnl.ars
                        rubroPnl.usd += provider.pnl.usd
                    }
                    continue
                }

                // ==========================================================
                // OTHER RUBROS (FCI, etc): Standard category-based filtering
                // ==========================================================
                // Filter metrics by category
                const matchingMetrics = group.metrics.filter(m =>
                    config.categories.includes(m.category)
                )
                if (matchingMetrics.length === 0) continue

                const provider = buildProviderFromGroup(
                    accountId,
                    group.accountName,
                    matchingMetrics,
                    settingsMap,
                    account,
                    fxSnapshot,
                    fxOverrides,
                    lastTrades
                )
                if (!provider) continue

                providers.push(provider)
                rubroTotals.ars += provider.totals.ars
                rubroTotals.usd += provider.totals.usd
                rubroPnl.ars += provider.pnl.ars
                rubroPnl.usd += provider.pnl.usd
            }
        }

        // Only add rubro if it has providers
        if (providers.length > 0) {
            // Compute rubro-level fxMeta (if all providers share the same fxMeta family)
            let rubroFxMeta: FxMeta | undefined
            const providersWithFx = providers.filter(p => p.fxMeta)
            if (providersWithFx.length > 0) {
                const families = new Set(providersWithFx.map(p => p.fxMeta!.family))
                if (families.size === 1) {
                    // All providers share the same FX family
                    rubroFxMeta = providersWithFx[0].fxMeta
                }
                // If mixed, rubroFxMeta stays undefined (UI can show "TC Mixto")
            }

            rubros.push({
                id: config.id,
                name: config.name,
                icon: config.icon,
                fxPolicy: config.fxPolicy,
                totals: rubroTotals,
                pnl: rubroPnl,
                providers,
                fxMeta: rubroFxMeta,
            })
        }
    }

    return rubros
}

export function buildKPIs(
    rubros: RubroV2[],
    _accounts: Account[],
    fxSnapshot: FxRatesSnapshot
): PortfolioKPIs {
    let totalArs = 0
    let totalUsd = 0
    let pnlUnrealizedArs = 0
    let pnlUnrealizedUsd = 0

    // Exposure buckets
    let usdHard = 0     // Crypto USD + Billete USD
    let arsReal = 0     // ARS efectivo

    for (const rubro of rubros) {
        totalArs += rubro.totals.ars
        totalUsd += rubro.totals.usd
        pnlUnrealizedArs += rubro.pnl.ars
        pnlUnrealizedUsd += rubro.pnl.usd

        // Bucket by rubro type
        if (rubro.id === 'crypto') {
            // All crypto is USD-hard
            usdHard += rubro.totals.usd
        } else if (rubro.id === 'wallets' || rubro.id === 'frascos') {
            // Check each item's currency
            for (const prov of rubro.providers) {
                for (const item of prov.items) {
                    if (item.kind === 'cash_usd') {
                        usdHard += item.valUsd
                    } else {
                        arsReal += item.valArs
                    }
                }
            }
        } else {
            // CEDEARs, PF, FCI → all considered ARS exposure converted
            arsReal += rubro.totals.ars
        }
    }

    const mepRate = fxSnapshot.mepSell || fxSnapshot.officialSell || 1
    // NOTE: We intentionally DO NOT compute total USD as totalArs / FX.
    // Total USD should be the sum of already-valued items (each with its own FX family).
    // Keep *Eq fields as backwards-compatible aliases.
    const totalUsdEq = totalUsd
    const pnlUnrealizedUsdEq = pnlUnrealizedUsd

    // ARS converted to USD equivalent
    const usdEquivalent = arsReal / mepRate

    const totalPortfolioUsd = usdHard + usdEquivalent

    // Percentages
    const pctUsdHard = totalPortfolioUsd > 0 ? (usdHard / totalPortfolioUsd) * 100 : 0
    const pctUsdEq = totalPortfolioUsd > 0 ? (usdEquivalent / totalPortfolioUsd) * 100 : 0
    const pctArs = 100 - pctUsdHard - pctUsdEq

    return {
        totalArs,
        totalUsd,
        totalUsdEq,
        pnlUnrealizedArs,
        pnlUnrealizedUsd,
        pnlUnrealizedUsdEq,
        exposure: { usdHard, usdEquivalent, arsReal },
        pctUsdHard,
        pctUsdEq,
        pctArs,
    }
}

function computeTEA(tna: number): number {
    // TEA = (1 + TNA/365)^365 - 1
    return (Math.pow(1 + tna / 100 / 365, 365) - 1) * 100
}

function buildLastTradeUnitPriceIndex(
    movements: Movement[]
): Map<string, { unitPrice: number; asOfISO: string; tradeCurrency: Movement['tradeCurrency'] }> {
    const map = new Map<string, { unitPrice: number; asOfISO: string; tradeCurrency: Movement['tradeCurrency'] }>()

    for (const m of movements) {
        if (!m.instrumentId) continue
        if (m.type !== 'BUY') continue
        if (m.unitPrice == null || !Number.isFinite(m.unitPrice) || m.unitPrice <= 0) continue
        if (!m.datetimeISO) continue

        const key = `${m.accountId}:${m.instrumentId}`
        const existing = map.get(key)
        if (!existing || m.datetimeISO > existing.asOfISO) {
            map.set(key, { unitPrice: m.unitPrice, asOfISO: m.datetimeISO, tradeCurrency: m.tradeCurrency })
        }
    }

    return map
}

// =============================================================================
// Main Builder Function
// =============================================================================

export interface BuildPortfolioV2Input {
    groupedRows: Record<string, GroupedRowEntry>
    accounts: Account[]
    fxRates: FxRates
    movements: Movement[]
    pfData?: PFData
    accountSettings?: AccountSettings[]
    fxOverrides?: FxOverridesMap
}

export function buildPortfolioV2(input: BuildPortfolioV2Input): PortfolioV2 {
    const { groupedRows, accounts, fxRates, movements, pfData, accountSettings = [], fxOverrides } = input

    const fxSnapshot = buildFxSnapshot(fxRates)
    const lastTrades = buildLastTradeUnitPriceIndex(movements)
    const rubros = buildRubros(groupedRows, accounts, pfData, fxSnapshot, accountSettings, fxOverrides, lastTrades)
    const kpis = buildKPIs(rubros, accounts, fxSnapshot)

    // Debug guard rail: detect same (accountId + instrumentId/symbol) present in multiple rubros.
    // Only in browser when `?debug=1` is set.
    try {
        const isDebug = typeof window !== 'undefined'
            && typeof window.location?.search === 'string'
            && new URLSearchParams(window.location.search).get('debug') === '1'

        if (isDebug) {
            const seen = new Map<string, { rubros: Set<string>; labels: Set<string> }>()
            for (const rubro of rubros) {
                for (const provider of rubro.providers) {
                    for (const item of provider.items) {
                        const key = `${item.accountId}:${item.instrumentId ?? item.symbol}`
                        const entry = seen.get(key) ?? { rubros: new Set<string>(), labels: new Set<string>() }
                        entry.rubros.add(rubro.id)
                        entry.labels.add(item.label)
                        seen.set(key, entry)
                    }
                }
            }

            const duplicates = [...seen.entries()]
                .filter(([, v]) => v.rubros.size > 1)
                .map(([key, v]) => ({ key, rubros: [...v.rubros], labels: [...v.labels] }))

            if (duplicates.length > 0) {
                console.warn('[portfolioV2] Duplicate items across rubros detected:', duplicates)
            }
        }
    } catch {
        // ignore debug-only guard rail failures
    }

    // Count inferred balances
    let inferredCount = 0
    for (const group of Object.values(groupedRows)) {
        for (const m of group.metrics) {
            if (m.openingBalanceInferred) inferredCount++
        }
    }

    // Build detail maps
    const walletDetails = new Map<string, WalletDetail>()
    const fixedDepositDetails = new Map<string, FixedDepositDetail>()

    // Populate wallet details for yield accounts
    for (const acc of accounts) {
        if (!acc.cashYield?.enabled) continue

        const group = groupedRows[acc.id]
        if (!group) continue

        const cashArs = group.metrics
            .filter(m => m.category === 'CASH_ARS')
            .reduce((s, m) => s + (m.valArs ?? 0), 0)
        const cashUsd = group.metrics
            .filter(m => m.category === 'CASH_USD')
            .reduce((s, m) => s + (m.valArs ?? 0), 0)

        // Get recent interest movements
        const interestMovs = movements
            .filter(m => m.type === 'INTEREST' && m.accountId === acc.id)
            .sort((a, b) => b.datetimeISO.localeCompare(a.datetimeISO))
            .slice(0, 30)

        walletDetails.set(acc.id, {
            accountId: acc.id,
            accountName: acc.name,
            cashBalanceArs: cashArs,
            cashBalanceUsd: cashUsd,
            yieldEnabled: true,
            tna: acc.cashYield.tna,
            tea: computeTEA(acc.cashYield.tna),
            recentInterestMovements: interestMovs.map(m => ({
                dateISO: m.datetimeISO.slice(0, 10),
                amountArs: m.totalAmount ?? 0,
            })),
        })
    }

    // Populate fixed deposit details
    if (pfData) {
        const allPf = [...pfData.active, ...pfData.matured]
        for (const pf of allPf) {
            const now = Date.now()
            const maturityDate = pf.maturityTs ? new Date(pf.maturityTs).getTime() : now
            const startDate = pf.startTs ? new Date(pf.startTs).getTime() : now
            const daysRemaining = Math.max(0, Math.ceil((maturityDate - now) / 86400000))
            const daysElapsed = Math.max(0, Math.ceil((now - startDate) / 86400000))

            fixedDepositDetails.set(pf.id, {
                movementId: pf.movementId,
                pfCode: pf.pfCode ?? `PF-${pf.id.slice(0, 8)}`,
                bank: pf.bank,
                alias: pf.alias,
                status: maturityDate > now ? 'active' : 'matured',
                capitalArs: pf.principalARS,
                tna: pf.tna,
                tea: pf.tea,
                termDays: pf.termDays,
                startDateISO: pf.startTs,
                maturityDateISO: pf.maturityTs,
                daysRemaining,
                daysElapsed,
                expectedInterestArs: pf.expectedInterestARS,
                expectedTotalArs: pf.expectedTotalARS,
                accruedInterestArs: pf.termDays > 0 ? (pf.expectedInterestARS / pf.termDays) * daysElapsed : 0,
                fxAtConstituteOficial: pf.initialFx,
            })
        }
    }

    // Build CEDEAR details from movements + FIFO lots
    const cedearDetails = new Map<string, CedearDetail>()
    const cedearRubro = rubros.find(r => r.id === 'cedears')
    if (cedearRubro) {
        const mepSellRate = fxSnapshot.mepSell || 1

        for (const provider of cedearRubro.providers) {
            for (const item of provider.items) {
                if (item.kind !== 'cedear') continue
                if (!item.instrumentId && !item.symbol) continue

                const assetMovements = movements.filter(m =>
                    m.accountId === item.accountId &&
                    (m.instrumentId === item.instrumentId ||
                        (!m.instrumentId && m.ticker === item.symbol)) &&
                    (m.assetClass === 'cedear')
                )

                if (assetMovements.length === 0) continue

                const fifoResult = buildFifoLots(assetMovements)

                // Current price ARS: derive from item value / qty
                const currentPriceArs = (item.qty && item.qty > 0)
                    ? item.valArs / item.qty
                    : 0
                const currentPriceUsd = mepSellRate > 0 ? currentPriceArs / mepSellRate : 0

                // Find instrument for ratio info
                const instrument = assetMovements[0]
                const cedearRatio = (instrument as any)?.cedearRatio ?? 1

                // Map FIFO lots to CedearLotDetail
                const lots: CedearLotDetail[] = fifoResult.lots.map((lot, idx) => {
                    const fxMissing = !lot.fxAtTrade || lot.fxAtTrade <= 1
                    const fxHist = lot.fxAtTrade > 0 ? lot.fxAtTrade : mepSellRate

                    const unitCostArs = lot.unitCostArs
                    const unitCostUsd = fxHist > 0 ? unitCostArs / fxHist : 0
                    const totalCostArs = lot.quantity * unitCostArs
                    const totalCostUsd = lot.quantity * unitCostUsd

                    const currentValueArs = lot.quantity * currentPriceArs
                    const currentValueUsd = mepSellRate > 0 ? currentValueArs / mepSellRate : 0

                    const pnlArs = currentValueArs - totalCostArs
                    const pnlUsd = currentValueUsd - totalCostUsd
                    const pnlPctArs = totalCostArs > 0 ? pnlArs / totalCostArs : 0
                    const pnlPctUsd = totalCostUsd > 0 ? pnlUsd / totalCostUsd : 0

                    return {
                        id: `${item.id}-lot-${idx}`,
                        dateISO: lot.date,
                        qty: lot.quantity,
                        unitCostArs,
                        unitCostUsd,
                        totalCostArs,
                        totalCostUsd,
                        currentValueArs,
                        currentValueUsd,
                        pnlArs,
                        pnlUsd,
                        pnlPctArs,
                        pnlPctUsd,
                        fxAtTrade: lot.fxAtTrade,
                        fxMissing: fxMissing ? true : undefined,
                    }
                })

                const totalQty = fifoResult.totalQuantity
                const totalCostArs = lots.reduce((s, l) => s + l.totalCostArs, 0)
                const totalCostUsd = lots.reduce((s, l) => s + l.totalCostUsd, 0)
                const avgCostArs = totalQty > 0 ? totalCostArs / totalQty : 0
                const avgCostUsd = totalQty > 0 ? totalCostUsd / totalQty : 0
                const currentValueArs = totalQty * currentPriceArs
                const currentValueUsd = mepSellRate > 0 ? currentValueArs / mepSellRate : 0
                const pnlArs = currentValueArs - totalCostArs
                const pnlUsd = currentValueUsd - totalCostUsd
                const pnlPctArs = totalCostArs > 0 ? pnlArs / totalCostArs : 0
                const pnlPctUsd = totalCostUsd > 0 ? pnlUsd / totalCostUsd : 0

                cedearDetails.set(item.id, {
                    instrumentId: item.instrumentId || item.symbol,
                    symbol: item.symbol,
                    name: item.label,
                    ratio: cedearRatio,
                    totalQty,
                    totalCostArs,
                    totalCostUsd,
                    avgCostArs,
                    avgCostUsd,
                    currentPriceArs,
                    currentPriceUsd,
                    currentValueArs,
                    currentValueUsd,
                    pnlArs,
                    pnlUsd,
                    pnlPctArs,
                    pnlPctUsd,
                    lots,
                    fxUsed: 'MEP',
                })
            }
        }
    }

    // Build crypto details from movements + FIFO lots
    const cryptoDetails = new Map<string, CryptoDetail>()
    const cryptoRubro = rubros.find(r => r.id === 'crypto')
    if (cryptoRubro) {
        const criptoSellRate = fxSnapshot.cryptoSell || 1

        for (const provider of cryptoRubro.providers) {
            for (const item of provider.items) {
                // Only build details for volatile crypto (not stablecoins)
                if (item.kind !== 'crypto') continue
                if (!item.instrumentId && !item.symbol) continue

                // Filter movements for this instrument+account
                const assetMovements = movements.filter(m =>
                    m.accountId === item.accountId &&
                    (m.instrumentId === item.instrumentId ||
                        (!m.instrumentId && m.ticker === item.symbol)) &&
                    (m.assetClass === 'crypto')
                )

                if (assetMovements.length === 0) continue

                // Build FIFO lots
                const fifoResult = buildFifoLots(assetMovements)

                // Current price: derive from item value / qty
                const currentPriceUsd = (item.qty && item.qty > 0)
                    ? item.valUsd / item.qty
                    : 0

                // Map FIFO lots to LotDetail
                const lots: LotDetail[] = fifoResult.lots.map((lot, idx) => {
                    const currentVal = lot.quantity * currentPriceUsd
                    const costVal = lot.quantity * lot.unitCostUsd
                    const pnl = currentVal - costVal
                    const pnlPct = costVal > 0 ? pnl / costVal : 0

                    return {
                        id: `${item.id}-lot-${idx}`,
                        dateISO: lot.date,
                        qty: lot.quantity,
                        unitCostNative: lot.unitCostUsd,
                        totalCostNative: costVal,
                        currentValueNative: currentVal,
                        pnlNative: pnl,
                        pnlPct,
                    }
                })

                const totalQty = fifoResult.totalQuantity
                const totalCostUsd = fifoResult.totalCostUsd
                const avgCostUsd = totalQty > 0 ? totalCostUsd / totalQty : 0
                const currentValueUsd = totalQty * currentPriceUsd
                const currentValueArs = currentValueUsd * criptoSellRate
                const pnlUsd = currentValueUsd - totalCostUsd
                const pnlArs = pnlUsd * criptoSellRate
                const pnlPct = totalCostUsd > 0 ? pnlUsd / totalCostUsd : 0

                cryptoDetails.set(item.id, {
                    instrumentId: item.instrumentId || item.symbol,
                    symbol: item.symbol,
                    name: item.label,
                    totalQty,
                    totalCostUsd,
                    avgCostUsd,
                    currentPriceUsd,
                    currentValueUsd,
                    currentValueArs,
                    pnlUsd,
                    pnlArs,
                    pnlPct,
                    lots,
                    fxUsed: 'Cripto',
                })
            }
        }
    }

    // Build FCI details from movements + FIFO lots
    const fciDetails = new Map<string, FciDetail>()
    const fciRubro = rubros.find(r => r.id === 'fci')
    if (fciRubro) {
        const oficialSellRate = fxSnapshot.officialSell || 1

        for (const provider of fciRubro.providers) {
            for (const item of provider.items) {
                if (item.kind !== 'fci') continue
                if (!item.instrumentId && !item.symbol) continue

                // Filter movements for this FCI + account
                const assetMovements = movements.filter(m =>
                    m.accountId === item.accountId &&
                    (m.instrumentId === item.instrumentId ||
                        (!m.instrumentId && m.ticker === item.symbol)) &&
                    (m.assetClass === 'fci')
                )

                if (assetMovements.length === 0) continue

                // Build FIFO lots
                const fifoResult = buildFifoLots(assetMovements)

                // Current VCP (valor cuotaparte): derive from item value / qty
                const currentPriceArs = (item.qty && item.qty > 0)
                    ? item.valArs / item.qty
                    : 0
                const currentPriceUsd = oficialSellRate > 0 ? currentPriceArs / oficialSellRate : 0

                // Map FIFO lots to FciLotDetail with dual-currency
                const lots: FciLotDetail[] = fifoResult.lots.map((lot, idx) => {
                    const fxMissing = !lot.fxAtTrade || lot.fxAtTrade <= 1
                    const fxHist = lot.fxAtTrade > 0 ? lot.fxAtTrade : oficialSellRate

                    const unitCostArs = lot.unitCostArs
                    const unitCostUsd = fxHist > 0 ? unitCostArs / fxHist : 0
                    const totalCostArs = lot.quantity * unitCostArs
                    const totalCostUsd = lot.quantity * unitCostUsd

                    const currentValueArs = lot.quantity * currentPriceArs
                    const currentValueUsd = oficialSellRate > 0 ? currentValueArs / oficialSellRate : 0

                    const pnlArs = currentValueArs - totalCostArs
                    const pnlUsd = currentValueUsd - totalCostUsd
                    const pnlPctArs = totalCostArs > 0 ? pnlArs / totalCostArs : 0
                    const pnlPctUsd = totalCostUsd > 0 ? pnlUsd / totalCostUsd : 0

                    return {
                        id: `${item.id}-lot-${idx}`,
                        dateISO: lot.date,
                        qty: lot.quantity,
                        unitCostArs,
                        unitCostUsd,
                        totalCostArs,
                        totalCostUsd,
                        currentValueArs,
                        currentValueUsd,
                        pnlArs,
                        pnlUsd,
                        pnlPctArs,
                        pnlPctUsd,
                        fxAtTrade: lot.fxAtTrade,
                        fxMissing: fxMissing ? true : undefined,
                    }
                })

                const totalQty = fifoResult.totalQuantity
                const totalCostArs = lots.reduce((s, l) => s + l.totalCostArs, 0)
                const totalCostUsd = lots.reduce((s, l) => s + l.totalCostUsd, 0)
                const avgCostArs = totalQty > 0 ? totalCostArs / totalQty : 0
                const avgCostUsd = totalQty > 0 ? totalCostUsd / totalQty : 0
                const currentValueArs = totalQty * currentPriceArs
                const currentValueUsd = oficialSellRate > 0 ? currentValueArs / oficialSellRate : 0
                const pnlArs = currentValueArs - totalCostArs
                const pnlUsd = currentValueUsd - totalCostUsd
                const pnlPctArs = totalCostArs > 0 ? pnlArs / totalCostArs : 0
                const pnlPctUsd = totalCostUsd > 0 ? pnlUsd / totalCostUsd : 0

                // Extract fund house and class from name if present (e.g., "Premier Capital - Clase D")
                const nameParts = item.label.split(' - ')
                const fundHouse = nameParts.length > 1 ? nameParts[0] : undefined
                const fundClass = nameParts.length > 1 ? nameParts.slice(1).join(' - ') : undefined

                fciDetails.set(item.id, {
                    instrumentId: item.instrumentId || item.symbol,
                    symbol: item.symbol,
                    name: item.label,
                    fundHouse,
                    fundClass,
                    totalQty,
                    totalCostArs,
                    totalCostUsd,
                    avgCostArs,
                    avgCostUsd,
                    currentPriceArs,
                    currentPriceUsd,
                    currentValueArs,
                    currentValueUsd,
                    pnlArs,
                    pnlUsd,
                    pnlPctArs,
                    pnlPctUsd,
                    lots,
                    fxUsed: 'Oficial',
                    priceMeta: item.priceMeta,
                })
            }
        }
    }

    return {
        isLoading: false,
        asOfISO: fxRates.updatedAtISO,
        fx: fxSnapshot,
        kpis,
        flags: {
            inferredBalanceCount: inferredCount,
            inferredMessage: inferredCount > 0
                ? `${inferredCount} posición(es) tienen saldo inicial inferido`
                : undefined,
        },
        rubros,
        walletDetails,
        fixedDepositDetails,
        cedearDetails,
        cryptoDetails,
        fciDetails,
    }
}
