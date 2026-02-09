import type { FxRatesSnapshot, RubroV2 } from '@/features/portfolioV2'

export interface CurrencyExposureSummary {
    softArs: number
    hardUsd: number
    tcRef: number
    pctSoft: number
    pctHard: number
}

function toFinite(value: number): number {
    return Number.isFinite(value) ? value : 0
}

export function computeCurrencyExposureSummary(
    rubros: RubroV2[],
    fx: FxRatesSnapshot
): CurrencyExposureSummary {
    let softArs = 0
    let hardUsd = 0

    for (const rubro of rubros) {
        switch (rubro.id) {
            case 'wallets':
            case 'frascos':
                for (const provider of rubro.providers) {
                    for (const item of provider.items) {
                        if (item.kind === 'cash_usd') {
                            hardUsd += toFinite(item.valUsd)
                        } else {
                            softArs += toFinite(item.valArs)
                        }
                    }
                }
                break
            case 'cedears':
            case 'crypto':
                hardUsd += toFinite(rubro.totals.usd)
                break
            case 'plazos':
            case 'fci':
                softArs += toFinite(rubro.totals.ars)
                break
            default:
                softArs += toFinite(rubro.totals.ars)
                break
        }
    }

    const tcRefRaw = fx.mepSell || fx.officialSell || 0
    const tcRef = tcRefRaw > 0 ? tcRefRaw : 0
    const softUsdEq = tcRef > 0 ? softArs / tcRef : 0
    const totalEq = softUsdEq + hardUsd

    const pctSoft = totalEq > 0 ? (softUsdEq / totalEq) * 100 : 0
    const pctHard = totalEq > 0 ? (hardUsd / totalEq) * 100 : 0

    return {
        softArs,
        hardUsd,
        tcRef,
        pctSoft,
        pctHard,
    }
}
