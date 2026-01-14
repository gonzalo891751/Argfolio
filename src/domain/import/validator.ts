import type { MappedRow } from './mapper'
import type { Instrument, Account } from '@/domain/types'

export interface ValidationResult {
    validRows: MappedRow[]
    invalidRows: Array<{
        row: MappedRow
        errors: string[]
    }>
    unknownSymbols: Set<string>
    unknownAccounts: Set<string>
    oversellWarnings: Array<{
        row: MappedRow
        available: number
        requested: number
    }>
    summary: {
        total: number
        valid: number
        invalid: number
        warnings: number
    }
}

/**
 * Validate mapped rows against known instruments and accounts
 */
export function validateRows(
    rows: MappedRow[],
    instruments: Map<string, Instrument>,
    accounts: Map<string, Account>,
    currentHoldings?: Map<string, number>
): ValidationResult {
    const validRows: MappedRow[] = []
    const invalidRows: Array<{ row: MappedRow; errors: string[] }> = []
    const unknownSymbols = new Set<string>()
    const unknownAccounts = new Set<string>()
    const oversellWarnings: Array<{ row: MappedRow; available: number; requested: number }> = []

    // Track running holdings for oversell detection
    const runningHoldings = new Map<string, number>(currentHoldings ?? [])

    for (const row of rows) {
        const errors: string[] = []

        // Validate required fields
        if (!row.symbol) {
            errors.push('Símbolo requerido')
        }

        if (!row.account) {
            errors.push('Cuenta requerida')
        }

        if (!row.type) {
            errors.push('Tipo de operación requerido')
        }

        // Check for unknown symbol (by symbol, not ID)
        const instrumentBySymbol = Array.from(instruments.values()).find(
            (i) => i.symbol.toUpperCase() === row.symbol.toUpperCase()
        )
        if (row.symbol && !instrumentBySymbol) {
            unknownSymbols.add(row.symbol)
        }

        // Check for unknown account
        const accountByName = Array.from(accounts.values()).find(
            (a) => a.name.toLowerCase() === row.account.toLowerCase()
        )
        if (row.account && !accountByName) {
            unknownAccounts.add(row.account)
        }

        // Validate trade movements have quantity and price
        if (['BUY', 'SELL'].includes(row.type)) {
            if (!row.quantity || row.quantity <= 0) {
                errors.push('Cantidad debe ser mayor a 0')
            }
            if (!row.unitPrice || row.unitPrice < 0) {
                errors.push('Precio unitario inválido')
            }
        }

        // Check for oversell
        if (row.type === 'SELL' && row.quantity) {
            const key = row.symbol
            const available = runningHoldings.get(key) ?? 0
            if (row.quantity > available) {
                oversellWarnings.push({
                    row,
                    available,
                    requested: row.quantity,
                })
            }
            runningHoldings.set(key, available - row.quantity)
        }

        // Update holdings for BUY
        if (row.type === 'BUY' && row.quantity) {
            const key = row.symbol
            const current = runningHoldings.get(key) ?? 0
            runningHoldings.set(key, current + row.quantity)
        }

        if (errors.length > 0) {
            invalidRows.push({ row, errors })
        } else {
            validRows.push(row)
        }
    }

    return {
        validRows,
        invalidRows,
        unknownSymbols,
        unknownAccounts,
        oversellWarnings,
        summary: {
            total: rows.length,
            valid: validRows.length,
            invalid: invalidRows.length,
            warnings: oversellWarnings.length,
        },
    }
}

/**
 * Get suggested instrument I D from symbol
 */
export function suggestInstrumentId(symbol: string): string {
    return symbol.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Get suggested account ID from name
 */
export function suggestAccountId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Suggest category and currency based on symbol
 */
export function suggestInstrumentDetails(symbol: string): { category: 'CRYPTO' | 'CEDEAR'; currency: 'USD' | 'ARS' } {
    const s = symbol.toUpperCase()
    if (['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'SOL', 'DOT'].includes(s)) {
        return { category: 'CRYPTO', currency: 'USD' }
    }
    return { category: 'CEDEAR', currency: 'ARS' }
}
