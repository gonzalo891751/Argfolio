import type {
    FxRates,
    PortfolioSnapshot,
    TickerItem,
    TimeseriesPoint,
    TimeRange,
    DebtSummary,
    Holding,
} from '@/types/portfolio'

// ===== FX RATES =====
export const mockFxRates: FxRates = {
    oficial: {
        type: 'oficial',
        name: 'Oficial',
        buy: 1005.0,
        sell: 1045.0,
        timestamp: new Date(),
    },
    blue: {
        type: 'blue',
        name: 'Blue',
        buy: 1185.0,
        sell: 1215.0,
        timestamp: new Date(),
    },
    mep: {
        type: 'mep',
        name: 'MEP',
        buy: 1168.0,
        sell: 1172.0,
        spread: 0.34,
        timestamp: new Date(),
    },
    ccl: {
        type: 'ccl',
        name: 'CCL',
        buy: 1195.0,
        sell: 1205.0,
        spread: 0.84,
        timestamp: new Date(),
    },
    cripto: {
        type: 'cripto',
        name: 'Cripto',
        buy: 1180.0,
        sell: 1190.0,
        timestamp: new Date(),
    },
    lastUpdated: new Date(),
}

// ===== HOLDINGS =====
const mockCedears: Holding[] = [
    {
        id: 'ced-1',
        category: 'cedear',
        symbol: 'MELI',
        name: 'MercadoLibre',
        amount: 5,
        nativeCurrency: 'ARS',
        platform: 'IOL',
        avgCost: 85000,
        currentPrice: 98500,
        valueArs: 492500,
        valueUsd: 420.81,
        changeToday: 12500,
        changeTodayPercent: 2.6,
        pnl: 67500,
        pnlPercent: 15.88,
    },
    {
        id: 'ced-2',
        category: 'cedear',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        amount: 20,
        nativeCurrency: 'ARS',
        platform: 'IOL',
        avgCost: 8500,
        currentPrice: 9200,
        valueArs: 184000,
        valueUsd: 157.25,
        changeToday: -2000,
        changeTodayPercent: -1.08,
        pnl: 14000,
        pnlPercent: 8.24,
    },
    {
        id: 'ced-3',
        category: 'cedear',
        symbol: 'GOOGL',
        name: 'Alphabet',
        amount: 15,
        nativeCurrency: 'ARS',
        platform: 'Balanz',
        avgCost: 4200,
        currentPrice: 4650,
        valueArs: 69750,
        valueUsd: 59.6,
        changeToday: 1500,
        changeTodayPercent: 2.2,
        pnl: 6750,
        pnlPercent: 10.71,
    },
]

const mockCrypto: Holding[] = [
    {
        id: 'cry-1',
        category: 'crypto',
        symbol: 'BTC',
        name: 'Bitcoin',
        amount: 0.025,
        nativeCurrency: 'USD',
        platform: 'Binance',
        avgCost: 42000,
        currentPrice: 97500,
        valueArs: 2852625,
        valueUsd: 2437.5,
        changeToday: 48750,
        changeTodayPercent: 1.74,
        pnl: 1387.5,
        pnlPercent: 132.14,
    },
    {
        id: 'cry-2',
        category: 'crypto',
        symbol: 'ETH',
        name: 'Ethereum',
        amount: 0.5,
        nativeCurrency: 'USD',
        platform: 'Binance',
        avgCost: 2800,
        currentPrice: 3450,
        valueArs: 2018475,
        valueUsd: 1725,
        changeToday: -20250,
        changeTodayPercent: -0.99,
        pnl: 325,
        pnlPercent: 23.21,
    },
]

const mockStablecoins: Holding[] = [
    {
        id: 'stb-1',
        category: 'stablecoin',
        symbol: 'USDT',
        name: 'Tether',
        amount: 2500,
        nativeCurrency: 'USDT',
        platform: 'Nexo',
        valueArs: 2975000,
        valueUsd: 2500,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
    {
        id: 'stb-2',
        category: 'stablecoin',
        symbol: 'USDT',
        name: 'Tether',
        amount: 1200,
        nativeCurrency: 'USDT',
        platform: 'Binance',
        valueArs: 1428000,
        valueUsd: 1200,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
    {
        id: 'stb-3',
        category: 'stablecoin',
        symbol: 'USDC',
        name: 'USD Coin',
        amount: 800,
        nativeCurrency: 'USDC',
        platform: 'Lemon',
        valueArs: 952000,
        valueUsd: 800,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
]

const mockFci: Holding[] = [
    {
        id: 'fci-1',
        category: 'fci',
        symbol: 'CONIOLA',
        name: 'Consultatio Ahorro',
        amount: 1500000,
        nativeCurrency: 'ARS',
        platform: 'Consultatio',
        valueArs: 1500000,
        valueUsd: 1281.74,
        changeToday: 2500,
        changeTodayPercent: 0.17,
        pnl: 45000,
        pnlPercent: 3.09,
    },
    {
        id: 'fci-2',
        category: 'fci',
        symbol: 'PRMCAPB',
        name: 'Premier Capital',
        amount: 850000,
        nativeCurrency: 'ARS',
        platform: 'Balanz',
        valueArs: 850000,
        valueUsd: 726.32,
        changeToday: 1200,
        changeTodayPercent: 0.14,
        pnl: 28000,
        pnlPercent: 3.41,
    },
]

const mockPlazosFijos: Holding[] = [
    {
        id: 'pf-1',
        category: 'plazo_fijo',
        symbol: 'PF-BBVA',
        name: 'Plazo Fijo BBVA',
        amount: 500000,
        nativeCurrency: 'ARS',
        platform: 'BBVA',
        valueArs: 500000,
        valueUsd: 427.25,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 15000,
        pnlPercent: 3.09,
    },
]

const mockWallets: Holding[] = [
    {
        id: 'wal-1',
        category: 'wallet',
        symbol: 'MP',
        name: 'MercadoPago',
        amount: 125000,
        nativeCurrency: 'ARS',
        platform: 'MercadoPago',
        valueArs: 125000,
        valueUsd: 106.81,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
    {
        id: 'wal-2',
        category: 'wallet',
        symbol: 'NX',
        name: 'NaranjaX',
        amount: 45000,
        nativeCurrency: 'ARS',
        platform: 'NaranjaX',
        valueArs: 45000,
        valueUsd: 38.45,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
    {
        id: 'wal-3',
        category: 'wallet',
        symbol: 'USD',
        name: 'Dólares Banco',
        amount: 500,
        nativeCurrency: 'USD',
        platform: 'BBVA',
        valueArs: 586000,
        valueUsd: 500,
        changeToday: 0,
        changeTodayPercent: 0,
        pnl: 0,
        pnlPercent: 0,
    },
]

// ===== PORTFOLIO SNAPSHOT =====
export const mockPortfolio: PortfolioSnapshot = {
    totalArs: 14078350,
    totalUsd: 12029.73,
    changeToday: 44200,
    changeTodayPercent: 0.31,
    liquidityArs: 756000,
    liquidityUsd: 646.07,
    pnlToday: 44200,
    pnlTotal: 1889250,
    categories: [
        {
            category: 'cedear',
            label: 'Cedears',
            totalArs: 746250,
            totalUsd: 637.66,
            changeToday: 12000,
            changeTodayPercent: 1.63,
            items: mockCedears,
        },
        {
            category: 'crypto',
            label: 'Criptomonedas',
            totalArs: 4871100,
            totalUsd: 4162.5,
            changeToday: 28500,
            changeTodayPercent: 0.59,
            items: mockCrypto,
        },
        {
            category: 'stablecoin',
            label: 'Stablecoins',
            totalArs: 5355000,
            totalUsd: 4500,
            changeToday: 0,
            changeTodayPercent: 0,
            items: mockStablecoins,
        },
        {
            category: 'fci',
            label: 'Fondos de Inversión',
            totalArs: 2350000,
            totalUsd: 2008.06,
            changeToday: 3700,
            changeTodayPercent: 0.16,
            items: mockFci,
        },
        {
            category: 'plazo_fijo',
            label: 'Plazos Fijos',
            totalArs: 500000,
            totalUsd: 427.25,
            changeToday: 0,
            changeTodayPercent: 0,
            items: mockPlazosFijos,
        },
        {
            category: 'wallet',
            label: 'Billeteras y Cuentas',
            totalArs: 756000,
            totalUsd: 645.26,
            changeToday: 0,
            changeTodayPercent: 0,
            items: mockWallets,
        },
    ],
    lastUpdated: new Date(),
}

// ===== DEBTS =====
export const mockDebts: DebtSummary = {
    totalArs: 850000,
    totalUsd: 726.32,
    nextDue: {
        id: 'debt-1',
        description: 'Cuota préstamo personal',
        creditor: 'BBVA',
        amount: 125000,
        currency: 'ARS',
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        isPaid: false,
    },
    items: [
        {
            id: 'debt-1',
            description: 'Cuota préstamo personal',
            creditor: 'BBVA',
            amount: 125000,
            currency: 'ARS',
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
            isPaid: false,
        },
        {
            id: 'debt-2',
            description: 'Tarjeta de crédito',
            creditor: 'Visa BBVA',
            amount: 325000,
            currency: 'ARS',
            dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
            isPaid: false,
        },
        {
            id: 'debt-3',
            description: 'Préstamo familiar',
            creditor: 'Personal',
            amount: 400,
            currency: 'USD',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isPaid: false,
        },
    ],
}

// ===== TICKER TAPE =====
export const mockTickers: TickerItem[] = [
    { symbol: 'MELI', name: 'MercadoLibre', price: 98500, currency: 'ARS', change: 2500, changePercent: 2.6, category: 'cedear' },
    { symbol: 'AAPL', name: 'Apple', price: 9200, currency: 'ARS', change: -100, changePercent: -1.08, category: 'cedear' },
    { symbol: 'GOOGL', name: 'Alphabet', price: 4650, currency: 'ARS', change: 100, changePercent: 2.2, category: 'cedear' },
    { symbol: 'MSFT', name: 'Microsoft', price: 12500, currency: 'ARS', change: 150, changePercent: 1.21, category: 'cedear' },
    { symbol: 'AMZN', name: 'Amazon', price: 5800, currency: 'ARS', change: -50, changePercent: -0.85, category: 'cedear' },
    { symbol: 'BTC', name: 'Bitcoin', price: 97500, currency: 'USD', change: 1700, changePercent: 1.74, category: 'crypto' },
    { symbol: 'ETH', name: 'Ethereum', price: 3450, currency: 'USD', change: -35, changePercent: -0.99, category: 'crypto' },
    { symbol: 'SOL', name: 'Solana', price: 198, currency: 'USD', change: 8.5, changePercent: 4.48, category: 'crypto' },
    { symbol: 'ADA', name: 'Cardano', price: 1.05, currency: 'USD', change: 0.03, changePercent: 2.94, category: 'crypto' },
]

// ===== TIMESERIES =====
function generateTimeseries(range: TimeRange): TimeseriesPoint[] {
    const points: TimeseriesPoint[] = []
    const now = new Date()
    let intervals: number
    let intervalMs: number

    switch (range) {
        case 'day':
            intervals = 24
            intervalMs = 60 * 60 * 1000 // 1 hour
            break
        case 'month':
            intervals = 30
            intervalMs = 24 * 60 * 60 * 1000 // 1 day
            break
        case 'year':
            intervals = 12
            intervalMs = 30 * 24 * 60 * 60 * 1000 // ~1 month
            break
    }

    const baseValueArs = 12000000
    const baseValueUsd = 10000

    for (let i = intervals; i >= 0; i--) {
        const date = new Date(now.getTime() - i * intervalMs)
        const variation = 1 + (Math.random() - 0.45) * 0.1 // ±5% with slight upward bias
        const accumulatedGrowth = 1 + (intervals - i) * 0.005 // Slight upward trend

        points.push({
            date,
            valueArs: Math.round(baseValueArs * variation * accumulatedGrowth),
            valueUsd: Math.round(baseValueUsd * variation * accumulatedGrowth * 100) / 100,
        })
    }

    // Ensure last point matches current portfolio value
    points[points.length - 1] = {
        date: now,
        valueArs: mockPortfolio.totalArs,
        valueUsd: mockPortfolio.totalUsd,
    }

    return points
}

export const mockTimeseries: Record<TimeRange, TimeseriesPoint[]> = {
    day: generateTimeseries('day'),
    month: generateTimeseries('month'),
    year: generateTimeseries('year'),
}
