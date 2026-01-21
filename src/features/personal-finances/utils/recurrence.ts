
import type { PFCardConsumption, PFCreditCard } from '@/db/schema'
import {
    getStatementForTransaction,
    parseDateISO,
    makeDateISO,
    addMonthsToYearMonth,
    parseYearMonth,
    clampDayToMonth as clampDay
} from './dateHelpers'

/**
 * Clamps a day to the valid range of a target month (wrapper for dateHelpers)
 */
export function clampDayToMonth(day: number, year: number, month: number): number {
    return clampDay(year, month, day)
}

/**
 * Generates recurrence instances for a specific target closing month.
 */
export function expandRecurringConsumptions(
    recurringConsumptions: PFCardConsumption[],
    cards: PFCreditCard[],
    targetClosingYearMonth: string
): PFCardConsumption[] {
    const expanded: PFCardConsumption[] = []
    const cardMap = new Map(cards.map(c => [c.id, c]))

    // We check occurrences in: Target Month, and Target Month - 1.
    const prevMonthYM = addMonthsToYearMonth(targetClosingYearMonth, -1)
    const candidateMonths = [prevMonthYM, targetClosingYearMonth]

    for (const consumption of recurringConsumptions) {
        if (!consumption.isRecurring || !consumption.recurring) continue

        const card = cardMap.get(consumption.cardId)
        if (!card) continue

        const { day: startDay } = parseDateISO(consumption.purchaseDateISO)
        const startDateString = consumption.purchaseDateISO

        for (const ym of candidateMonths) {
            const { year: cYear, month: cMonth } = parseYearMonth(ym)

            // Generate candidate date for this year-month, clamping if necessary (e.g. Feb 30 -> Feb 28)
            const candidateISO = makeDateISO(cYear, cMonth, startDay)

            // Check 1: Must be >= startDate
            if (candidateISO < startDateString) continue

            // Check 2: Must be <= until (if exists)
            if (consumption.recurring.until && candidateISO > consumption.recurring.until) continue

            // Check 3: Must NOT be the start date (duplicate of real record)
            if (candidateISO === startDateString) continue

            // Check 4: Does it belong to the target closing month?
            const stmt = getStatementForTransaction(card.closingDay, card.dueDay, candidateISO)

            if (stmt.closingYearMonth === targetClosingYearMonth) {
                const instanceId = `${consumption.id}::${candidateISO}`

                // Dedupe in this list
                if (!expanded.some(e => e.id === instanceId)) {
                    expanded.push({
                        ...consumption,
                        id: instanceId,
                        purchaseDateISO: candidateISO,
                        closingYearMonth: stmt.closingYearMonth,
                        postedYearMonth: stmt.dueYearMonth,
                    })
                }
            }
        }
    }

    return expanded
}
