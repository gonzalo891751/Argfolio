// =============================================================================
// Personal Finances Date Helpers
// =============================================================================

/**
 * Clamp a day to a valid range for the given month.
 * E.g., day 31 in February becomes 28 (or 29 in leap year).
 */
export function clampDay(year: number, month: number, day: number): number {
    // Month is 0-indexed for Date constructor
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    return Math.min(day, lastDayOfMonth)
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
 * Calculate the postedYearMonth (payment month) for a card consumption.
 * 
 * Algorithm:
 * 1. If day(purchase) <= closingDay → closingMonth = purchase month
 *    Else → closingMonth = purchase month + 1
 * 2. If dueDay <= closingDay → dueMonth = closingMonth + 1
 *    Else → dueMonth = closingMonth
 * 3. postedYearMonth = YYYY-MM of dueMonth
 */
export function calculatePostedYearMonth(
    purchaseDateISO: string,
    closingDay: number,
    dueDay: number
): string {
    const purchaseDate = new Date(purchaseDateISO)
    const purchaseDay = purchaseDate.getDate()
    const purchaseYear = purchaseDate.getFullYear()
    const purchaseMonth = purchaseDate.getMonth() // 0-indexed

    // Step 1: Determine closing month
    let closingYear = purchaseYear
    let closingMonth = purchaseMonth

    if (purchaseDay > closingDay) {
        // Purchase after closing → goes to next month's statement
        closingMonth += 1
        if (closingMonth > 11) {
            closingMonth = 0
            closingYear += 1
        }
    }

    // Step 2: Determine due month
    let dueYear = closingYear
    let dueMonth = closingMonth

    if (dueDay <= closingDay) {
        // Due day is before or same as closing → due is next month
        dueMonth += 1
        if (dueMonth > 11) {
            dueMonth = 0
            dueYear += 1
        }
    }
    // Else: due is same month as closing

    // Step 3: Format as YYYY-MM
    return `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}`
}

/**
 * Get closing and due dates for display, given a target yearMonth.
 * 
 * @param yearMonth The payment month (YYYY-MM)
 * @param closingDay The card's closing day
 * @param dueDay The card's due day
 * @returns Object with closingDate and dueDate as ISO strings
 */
export function getStatementDates(
    yearMonth: string,
    closingDay: number,
    dueDay: number
): { closingDate: string; dueDate: string } {
    const [year, month] = yearMonth.split('-').map(Number)

    // Due date is in the payment month
    const dueDateDay = clampDay(year, month - 1, dueDay)
    const dueDate = new Date(year, month - 1, dueDateDay)

    // Closing date is typically the month before (or same month if dueDay > closingDay)
    let closingYear = year
    let closingMonth = month - 1 // 0-indexed

    if (dueDay <= closingDay) {
        // Closing was in the previous month
        closingMonth -= 1
        if (closingMonth < 0) {
            closingMonth = 11
            closingYear -= 1
        }
    }

    const closingDateDay = clampDay(closingYear, closingMonth, closingDay)
    const closingDate = new Date(closingYear, closingMonth, closingDateDay)

    return {
        closingDate: closingDate.toISOString().split('T')[0],
        dueDate: dueDate.toISOString().split('T')[0],
    }
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
 * Format a date as "dd/mm" for display.
 */
export function formatDayMonth(dateISO: string): string {
    const date = new Date(dateISO)
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

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
