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
    ItemKind,
    MoneyPair,
} from './types'
import type { Account, Movement, FxRates } from '@/domain/types'
import type { AssetRowMetrics } from '@/domain/assets/types'
import type { PFPosition } from '@/domain/pf/types'
import type { AccountSettings, RubroOverride } from '@/db/schema'

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

    // 2. Check account name
    const name = accountName?.trim()
    if (name && name !== 'Account' && name !== 'account' && name.length > 0) {
        return name
    }

    // 3. Humanize account ID (e.g., "binance" -> "Binance")
    const humanized = accountId
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')

    // If ID looks like a UUID or hash, use generic fallback
    if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
        return 'Cuenta sin nombre'
    }

    return humanized
}

/** Filter threshold for zero balances (ARS) */
const ZERO_BALANCE_THRESHOLD = 1

/** Check if item has significant value (not near zero) */
function hasSignificantValue(valArs: number, qty?: number): boolean {
    // If qty > 0, always show (for crypto/cedears with tiny ARS value)
    if (qty && qty > 0) return true
    return Math.abs(valArs) >= ZERO_BALANCE_THRESHOLD
}

// =============================================================================
// Builder Functions
// =============================================================================

export function buildFxSnapshot(fxRates: FxRates): FxRatesSnapshot {
    return {
        officialSell: fxRates.oficial.sell ?? 0,
        officialBuy: fxRates.oficial.buy ?? 0,
        mep: fxRates.mep.sell ?? fxRates.mep.buy ?? 0,
        ccl: fxRates.ccl?.sell ?? fxRates.ccl?.buy ?? 0,
        cryptoUsdtArs: fxRates.cripto.sell ?? fxRates.cripto.buy ?? 0,
        updatedAtISO: fxRates.updatedAtISO,
    }
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

function buildItemFromMetrics(
    metrics: AssetRowMetrics,
    accountId: string
): ItemV2 {
    return {
        id: `${accountId}-${metrics.instrumentId || metrics.symbol}`,
        kind: mapCategoryToKind(metrics.category),
        symbol: metrics.symbol,
        label: metrics.name || metrics.symbol,
        qty: metrics.quantity,
        valArs: metrics.valArs ?? 0,
        valUsd: metrics.valUsdEq ?? 0,
        pnlArs: metrics.pnlArs ?? undefined,
        pnlUsd: metrics.pnlUsdEq ?? undefined,
        pnlPct: metrics.pnlPct ?? undefined,
        accountId,
        instrumentId: metrics.instrumentId,
    }
}

function buildProviderFromGroup(
    accountId: string,
    accountName: string,
    metrics: AssetRowMetrics[],
    settingsMap: Map<string, AccountSettings>
): ProviderV2 {
    // Filter out zero-balance items
    const filteredMetrics = metrics.filter(m => hasSignificantValue(m.valArs ?? 0, m.quantity))
    const items: ItemV2[] = filteredMetrics.map(m => buildItemFromMetrics(m, accountId))
    const displayName = getDisplayName(accountId, accountName, settingsMap)

    // Calculate totals from filtered items
    const totals = {
        valArs: filteredMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
        valUsd: filteredMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
        pnlArs: filteredMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
        pnlUsd: filteredMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
    }

    return {
        id: accountId,
        name: displayName,
        totals: { ars: totals.valArs, usd: totals.valUsd },
        pnl: { ars: totals.pnlArs, usd: totals.pnlUsd },
        items,
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
    accountSettings: AccountSettings[] = []
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
                const filteredCashItems = cashItems.filter(m => hasSignificantValue(m.valArs ?? 0, m.quantity))
                if (filteredCashItems.length === 0) continue

                const itemsTotals = {
                    valArs: filteredCashItems.reduce((s, m) => s + (m.valArs ?? 0), 0),
                    valUsd: filteredCashItems.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                    pnlArs: filteredCashItems.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                    pnlUsd: filteredCashItems.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                }

                // Convert to wallet_yield items
                const yieldItems: ItemV2[] = filteredCashItems.map(m => ({
                    ...buildItemFromMetrics(m, accountId),
                    kind: 'wallet_yield' as ItemKind,
                    yieldMeta: account?.cashYield ? {
                        tna: account.cashYield.tna,
                        tea: computeTEA(account.cashYield.tna),
                        lastAccruedISO: account.cashYield.lastAccruedDate,
                    } : undefined,
                }))

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
                    }
                })

                providers.push({
                    id: `pf-${bank}`,
                    name: bank,
                    totals: { ars: bankTotal, usd: bankTotal / oficialSell },
                    pnl: { ars: 0, usd: 0 }, // PF doesn't have PnL in this sense
                    items,
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
                // BILLETERAS: Only WALLET/BANK kinds (not exchange/broker)
                // ==========================================================
                if (config.id === 'wallets') {
                    const rubroOverride = settingsMap.get(accountId)?.rubroOverride
                    // Skip if not a wallet-type account
                    if (!isWalletForBilleteras(account, rubroOverride)) continue

                    // Only include cash categories
                    const matchingMetrics = group.metrics.filter(m =>
                        config.categories.includes(m.category)
                    )
                    if (matchingMetrics.length === 0) continue

                    const itemsTotals = {
                        valArs: matchingMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                        valUsd: matchingMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                        pnlArs: matchingMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                        pnlUsd: matchingMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                    }

                    const provider = buildProviderFromGroup(
                        accountId,
                        group.accountName,
                        matchingMetrics,
                        settingsMap
                    )

                    providers.push(provider)
                    rubroTotals.ars += itemsTotals.valArs
                    rubroTotals.usd += itemsTotals.valUsd
                    rubroPnl.ars += itemsTotals.pnlArs
                    rubroPnl.usd += itemsTotals.pnlUsd
                    continue
                }

                // ==========================================================
                // CRIPTO: Exchange accounts get ALL their items here  
                // ==========================================================
                if (config.id === 'crypto') {
                    // For exchange accounts: include EVERYTHING (crypto + cash)
                    if (isExchange(account)) {
                        // All items from exchange go to Cripto
                        const allMetrics = group.metrics
                        if (allMetrics.length === 0) continue

                        const itemsTotals = {
                            valArs: allMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                            valUsd: allMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                            pnlArs: allMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                            pnlUsd: allMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                        }

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            allMetrics,
                            settingsMap
                        )

                        providers.push(provider)
                        rubroTotals.ars += itemsTotals.valArs
                        rubroTotals.usd += itemsTotals.valUsd
                        rubroPnl.ars += itemsTotals.pnlArs
                        rubroPnl.usd += itemsTotals.pnlUsd
                    } else {
                        // For non-exchange accounts, only CRYPTO/STABLE categories
                        const matchingMetrics = group.metrics.filter(m =>
                            config.categories.includes(m.category)
                        )
                        if (matchingMetrics.length === 0) continue

                        const itemsTotals = {
                            valArs: matchingMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                            valUsd: matchingMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                            pnlArs: matchingMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                            pnlUsd: matchingMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                        }

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            matchingMetrics,
                            settingsMap
                        )

                        providers.push(provider)
                        rubroTotals.ars += itemsTotals.valArs
                        rubroTotals.usd += itemsTotals.valUsd
                        rubroPnl.ars += itemsTotals.pnlArs
                        rubroPnl.usd += itemsTotals.pnlUsd
                    }
                    continue
                }

                // ==========================================================
                // CEDEARS: Broker accounts get ALL their items here
                // ==========================================================
                if (config.id === 'cedears') {
                    // For broker accounts: include EVERYTHING (cedears + cash)
                    if (isBroker(account)) {
                        const allMetrics = group.metrics
                        if (allMetrics.length === 0) continue

                        const itemsTotals = {
                            valArs: allMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                            valUsd: allMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                            pnlArs: allMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                            pnlUsd: allMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                        }

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            allMetrics,
                            settingsMap
                        )

                        providers.push(provider)
                        rubroTotals.ars += itemsTotals.valArs
                        rubroTotals.usd += itemsTotals.valUsd
                        rubroPnl.ars += itemsTotals.pnlArs
                        rubroPnl.usd += itemsTotals.pnlUsd
                    } else {
                        // For non-broker accounts, only CEDEAR category
                        const matchingMetrics = group.metrics.filter(m =>
                            config.categories.includes(m.category)
                        )
                        if (matchingMetrics.length === 0) continue

                        const itemsTotals = {
                            valArs: matchingMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                            valUsd: matchingMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                            pnlArs: matchingMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                            pnlUsd: matchingMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                        }

                        const provider = buildProviderFromGroup(
                            accountId,
                            group.accountName,
                            matchingMetrics,
                            settingsMap
                        )

                        providers.push(provider)
                        rubroTotals.ars += itemsTotals.valArs
                        rubroTotals.usd += itemsTotals.valUsd
                        rubroPnl.ars += itemsTotals.pnlArs
                        rubroPnl.usd += itemsTotals.pnlUsd
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

                const itemsTotals = {
                    valArs: matchingMetrics.reduce((s, m) => s + (m.valArs ?? 0), 0),
                    valUsd: matchingMetrics.reduce((s, m) => s + (m.valUsdEq ?? 0), 0),
                    pnlArs: matchingMetrics.reduce((s, m) => s + (m.pnlArs ?? 0), 0),
                    pnlUsd: matchingMetrics.reduce((s, m) => s + (m.pnlUsdEq ?? 0), 0),
                }

                const provider = buildProviderFromGroup(
                    accountId,
                    group.accountName,
                    matchingMetrics,
                    settingsMap
                )

                providers.push(provider)
                rubroTotals.ars += itemsTotals.valArs
                rubroTotals.usd += itemsTotals.valUsd
                rubroPnl.ars += itemsTotals.pnlArs
                rubroPnl.usd += itemsTotals.pnlUsd
            }
        }

        // Only add rubro if it has providers
        if (providers.length > 0) {
            rubros.push({
                id: config.id,
                name: config.name,
                icon: config.icon,
                fxPolicy: config.fxPolicy,
                totals: rubroTotals,
                pnl: rubroPnl,
                providers,
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
    let pnlUnrealizedArs = 0

    // Exposure buckets
    let usdHard = 0     // Crypto USD + Billete USD
    let arsReal = 0     // ARS efectivo

    for (const rubro of rubros) {
        totalArs += rubro.totals.ars
        pnlUnrealizedArs += rubro.pnl.ars

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

    const mepRate = fxSnapshot.mep || fxSnapshot.officialSell || 1
    const totalUsdEq = totalArs / mepRate
    const pnlUnrealizedUsdEq = pnlUnrealizedArs / mepRate

    // ARS converted to USD equivalent
    const usdEquivalent = arsReal / mepRate

    const totalPortfolioUsd = usdHard + usdEquivalent

    // Percentages
    const pctUsdHard = totalPortfolioUsd > 0 ? (usdHard / totalPortfolioUsd) * 100 : 0
    const pctUsdEq = totalPortfolioUsd > 0 ? (usdEquivalent / totalPortfolioUsd) * 100 : 0
    const pctArs = 100 - pctUsdHard - pctUsdEq

    return {
        totalArs,
        totalUsdEq,
        pnlUnrealizedArs,
        pnlUnrealizedUsdEq,
        exposure: { usdHard, usdEquivalent, arsReal },
        pctUsdHard,
        pctUsdEq,
        pctArs,
    }
}

function computeTEA(tna: number): number {
    // TEA = (1 + TNA/365)^365 - 1
    return Math.pow(1 + tna / 100 / 365, 365) - 1
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
}

export function buildPortfolioV2(input: BuildPortfolioV2Input): PortfolioV2 {
    const { groupedRows, accounts, fxRates, movements, pfData, accountSettings = [] } = input

    const fxSnapshot = buildFxSnapshot(fxRates)
    const rubros = buildRubros(groupedRows, accounts, pfData, fxSnapshot, accountSettings)
    const kpis = buildKPIs(rubros, accounts, fxSnapshot)

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
            tea: computeTEA(acc.cashYield.tna) * 100,
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
        cedearDetails: new Map(),
        cryptoDetails: new Map(),
    }
}
