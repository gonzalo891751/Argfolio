// =============================================================================
// Personal Finances Date Helpers
// =============================================================================
// IMPORTANTE: Todas las fechas se manejan como strings "YYYY-MM-DD" o "YYYY-MM"
// para evitar problemas de timezone.

/**
 * Clamp a day to a valid range for the given month.
 * E.g., day 31 in February becomes 28 (or 29 in leap year).
 * @param year Full year (e.g., 2026)
 * @param month 1-indexed month (1-12)
 * @param day Day to clamp (1-31)
 */
export function clampDayToMonth(year: number, month: number, day: number): number {
    // Get last day of the month
    // new Date(year, month, 0) gives last day of previous month, so we use month directly
    const lastDay = new Date(year, month, 0).getDate()
    return Math.min(day, lastDay)
}

/**
 * Add months to a YYYY-MM string, returning a new YYYY-MM string.
 */
export function addMonthsToYearMonth(yearMonth: string, months: number): string {
    const [year, month] = yearMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + months, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Get the current year-month as YYYY-MM.
 */
export function getCurrentYearMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Parse YYYY-MM into { year, month } (1-indexed month).
 */
export function parseYearMonth(yearMonth: string): { year: number; month: number } {
    const [year, month] = yearMonth.split('-').map(Number)
    return { year, month }
}

/**
 * Parse YYYY-MM-DD into { year, month, day } (1-indexed month).
 */
export function parseDateISO(dateISO: string): { year: number; month: number; day: number } {
    const [year, month, day] = dateISO.split('-').map(Number)
    return { year, month, day }
}

/**
 * Format a YYYY-MM-DD or Date as "dd/mm" for display.
 */
export function formatDayMonth(dateISO: string): string {
    const { month, day } = parseDateISO(dateISO)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}

/**
 * Format a YYYY-MM-DD as "dd/mm/yyyy" for display.
 */
export function formatFullDate(dateISO: string): string {
    const { year, month, day } = parseDateISO(dateISO)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Create a date ISO string (YYYY-MM-DD) from components.
 */
export function makeDateISO(year: number, month: number, day: number): string {
    const clampedDay = clampDayToMonth(year, month, day)
    return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Get yearMonth (YYYY-MM) from a date ISO string.
 */
export function getYearMonthFromDate(dateISO: string): string {
    return dateISO.substring(0, 7)
}

// =============================================================================
// CREDIT CARD STATEMENT LOGIC
// =============================================================================

export interface StatementPeriod {
    closeDate: string       // YYYY-MM-DD - fecha de cierre del resumen
    dueDate: string         // YYYY-MM-DD - fecha de vencimiento del pago
    periodStart: string     // YYYY-MM-DD - inicio del período de consumos
    periodEnd: string       // YYYY-MM-DD - fin del período (= closeDate)
    closingYearMonth: string  // YYYY-MM - mes donde cae el cierre
    dueYearMonth: string      // YYYY-MM - mes donde cae el vencimiento
}

/**
 * Compute the close date for a statement that CLOSES in a given month.
 * @param closeDay The card's closing day pattern (1-31)
 * @param year Target year
 * @param month Target month (1-indexed)
 * @returns YYYY-MM-DD of the close date
 */
export function computeCloseDateForMonth(
    closeDay: number,
    year: number,
    month: number
): string {
    const clampedDay = clampDayToMonth(year, month, closeDay)
    return makeDateISO(year, month, clampedDay)
}

/**
 * Compute the due date from a close date.
 * The due date is in the month following the close date, on the dueDay.
 * @param closeDate YYYY-MM-DD
 * @param dueDay The card's due day pattern (1-31)
 * @returns YYYY-MM-DD of the due date
 */
export function computeDueDateFromClose(closeDate: string, dueDay: number): string {
    const { year, month } = parseDateISO(closeDate)

    // Due is always in the month after the close
    let dueYear = year
    let dueMonth = month + 1
    if (dueMonth > 12) {
        dueMonth = 1
        dueYear += 1
    }

    const clampedDueDay = clampDayToMonth(dueYear, dueMonth, dueDay)
    return makeDateISO(dueYear, dueMonth, clampedDueDay)
}

/**
 * Compute the start of a billing period given the close date.
 * Period start is the day AFTER the previous month's close.
 * @param closeDate YYYY-MM-DD - the close date of the current statement
 * @param closeDay The card's closing day pattern
 * @returns YYYY-MM-DD of the period start
 */
export function computePeriodStart(closeDate: string, closeDay: number): string {
    const { year, month } = parseDateISO(closeDate)

    // Previous month
    let prevYear = year
    let prevMonth = month - 1
    if (prevMonth < 1) {
        prevMonth = 12
        prevYear -= 1
    }

    // Previous close date
    const prevCloseDay = clampDayToMonth(prevYear, prevMonth, closeDay)

    // Period starts the day AFTER previous close
    let startYear = prevYear
    let startMonth = prevMonth
    let startDay = prevCloseDay + 1

    // Handle month overflow
    const lastDayPrevMonth = new Date(prevYear, prevMonth, 0).getDate()
    if (startDay > lastDayPrevMonth) {
        startDay = 1
        startMonth += 1
        if (startMonth > 12) {
            startMonth = 1
            startYear += 1
        }
    }

    return makeDateISO(startYear, startMonth, startDay)
}

/**
 * Get the full statement period for a statement that CLOSES in a given month.
 * @param closeDay Card's closing day
 * @param dueDay Card's due day
 * @param year Year of the close
 * @param month Month of the close (1-indexed)
 */
export function getStatementForClosingMonth(
    closeDay: number,
    dueDay: number,
    year: number,
    month: number
): StatementPeriod {
    const closeDate = computeCloseDateForMonth(closeDay, year, month)
    const dueDate = computeDueDateFromClose(closeDate, dueDay)
    const periodStart = computePeriodStart(closeDate, closeDay)

    return {
        closeDate,
        dueDate,
        periodStart,
        periodEnd: closeDate,
        closingYearMonth: `${year}-${String(month).padStart(2, '0')}`,
        dueYearMonth: getYearMonthFromDate(dueDate),
    }
}

/**
 * Get the statement that a transaction belongs to.
 * Rule: If txnDate <= closeDate of the month → belongs to that statement
 *       If txnDate > closeDate → belongs to next month's statement
 * @param closeDay Card's closing day
 * @param dueDay Card's due day
 * @param txnDateISO Transaction date (YYYY-MM-DD)
 */
export function getStatementForTransaction(
    closeDay: number,
    dueDay: number,
    txnDateISO: string
): StatementPeriod {
    const { year, month, day } = parseDateISO(txnDateISO)
    const closeOfThisMonth = clampDayToMonth(year, month, closeDay)

    if (day <= closeOfThisMonth) {
        // Transaction is within this month's statement (closes this month)
        return getStatementForClosingMonth(closeDay, dueDay, year, month)
    } else {
        // Transaction is after close → goes to next month's statement
        let nextYear = year
        let nextMonth = month + 1
        if (nextMonth > 12) {
            nextMonth = 1
            nextYear += 1
        }
        return getStatementForClosingMonth(closeDay, dueDay, nextYear, nextMonth)
    }
}

/**
 * Get the statement that CLOSES in a specific yearMonth.
 */
export function getStatementClosingInMonth(
    closeDay: number,
    dueDay: number,
    yearMonth: string
): StatementPeriod {
    const { year, month } = parseYearMonth(yearMonth)
    return getStatementForClosingMonth(closeDay, dueDay, year, month)
}

/**
 * Get the statement that is DUE (vence) in a specific yearMonth.
 * This is the statement whose close was in the previous month.
 */
export function getStatementDueInMonth(
    closeDay: number,
    dueDay: number,
    yearMonth: string
): StatementPeriod {
    const { year, month } = parseYearMonth(yearMonth)

    // Due is this month, so close was the previous month
    let closeYear = year
    let closeMonth = month - 1
    if (closeMonth < 1) {
        closeMonth = 12
        closeYear -= 1
    }

    return getStatementForClosingMonth(closeDay, dueDay, closeYear, closeMonth)
}

// =============================================================================
// LEGACY FUNCTIONS (for backward compatibility during migration)
// =============================================================================

/**
 * @deprecated Use getStatementForTransaction instead
 * Calculate the postedYearMonth (due month) for a card consumption.
 */
export function calculatePostedYearMonth(
    purchaseDateISO: string,
    closingDay: number,
    dueDay: number
): string {
    const statement = getStatementForTransaction(closingDay, dueDay, purchaseDateISO)
    return statement.dueYearMonth
}

/**
 * @deprecated Use getStatementDueInMonth instead
 * Get closing and due dates for display, given a target yearMonth (payment month).
 */
export function getStatementDates(
    yearMonth: string,
    closingDay: number,
    dueDay: number
): { closingDate: string; dueDate: string } {
    const statement = getStatementDueInMonth(closingDay, dueDay, yearMonth)
    return {
        closingDate: statement.closeDate,
        dueDate: statement.dueDate,
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Compare two YYYY-MM strings.
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareYearMonth(a: string, b: string): number {
    if (a < b) return -1
    if (a > b) return 1
    return 0
}

/**
 * Check if a yearMonth is within a range [start, end].
 * If end is undefined, only checks >= start.
 */
export function isYearMonthInRange(
    target: string,
    start: string,
    end?: string
): boolean {
    if (target < start) return false
    if (end && target > end) return false
    return true
}

/**
 * Get today's date as YYYY-MM-DD.
 */
export function getTodayISO(): string {
    const now = new Date()
    return makeDateISO(now.getFullYear(), now.getMonth() + 1, now.getDate())
}
