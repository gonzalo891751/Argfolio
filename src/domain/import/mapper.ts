import type { MovementType, Currency } from '@/domain/types'

export interface ColumnMapping {
    datetime?: number
    date?: number
    time?: number
    type?: number
    symbol?: number
    account?: number
    quantity?: number
    unitPrice?: number
    tradeCurrency?: number
    totalAmount?: number
    feeAmount?: number
    feeCurrency?: number
    fxAtTrade?: number
    notes?: number
}

export interface MappedRow {
    datetimeISO: string
    type: MovementType
    symbol: string
    account: string
    quantity?: number
    unitPrice?: number
    tradeCurrency: Currency
    totalAmount: number
    feeAmount?: number
    feeCurrency?: Currency
    fxAtTrade?: number
    notes?: string
    rawRow: string[]
    rowIndex: number
}

const TYPE_MAPPINGS: Record<string, MovementType> = {
    buy: 'BUY',
    compra: 'BUY',
    purchase: 'BUY',
    sell: 'SELL',
    venta: 'SELL',
    sale: 'SELL',
    deposit: 'DEPOSIT',
    depósito: 'DEPOSIT',
    deposito: 'DEPOSIT',
    withdraw: 'WITHDRAW',
    retiro: 'WITHDRAW',
    withdrawal: 'WITHDRAW',
    fee: 'FEE',
    comisión: 'FEE',
    comision: 'FEE',
    dividend: 'DIVIDEND',
    dividendo: 'DIVIDEND',
    interest: 'INTEREST',
    interés: 'INTEREST',
    interes: 'INTEREST',
    transfer_in: 'TRANSFER_IN',
    transferencia_entrada: 'TRANSFER_IN',
    transfer_out: 'TRANSFER_OUT',
    transferencia_salida: 'TRANSFER_OUT',
}

const CURRENCY_MAPPINGS: Record<string, Currency> = {
    usd: 'USD',
    'u$s': 'USD',
    'us$': 'USD',
    dolar: 'USD',
    dólar: 'USD',
    dollars: 'USD',
    ars: 'ARS',
    '$': 'ARS',
    'ars$': 'ARS',
    peso: 'ARS',
    pesos: 'ARS',
    usdt: 'USDT',
    tether: 'USDT',
    usdc: 'USDC',
}

/**
 * Parse number with Argentine locale support (1.234,56 or 1,234.56)
 */
export function parseNumber(value: string): number | undefined {
    if (!value || value.trim() === '' || value === '-') {
        return undefined
    }

    let normalized = value.trim()

    // Remove currency symbols and spaces
    normalized = normalized.replace(/[$€£¥]/g, '').trim()

    // Detect format: if has comma after period, it's Argentine format
    const lastComma = normalized.lastIndexOf(',')
    const lastPeriod = normalized.lastIndexOf('.')

    if (lastComma > lastPeriod) {
        // Argentine format: 1.234,56
        normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else if (lastPeriod > lastComma) {
        // US format: 1,234.56
        normalized = normalized.replace(/,/g, '')
    } else if (lastComma > -1 && lastPeriod === -1) {
        // Only comma, likely Argentine decimal: 1234,56
        normalized = normalized.replace(',', '.')
    }

    const num = parseFloat(normalized)
    return isNaN(num) ? undefined : num
}

/**
 * Parse date from various formats
 */
export function parseDate(value: string, timeValue?: string): string {
    if (!value || value.trim() === '') {
        return new Date().toISOString()
    }

    const cleaned = value.trim()

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const date = new Date(cleaned)
        if (!isNaN(date.getTime())) {
            return date.toISOString()
        }
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (dmyMatch) {
        const [, day, month, year] = dmyMatch
        let timeStr = '12:00:00'
        if (timeValue && /\d{1,2}:\d{2}/.test(timeValue)) {
            timeStr = timeValue.trim()
        }
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr}`
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
            return date.toISOString()
        }
    }

    // MM/DD/YYYY
    const mdyMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (mdyMatch) {
        const [, first, second, year] = mdyMatch
        // Assume DD/MM if first > 12
        const isDay = parseInt(first) > 12
        const day = isDay ? first : second
        const month = isDay ? second : first
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
            return date.toISOString()
        }
    }

    // Fallback: try native parsing
    const fallback = new Date(cleaned)
    if (!isNaN(fallback.getTime())) {
        return fallback.toISOString()
    }

    return new Date().toISOString()
}

/**
 * Normalize symbol to uppercase, trimmed
 */
export function normalizeSymbol(value: string): string {
    return value.trim().toUpperCase()
}

/**
 * Normalize type string to MovementType
 */
export function normalizeType(value: string): MovementType | undefined {
    const key = value.trim().toLowerCase().replace(/\s+/g, '_')
    return TYPE_MAPPINGS[key]
}

/**
 * Normalize currency string to Currency
 */
export function normalizeCurrency(value: string): Currency {
    const key = value.trim().toLowerCase()
    return CURRENCY_MAPPINGS[key] ?? 'USD'
}

export interface ImportDefaults {
    type?: MovementType
    currency?: Currency
}

/**
 * Map a raw CSV/Excel row to a structured MappedRow
 */
export function mapRow(
    row: string[],
    rowIndex: number,
    mapping: ColumnMapping,
    defaults?: ImportDefaults
): MappedRow {
    const get = (idx?: number) => (idx !== undefined ? row[idx]?.trim() ?? '' : '')

    const dateValue = get(mapping.datetime) || get(mapping.date)
    const timeValue = get(mapping.time)
    const typeValue = get(mapping.type)
    const symbolValue = get(mapping.symbol)
    const accountValue = get(mapping.account)
    const quantityValue = get(mapping.quantity)
    const priceValue = get(mapping.unitPrice)
    const currencyValue = get(mapping.tradeCurrency)
    const totalValue = get(mapping.totalAmount)
    const feeValue = get(mapping.feeAmount)
    const feeCurrencyValue = get(mapping.feeCurrency)
    const fxValue = get(mapping.fxAtTrade)
    const notesValue = get(mapping.notes)

    const quantity = parseNumber(quantityValue)
    const unitPrice = parseNumber(priceValue)
    const feeAmount = parseNumber(feeValue)
    const fxAtTrade = parseNumber(fxValue)

    let totalAmount = parseNumber(totalValue)
    if (!totalAmount && quantity && unitPrice) {
        totalAmount = quantity * unitPrice
    }

    // Resolve Type: Mapped > Default > Default Fallback (BUY)
    let type = normalizeType(typeValue)
    if (!type && defaults?.type) {
        type = defaults.type
    }
    if (!type) {
        type = 'BUY'
    }

    // Resolve Currency: Mapped > Default > Default Fallback (USD)
    let tradeCurrency = normalizeCurrency(currencyValue)
    // normalizeCurrency returns 'USD' if invalid/empty, but we check if mapping existed
    // If no mapping provided for currency, use default
    if (mapping.tradeCurrency === undefined && defaults?.currency) {
        tradeCurrency = defaults.currency
    }

    return {
        datetimeISO: parseDate(dateValue, timeValue),
        type,
        symbol: normalizeSymbol(symbolValue),
        account: accountValue.trim(),
        quantity,
        unitPrice,
        tradeCurrency,
        totalAmount: totalAmount ?? 0,
        feeAmount,
        feeCurrency: feeCurrencyValue ? normalizeCurrency(feeCurrencyValue) : undefined,
        fxAtTrade,
        notes: notesValue || undefined,
        rawRow: row,
        rowIndex,
    }
}

/**
 * Auto-detect column mapping from headers
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {}
    const lowerHeaders = headers.map((h) => h.toLowerCase().trim())

    const findIndex = (patterns: string[]): number | undefined => {
        for (const pattern of patterns) {
            const idx = lowerHeaders.findIndex((h) => h.includes(pattern))
            if (idx !== -1) return idx
        }
        return undefined
    }

    mapping.datetime = findIndex(['datetime', 'fecha y hora', 'timestamp'])
    mapping.date = findIndex(['date', 'fecha'])
    mapping.time = findIndex(['time', 'hora'])
    mapping.type = findIndex(['type', 'tipo', 'operación', 'operacion'])
    mapping.symbol = findIndex(['symbol', 'símbolo', 'simbolo', 'ticker', 'activo', 'asset'])
    mapping.account = findIndex(['account', 'cuenta', 'platform', 'plataforma', 'broker'])
    mapping.quantity = findIndex(['quantity', 'cantidad', 'qty', 'amount', 'units'])
    mapping.unitPrice = findIndex(['price', 'precio', 'unit price', 'precio unitario'])
    mapping.tradeCurrency = findIndex(['currency', 'moneda', 'ccy'])
    mapping.totalAmount = findIndex(['total', 'monto', 'amount', 'importe'])
    mapping.feeAmount = findIndex(['fee', 'comisión', 'comision', 'commission'])
    mapping.feeCurrency = findIndex(['fee currency', 'moneda comisión'])
    mapping.fxAtTrade = findIndex(['fx', 'tipo de cambio', 'exchange rate', 'tc'])
    mapping.notes = findIndex(['notes', 'notas', 'comments', 'comentarios'])

    return mapping
}
