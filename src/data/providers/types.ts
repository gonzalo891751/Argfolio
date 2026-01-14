import type {
    PortfolioSnapshot,
    TickerItem,
    TimeseriesPoint,
    TimeRange,
    DebtSummary,
} from '@/types/portfolio'
import type { FxRates } from '@/domain/types'

export interface DataProvider {
    getFxRates(): Promise<FxRates>
    getPortfolioSnapshot(): Promise<PortfolioSnapshot>
    getMarketTape(): Promise<TickerItem[]>
    getTimeseries(range: TimeRange): Promise<TimeseriesPoint[]>
    getDebtSummary(): Promise<DebtSummary>
}
