import { db } from './schema'
import type { Instrument, Account } from '@/domain/types'

const SEED_KEY = 'argfolio-seeded'

export const demoInstruments: Instrument[] = [
    // Crypto
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'btc' },
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', category: 'CRYPTO', nativeCurrency: 'USD', priceKey: 'eth' },
    // Stablecoins
    { id: 'usdt', symbol: 'USDT', name: 'Tether', category: 'STABLE', nativeCurrency: 'USDT', priceKey: 'usdt' },
    { id: 'usdc', symbol: 'USDC', name: 'USD Coin', category: 'STABLE', nativeCurrency: 'USDC', priceKey: 'usdc' },
    // Cedears
    { id: 'aapl', symbol: 'AAPL', name: 'Apple Inc.', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'aapl', cedearRatio: 10 },
    { id: 'googl', symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'googl', cedearRatio: 29 },
    { id: 'meli', symbol: 'MELI', name: 'MercadoLibre', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'meli', cedearRatio: 60 },
    { id: 'tsla', symbol: 'TSLA', name: 'Tesla Inc.', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'tsla', cedearRatio: 15 },
    { id: 'msft', symbol: 'MSFT', name: 'Microsoft', category: 'CEDEAR', nativeCurrency: 'USD', priceKey: 'msft', cedearRatio: 10 },
    // Cash instruments (virtual)
    { id: 'ars-cash', symbol: 'ARS', name: 'Pesos Argentinos', category: 'ARS_CASH', nativeCurrency: 'ARS', priceKey: 'ars' },
    { id: 'usd-cash', symbol: 'USD', name: 'Dólares', category: 'USD_CASH', nativeCurrency: 'USD', priceKey: 'usd' },
    // Virtual Asset for PF
    { id: 'pf-instrument', symbol: 'PF', name: 'Plazo Fijo', category: 'PF', nativeCurrency: 'ARS', priceKey: 'ars' },
]

export const demoAccounts: Account[] = [
    { id: 'nexo', name: 'Nexo', kind: 'EXCHANGE', defaultCurrency: 'USD' },
    { id: 'binance', name: 'Binance', kind: 'EXCHANGE', defaultCurrency: 'USDT' },
    { id: 'ripio', name: 'Ripio', kind: 'EXCHANGE', defaultCurrency: 'ARS' },
    { id: 'belo', name: 'Belo', kind: 'WALLET', defaultCurrency: 'USD' },
    { id: 'brubank', name: 'Brubank', kind: 'BANK', defaultCurrency: 'ARS' },
    { id: 'mp', name: 'Mercado Pago', kind: 'WALLET', defaultCurrency: 'ARS' },
    { id: 'iol', name: 'InvertirOnline', kind: 'BROKER', defaultCurrency: 'ARS' },
    { id: 'ppi', name: 'PPI', kind: 'BROKER', defaultCurrency: 'ARS' },
    { id: 'efectivo', name: 'Efectivo', kind: 'OTHER', defaultCurrency: 'ARS' },
]

export async function seedDatabase(): Promise<void> {
    // Check if already seeded
    if (localStorage.getItem(SEED_KEY)) {
        const hasData = await db.accounts.count()
        if (hasData > 0) return
    }

    console.log('[Argfolio] Seeding database with demo data...')

    await db.transaction('rw', [db.instruments, db.accounts], async () => {
        await db.instruments.bulkPut(demoInstruments)
        await db.accounts.bulkPut(demoAccounts)
    })

    localStorage.setItem(SEED_KEY, 'true')
    console.log('[Argfolio] Database seeded successfully')
}

export async function resetDatabase(): Promise<void> {
    console.log('[Argfolio] Resetting database...')

    await db.transaction('rw', [db.movements, db.instruments, db.accounts, db.snapshots, db.debts], async () => {
        await db.movements.clear()
        await db.instruments.clear()
        await db.accounts.clear()
        await db.snapshots.clear()
        await db.debts.clear()
    })

    localStorage.removeItem(SEED_KEY)

    // Re-seed
    await seedDatabase()

    console.log('[Argfolio] Database reset complete')
}
