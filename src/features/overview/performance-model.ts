/**
 * Performance model — "¿cuánto me rindió cada cosa?".
 *
 * For every investment: what you put in, what it is worth today and the
 * result, in the currency that matters for it (dollars for CEDEARs and crypto,
 * pesos for FCIs and accounts that pay interest).
 *
 * CEDEARs are bought in pesos but follow the dollar. Their peso result splits
 * in two parts that always add up:
 *  - por la acción: what the stock did in dollars, at today's MEP
 *      = (valor hoy US$ − costo US$) × MEP hoy
 *  - por el dólar: what the MEP did to the dollars you bought
 *      = costo US$ × (MEP hoy − MEP de compra)
 * where costo US$ is each purchase valued at the MEP of its own day.
 *
 * Pure: built from the Overview (positions) and PortfolioV2 (detail maps).
 */

import type { PortfolioV2 } from '@/features/portfolioV2/types'
import type { Overview, OverviewPosition } from './overview-model'

export type PerformanceGroupId = 'cedears' | 'cripto' | 'fci' | 'intereses'

export const PERFORMANCE_GROUP_LABELS: Record<PerformanceGroupId, string> = {
    cedears: 'CEDEARs',
    cripto: 'Cripto',
    fci: 'Fondos (FCI)',
    intereses: 'Cuentas que pagan interés y plazos fijos',
}

export interface CedearBreakdown {
    /** Average MEP of your purchases (weighted by pesos paid) */
    fxBuy: number
    /** MEP used to value it today */
    fxNow: number
    fromAssetArs: number
    fromFxArs: number
    /** MEP change since purchase (0.25 = +25%) */
    fxChangePct: number
}

export interface PerformanceRow {
    id: string
    group: PerformanceGroupId
    label: string
    sublabel: string
    href?: string
    qty?: number
    /** Currency the result is judged in */
    currency: 'ARS' | 'USD'
    investedArs: number
    investedUsd: number
    valueArs: number
    valueUsd: number
    resultArs: number
    resultUsd: number
    /** Result over invested, in `currency` */
    resultPct: number | null
    /** First purchase still held */
    sinceISO?: string
    cedear?: CedearBreakdown
    /** Interest-bearing accounts and plazos fijos */
    tna?: number
    interest30dArs?: number
}

export interface PerformanceTotals {
    investedArs: number
    investedUsd: number
    valueArs: number
    valueUsd: number
    resultArs: number
    resultUsd: number
}

export interface PerformanceGroup {
    id: PerformanceGroupId
    label: string
    currency: 'ARS' | 'USD'
    rows: PerformanceRow[]
    totals: PerformanceTotals
    /** CEDEARs only: sum of the two effects */
    cedear?: { fromAssetArs: number; fromFxArs: number }
}

export interface Performance {
    groups: PerformanceGroup[]
    /** Investments only (cash without cost is left out) */
    totals: PerformanceTotals
    /** Positions without a market price, not included */
    missingPriceCount: number
}

const GROUP_ORDER: PerformanceGroupId[] = ['cedears', 'cripto', 'fci', 'intereses']
const GROUP_CURRENCY: Record<PerformanceGroupId, 'ARS' | 'USD'> = {
    cedears: 'USD',
    cripto: 'USD',
    fci: 'ARS',
    intereses: 'ARS',
}

function finite(value: number | undefined | null): value is number {
    return value != null && Number.isFinite(value)
}

function pct(result: number, invested: number): number | null {
    return invested > 0 ? result / invested : null
}

function earliest(dates: Array<string | undefined>): string | undefined {
    return dates.filter((d): d is string => Boolean(d)).sort()[0]
}

function emptyTotals(): PerformanceTotals {
    return { investedArs: 0, investedUsd: 0, valueArs: 0, valueUsd: 0, resultArs: 0, resultUsd: 0 }
}

function addTotals(into: PerformanceTotals, row: PerformanceRow): void {
    into.investedArs += row.investedArs
    into.investedUsd += row.investedUsd
    into.valueArs += row.valueArs
    into.valueUsd += row.valueUsd
    into.resultArs += row.resultArs
    into.resultUsd += row.resultUsd
}

function baseRow(p: OverviewPosition, group: PerformanceGroupId): Pick<PerformanceRow, 'id' | 'group' | 'label' | 'sublabel' | 'href' | 'qty' | 'currency' | 'valueArs' | 'valueUsd'> {
    return {
        id: p.id,
        group,
        label: p.label,
        sublabel: p.sublabel,
        href: p.href,
        qty: p.qty,
        currency: GROUP_CURRENCY[group],
        valueArs: p.valueArs,
        valueUsd: p.valueUsd,
    }
}

function cedearRow(p: OverviewPosition, portfolio: PortfolioV2): PerformanceRow | null {
    const d = portfolio.cedearDetails.get(p.itemId)
    if (!d || !(d.totalCostArs > 0)) return null
    const valueArs = p.valueArs
    const valueUsd = p.valueUsd
    const fxNow = valueUsd > 0 ? valueArs / valueUsd : 0
    const fxKnown = d.lots.length > 0 && d.lots.every(l => !l.fxMissing) && d.totalCostUsd > 0
    const investedUsd = fxKnown ? d.totalCostUsd : 0
    const resultArs = valueArs - d.totalCostArs
    const resultUsd = fxKnown ? valueUsd - investedUsd : 0

    const row: PerformanceRow = {
        ...baseRow(p, 'cedears'),
        currency: fxKnown ? 'USD' : 'ARS',
        investedArs: d.totalCostArs,
        investedUsd,
        resultArs,
        resultUsd,
        resultPct: fxKnown ? pct(resultUsd, investedUsd) : pct(resultArs, d.totalCostArs),
        sinceISO: earliest(d.lots.map(l => l.dateISO)),
    }
    if (fxKnown && fxNow > 0) {
        const fxBuy = d.totalCostArs / investedUsd
        const fromAssetArs = resultUsd * fxNow
        row.cedear = {
            fxBuy,
            fxNow,
            fromAssetArs,
            // Defined as the remainder so both parts always add up exactly
            fromFxArs: resultArs - fromAssetArs,
            fxChangePct: fxNow / fxBuy - 1,
        }
    }
    return row
}

function cryptoRow(p: OverviewPosition, portfolio: PortfolioV2): PerformanceRow | null {
    const d = portfolio.cryptoDetails.get(p.itemId)
    if (!d || !(d.totalCostUsd > 0)) return null
    const resultUsd = p.valueUsd - d.totalCostUsd
    const resultArs = finite(p.resultArs) ? p.resultArs : resultUsd * (p.valueUsd > 0 ? p.valueArs / p.valueUsd : 0)
    return {
        ...baseRow(p, 'cripto'),
        investedArs: p.valueArs - resultArs,
        investedUsd: d.totalCostUsd,
        resultArs,
        resultUsd,
        resultPct: pct(resultUsd, d.totalCostUsd),
        sinceISO: earliest(d.lots.map(l => l.dateISO)),
    }
}

function fciRow(p: OverviewPosition, portfolio: PortfolioV2): PerformanceRow | null {
    const d = portfolio.fciDetails.get(p.itemId)
    if (!d || !(d.totalCostArs > 0)) return null
    const resultArs = p.valueArs - d.totalCostArs
    const investedUsd = d.totalCostUsd > 0 ? d.totalCostUsd : 0
    return {
        ...baseRow(p, 'fci'),
        currency: p.groupId === 'fci_usd' ? 'USD' : 'ARS',
        investedArs: d.totalCostArs,
        investedUsd,
        resultArs,
        resultUsd: investedUsd > 0 ? p.valueUsd - investedUsd : 0,
        resultPct: pct(resultArs, d.totalCostArs),
        sinceISO: earliest(d.lots.map(l => l.dateISO)),
    }
}

function interestRow(p: OverviewPosition): PerformanceRow | null {
    const earned = p.interestEarnedArs ?? 0
    if (!p.tna && !p.pf && !(earned > 0)) return null
    const investedArs = p.pf ? p.pf.capitalArs : p.valueArs - earned
    const fx = p.valueUsd > 0 ? p.valueArs / p.valueUsd : 0
    return {
        ...baseRow(p, 'intereses'),
        investedArs,
        investedUsd: fx > 0 ? investedArs / fx : 0,
        resultArs: earned,
        resultUsd: fx > 0 ? earned / fx : 0,
        resultPct: pct(earned, investedArs),
        tna: p.tna,
        interest30dArs: p.interest30dArs,
    }
}

export function buildPerformance(overview: Overview, portfolio: PortfolioV2 | null): Performance {
    const groups = new Map<PerformanceGroupId, PerformanceRow[]>()
    let missingPriceCount = 0

    if (portfolio) {
        const positions = [...overview.pesos.groups, ...overview.dolares.groups].flatMap(g => g.positions)
        for (const p of positions) {
            if (p.valueMissing) {
                if (p.kind === 'cedear' || p.kind === 'crypto' || p.kind === 'fci') missingPriceCount++
                continue
            }
            let row: PerformanceRow | null = null
            if (p.kind === 'cedear') row = cedearRow(p, portfolio)
            else if (p.kind === 'crypto') row = cryptoRow(p, portfolio)
            else if (p.kind === 'fci') row = fciRow(p, portfolio)
            else if (p.groupId === 'billeteras' || p.groupId === 'frascos' || p.groupId === 'plazos') row = interestRow(p)
            if (!row) continue
            const list = groups.get(row.group) ?? []
            list.push(row)
            groups.set(row.group, list)
        }
    }

    const totals = emptyTotals()
    const out: PerformanceGroup[] = []
    for (const id of GROUP_ORDER) {
        const rows = groups.get(id)
        if (!rows?.length) continue
        rows.sort((a, b) => b.valueArs - a.valueArs)
        const groupTotals = emptyTotals()
        rows.forEach(r => addTotals(groupTotals, r))
        rows.forEach(r => addTotals(totals, r))
        const group: PerformanceGroup = { id, label: PERFORMANCE_GROUP_LABELS[id], currency: GROUP_CURRENCY[id], rows, totals: groupTotals }
        if (id === 'cedears') {
            group.cedear = rows.reduce(
                (acc, r) => ({
                    fromAssetArs: acc.fromAssetArs + (r.cedear?.fromAssetArs ?? 0),
                    fromFxArs: acc.fromFxArs + (r.cedear?.fromFxArs ?? 0),
                }),
                { fromAssetArs: 0, fromFxArs: 0 },
            )
        }
        out.push(group)
    }

    return { groups: out, totals, missingPriceCount }
}
