import type { DataProvider } from './types'
import type { TimeRange } from '@/types/portfolio'
import {
    mockFxRates,
    mockPortfolio,
    mockTickers,
    mockTimeseries,
    mockDebts,
} from '@/data/mock/portfolio'

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Random failure for testing error states (disabled by default)
const FAILURE_RATE = 0 // Set to 0.1 for 10% failure rate

function maybeThrow() {
    if (Math.random() < FAILURE_RATE) {
        throw new Error('Error de conexión simulado')
    }
}

export const mockProvider: DataProvider = {
    async getFxRates() {
        await delay(300 + Math.random() * 200)
        maybeThrow()

        // Phase 3: normalized flat numbers
        return {
            oficial: {
                buy: mockFxRates.oficial.buy,
                sell: mockFxRates.oficial.sell,
                mid: null
            },
            blue: {
                buy: mockFxRates.blue.buy,
                sell: mockFxRates.blue.sell,
                mid: null
            },
            mep: {
                buy: mockFxRates.mep.buy,
                sell: mockFxRates.mep.sell + (Math.random() - 0.5) * 2,
                mid: null
            },
            ccl: {
                buy: mockFxRates.ccl.buy,
                sell: mockFxRates.ccl.sell,
                mid: null
            },
            cripto: {
                buy: 1200,
                sell: 1220,
                mid: 1210
            },
            updatedAtISO: new Date().toISOString(),
            source: 'mock'
        }
    },

    async getPortfolioSnapshot() {
        await delay(500 + Math.random() * 300)
        maybeThrow()

        return {
            ...mockPortfolio,
            lastUpdated: new Date(),
        }
    },

    async getMarketTape() {
        await delay(200 + Math.random() * 100)
        maybeThrow()

        // Add slight price variations
        return mockTickers.map(ticker => ({
            ...ticker,
            price: ticker.price * (1 + (Math.random() - 0.5) * 0.002),
            change: ticker.change * (1 + (Math.random() - 0.5) * 0.1),
        }))
    },

    async getTimeseries(range: TimeRange) {
        await delay(400 + Math.random() * 200)
        maybeThrow()

        return mockTimeseries[range]
    },

    async getDebtSummary() {
        await delay(300 + Math.random() * 150)
        maybeThrow()

        return mockDebts
    },
}
