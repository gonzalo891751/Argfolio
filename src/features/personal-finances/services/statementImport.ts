export type ParsedTransactionStatus = 'ok' | 'warn' | 'dup'

export interface ParsedTransaction {
    id: string
    purchaseDateISO: string
    description: string
    amount: number
    currency: 'ARS' | 'USD'
    status: ParsedTransactionStatus
    installmentTotal?: number
}

export interface ParsedStatement {
    issuer: string
    periodLabel: string
    totalARS: number
    totalUSD: number
    transactions: ParsedTransaction[]
}

export async function parsePdfStatement(file: File): Promise<ParsedStatement> {
    // TODO: Replace with real PDF parser integration.
    void file
    await new Promise(resolve => setTimeout(resolve, 600))

    return {
        issuer: 'Santander Rio',
        periodLabel: 'Ene 2026',
        totalARS: 102_212,
        totalUSD: 12.5,
        transactions: [
            {
                id: crypto.randomUUID(),
                purchaseDateISO: '2026-01-10',
                description: 'SUPERMERCADOS DIA',
                amount: 15200,
                currency: 'ARS',
                status: 'ok',
            },
            {
                id: crypto.randomUUID(),
                purchaseDateISO: '2026-01-11',
                description: 'PAYPAL *EBAY',
                amount: 4500,
                currency: 'ARS',
                status: 'warn',
            },
            {
                id: crypto.randomUUID(),
                purchaseDateISO: '2026-01-12',
                description: 'AXION ENERGY',
                amount: 22000,
                currency: 'ARS',
                status: 'ok',
            },
            {
                id: crypto.randomUUID(),
                purchaseDateISO: '2026-01-12',
                description: 'AXION ENERGY',
                amount: 22000,
                currency: 'ARS',
                status: 'dup',
            },
            {
                id: crypto.randomUUID(),
                purchaseDateISO: '2026-01-14',
                description: 'MERCADOPAGO',
                amount: 1200,
                currency: 'USD',
                status: 'ok',
            },
        ],
    }
}
