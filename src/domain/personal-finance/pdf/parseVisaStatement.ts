import { extractTextFromPdf } from '@/lib/pdf/extractTextFromPdf'

export type ParsedStatement = {
    meta: {
        issuer?: 'VISA' | 'MASTERCARD' | 'AMEX' | 'UNKNOWN'
        last4?: string
        periodClose?: string
        dueDate?: string
        totalPurchases?: number
        currentBalance?: number
        minimumPayment?: number
        currency: 'ARS' | 'USD'
    }
    purchases: Array<{
        date: string
        description: string
        voucher?: string
        amount: number
        currency: 'ARS' | 'USD'
        installments?: { current: number; total: number } | null
        confidence: 'high' | 'medium' | 'low'
        raw: string
    }>
    otherMovements: Array<{
        type: 'PAYMENT' | 'FEE' | 'TAX' | 'OTHER'
        description: string
        date?: string
        amount: number
        currency: 'ARS' | 'USD'
        confidence: 'high' | 'medium' | 'low'
        raw: string
    }>
    validation: {
        purchasesSum: number
        matchesTotalPurchases?: boolean
        computedBalance: number
        matchesCurrentBalance?: boolean
        diffPurchases?: number
        diffBalance?: number
        warnings: string[]
    }
}

const MONTHS: Record<string, number> = {
    ene: 1,
    feb: 2,
    mar: 3,
    abr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dic: 12,
}

function parseAmount(value: string): number {
    const normalized = value.replace(/\./g, '').replace(',', '.')
    return Number(normalized)
}

function parseDate(dateStr: string): string | undefined {
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2})/)
    if (!match) return undefined
    const day = Number(match[1])
    const month = Number(match[2])
    const year = 2000 + Number(match[3])
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function parseShortDate(text: string): string | undefined {
    const match = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})/i)
    if (!match) return undefined
    const day = Number(match[1])
    const monthKey = match[2].toLowerCase().slice(0, 3)
    const month = MONTHS[monthKey]
    if (!month) return undefined
    const year = 2000 + Number(match[3])
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

function detectIssuer(line: string): 'VISA' | 'MASTERCARD' | 'AMEX' | 'UNKNOWN' | undefined {
    const upper = line.toUpperCase()
    if (upper.includes('VISA')) return 'VISA'
    if (upper.includes('MASTERCARD')) return 'MASTERCARD'
    if (upper.includes('AMEX')) return 'AMEX'
    return undefined
}

function normalizeDescription(value: string): string {
    return value.replace(/\s+/g, ' ').trim()
}

export async function parseVisaStatement(file: File): Promise<ParsedStatement> {
    const lines = await extractTextFromPdf(file)
    const upperLines = lines.map(line => line.toUpperCase())

    let issuer: ParsedStatement['meta']['issuer'] = 'UNKNOWN'
    let last4: string | undefined
    let periodClose: string | undefined
    let dueDate: string | undefined
    let totalPurchases: number | undefined
    let currentBalance: number | undefined
    let minimumPayment: number | undefined

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const upper = upperLines[i]

        const issuerCandidate = detectIssuer(upper)
        if (issuerCandidate) issuer = issuerCandidate

        if (!last4 && upper.includes('TARJ') && /(\d{4})/.test(upper)) {
            const match = upper.match(/(\d{4})/)
            if (match) last4 = match[1]
        }

        if (!periodClose && upper.includes('CIERRE')) {
            periodClose = parseShortDate(line) ?? periodClose
        }

        if (!dueDate && upper.includes('VENC')) {
            dueDate = parseShortDate(line) ?? dueDate
        }

        if (totalPurchases === undefined && upper.includes('TOTAL') && upper.includes('CONSUM')) {
            const amountMatch = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/)
            if (amountMatch) totalPurchases = parseAmount(amountMatch[1])
        }

        if (currentBalance === undefined && upper.includes('SALDO') && upper.includes('ACTUAL')) {
            const amountMatch = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/)
            if (amountMatch) currentBalance = parseAmount(amountMatch[1])
        }

        if (minimumPayment === undefined && upper.includes('PAGO') && upper.includes('MIN')) {
            const amountMatch = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/)
            if (amountMatch) minimumPayment = parseAmount(amountMatch[1])
        }
    }

    const headerIndex = upperLines.findIndex(
        line => line.includes('FECHA') && line.includes('DETALLE')
    )

    const purchases: ParsedStatement['purchases'] = []
    const otherMovements: ParsedStatement['otherMovements'] = []

    if (headerIndex >= 0) {
        for (let i = headerIndex + 1; i < lines.length; i += 1) {
            const rawLine = lines[i]
            const upper = upperLines[i]
            if (upper.includes('TOTAL') && upper.includes('CONSUM')) break
            if (!/(\d{2})\.(\d{2})\.(\d{2})/.test(rawLine)) continue

            const dateISO = parseDate(rawLine)
            if (!dateISO) continue

            const amounts = rawLine.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)
            if (!amounts || amounts.length === 0) continue
            const amount = parseAmount(amounts[amounts.length - 1])

            let lineWithoutAmount = rawLine.replace(amounts[amounts.length - 1], '').trim()
            const dateMatch = lineWithoutAmount.match(/(\d{2})\.(\d{2})\.(\d{2})/)
            lineWithoutAmount = lineWithoutAmount.replace(dateMatch?.[0] ?? '', '').trim()

            const tokens = lineWithoutAmount.split(/\s+/)
            let voucher: string | undefined
            if (tokens.length > 1 && /^[0-9A-Za-z-]{4,}$/.test(tokens[0])) {
                voucher = tokens.shift()
            }

            const description = normalizeDescription(tokens.join(' '))
            const installmentMatch = description.match(/\b(\d{1,2})\/(\d{1,2})\b/)
            const installments = installmentMatch
                ? { current: Number(installmentMatch[1]), total: Number(installmentMatch[2]) }
                : null

            const confidence: 'high' | 'medium' | 'low' =
                description.length > 4 ? 'high' : description.length > 0 ? 'medium' : 'low'

            if (upper.includes('SU PAGO')) {
                otherMovements.push({
                    type: 'PAYMENT',
                    description: description || rawLine,
                    date: dateISO,
                    amount: -Math.abs(amount),
                    currency: 'ARS',
                    confidence,
                    raw: rawLine,
                })
                continue
            }

            if (upper.includes('COMISION ADMINISTRACION')) {
                otherMovements.push({
                    type: 'FEE',
                    description: description || rawLine,
                    date: dateISO,
                    amount: Math.abs(amount),
                    currency: 'ARS',
                    confidence,
                    raw: rawLine,
                })
                continue
            }

            if (upper.includes('IVA') && upper.includes('COM ADM')) {
                otherMovements.push({
                    type: 'TAX',
                    description: description || rawLine,
                    date: dateISO,
                    amount: Math.abs(amount),
                    currency: 'ARS',
                    confidence,
                    raw: rawLine,
                })
                continue
            }

            purchases.push({
                date: dateISO,
                description: description || rawLine,
                voucher,
                amount: Math.abs(amount),
                currency: 'ARS',
                installments,
                confidence,
                raw: rawLine,
            })
        }
    }

    const purchasesSum = purchases.reduce((sum, item) => sum + item.amount, 0)
    const otherSum = otherMovements.reduce((sum, item) => sum + item.amount, 0)
    const computedBalance = purchasesSum + otherSum
    const diffPurchases = totalPurchases !== undefined ? Math.abs(purchasesSum - totalPurchases) : undefined
    const diffBalance = currentBalance !== undefined ? Math.abs(computedBalance - currentBalance) : undefined
    const matchesTotalPurchases = diffPurchases !== undefined ? diffPurchases <= 1 : undefined
    const matchesCurrentBalance = diffBalance !== undefined ? diffBalance <= 1 : undefined

    const warnings: string[] = []
    if (totalPurchases !== undefined && matchesTotalPurchases === false) {
        warnings.push('La suma de consumos no coincide con el total de consumos.')
    }
    if (currentBalance !== undefined && matchesCurrentBalance === false) {
        warnings.push('El saldo calculado no coincide con el saldo actual.')
    }
    if (headerIndex < 0) {
        warnings.push('No se detectó la tabla de consumos.')
    }

    return {
        meta: {
            issuer,
            last4,
            periodClose,
            dueDate,
            totalPurchases,
            currentBalance,
            minimumPayment,
            currency: 'ARS',
        },
        purchases,
        otherMovements,
        validation: {
            purchasesSum,
            matchesTotalPurchases,
            computedBalance,
            matchesCurrentBalance,
            diffPurchases,
            diffBalance,
            warnings,
        },
    }
}
