
import type { FxRates } from '@/domain/types'

const SNAPSHOT_KEY = 'fx_daily_snapshot'

interface DailyFxSnapshot {
    date: string // YYYY-MM-DD
    rates: FxRates
}

function getTodayStr(): string {
    const now = new Date()
    // Argentina timezone is roughly UTC-3, but for daily change simplest is local date string
    // or toISOString().split('T')[0] if we assume user is in correct timezone.
    // Given app context, let's use simple YYYY-MM-DD.
    return now.toISOString().split('T')[0]
}

export function saveDailySnapshot(currentRates: FxRates) {
    if (!currentRates) return

    try {
        const stored = localStorage.getItem(SNAPSHOT_KEY)
        const today = getTodayStr()

        let snapshot: DailyFxSnapshot | null = null
        if (stored) {
            snapshot = JSON.parse(stored)
        }

        // If stored snapshot is from a previous day, keep it? No, we want "Yesterday's close" ideally.
        // BUT, if we run this today for the first time, we don't have yesterday's.
        // We only overwrite if date implies it's a NEW day.
        // Actually, to get "Daily Change", we need [Today Current] vs [Yesterday Close].
        // If we only store ONE snapshot, we should store "Last Known Closing" ??

        // Simpler approach:
        // We store { date: "2023-01-01", rates: ... }
        // When we open app today (2023-01-02):
        //   stored.date != today. 
        //   So stored rates = "Yesterday's rates" (effectively).
        //   We DO NOT overwrite it immediately?
        //   If we overwrite it, we lose the reference for comparison.
        //   We should overwrite it ONLY at end of day? Or start of NEXT day?

        // Strategy:
        // We always keep *one* snapshot intended to be "Previous Close".
        // But how do we distinguish "Previous Close" from "Just saved 5 mins ago"?
        // By Date.

        if (!snapshot) {
            // First run ever. Save current as snapshot. Change will be 0 until tomorrow.
            const newSnapshot: DailyFxSnapshot = {
                date: today,
                rates: currentRates
            }
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(newSnapshot))
            return
        }

        // If snapshot is from today, it means we already updated it today? 
        // No, if snapshot is from today, it means we don't have yesterday's data anymore?
        // Wait, if I open app at 10 AM, snapshot is yesterday. I compare current vs snapshot.
        // When do I update snapshot to be today's value?
        // Ideally at the END of the day. But we don't have a background job.

        // Compromise:
        // We treat the stored snapshot as "Reference".
        // If stored.date < today:
        //    It IS the previous day (or older). Good for comparison.
        //    We should NOT overwrite it yet, or we lose the reference for the whole day?
        //    Wait, if we never overwrite it, eventually it becomes 2 days old.
        //    Actually, if it's 2 days old, it's still "Previous Close" for calculation purposes (better than nothing).

        // Issue: When do we save TODAY's rates to be tomorrow's reference?
        // Maybe we need TWO slots: "Previous" and "Current".
        // Or simpler: We update the snapshot ONLY if stored.date < today, BUT
        // we need to return the *Comparison* value.

        // Let's rely on the invalidation:
        // We really want "Last Closing Price".
        // If we assume the user opens the app daily:
        //   On open:
        //   If snapshot.date < today:
        //      Ref = snapshot.rates
        //      // We want to save TODAY's rates for tomorrow.
        //      // But if we save now (current = open price), it might change during day.
        //      // We should update the "Today" slot.

        // Improved Schema:
        // Key: 'fx_snapshot_v2'
        // { 
        //   prev: { date: '...', rates: ... }, 
        //   curr: { date: '...', rates: ... }
        // }
        //
        // On Save(rates):
        //   if (curr.date < today) {
        //      // New day started. Move curr to prev.
        //      prev = curr
        //      curr = { date: today, rates }
        //   } else {
        //      // Same day. Update curr with latest prices (so it becomes accurate 'close' for tomorrow)
        //      curr = { date: today, rates }
        //   }
        //   Save.

    } catch (e) {
        console.error('Failed to save fx snapshot', e)
    }
}

// Key for V2
const STORAGE_KEY = 'fx_daily_state_v2'

interface FxState {
    prev: DailyFxSnapshot | null
    curr: DailyFxSnapshot | null
}

export function updateFxSnapshot(latestRates: FxRates) {
    try {
        const today = getTodayStr()
        const stored = localStorage.getItem(STORAGE_KEY)
        let state: FxState = { prev: null, curr: null }

        if (stored) {
            state = JSON.parse(stored)
        }

        // Initialize if empty
        if (!state.curr) {
            state.curr = { date: today, rates: latestRates }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
            return
        }

        // Check date rollover
        if (state.curr.date !== today) {
            // It's a new day (or later).
            // Move current to previous
            state.prev = state.curr
            // Start new current
            state.curr = { date: today, rates: latestRates }
        } else {
            // Still today. Update current with latest to keep it fresh for tomorrow
            state.curr.rates = latestRates
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    } catch (e) {
        console.error('Error updating FX snapshot', e)
    }
}

export function getFxDailyChangePct(currentRate: number, fxType: keyof FxRates): number | null {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) return null

        const state: FxState = JSON.parse(stored)
        // We compare against 'prev'.
        if (!state.prev || !state.prev.rates) return null

        const prevRate = state.prev.rates[fxType] as number
        if (typeof prevRate !== 'number' || prevRate === 0) return null

        return (currentRate / prevRate) - 1
    } catch {
        return null
    }
}
