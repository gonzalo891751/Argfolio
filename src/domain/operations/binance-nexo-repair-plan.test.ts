import { describe, expect, it } from 'vitest'
import { buildBinanceNexoRepairPlan, detectBinanceNexoLegacyCandidates } from './binance-nexo-repair-plan'
import { buildRepairFixtureMovements, repairAccounts, repairInstruments, repairTargets } from './repair-test-fixtures'

describe('Binance → Nexo repair plan', () => {
    it('builds a pure dry-run with candidates, transfers, swaps, adjustments and exact projection', () => {
        const movements = buildRepairFixtureMovements()
        const plan = buildBinanceNexoRepairPlan({
            movements,
            accounts: repairAccounts,
            instruments: repairInstruments,
            targets: repairTargets,
            occurredAtISO: '2026-07-09T12:00:00.000Z',
        })

        expect(plan.mode).toBe('dry_run')
        expect(plan.candidatesToSupersede.map(movement => movement.id).sort()).toEqual([
            'legacy-btc-sell', 'legacy-nexo-buy', 'legacy-usdt-buy',
        ])

        const operationKinds = plan.proposedMovements.reduce<Record<string, number>>((counts, movement) => {
            const kind = movement.meta?.operationKind ?? 'unknown'
            counts[kind] = (counts[kind] ?? 0) + 1
            return counts
        }, {})
        expect(operationKinds.transfer).toBe(6)
        expect(operationKinds.swap).toBe(10)
        expect(operationKinds.balance_adjustment).toBe(2)

        const adjustmentNexo = plan.proposedMovements.find(movement =>
            movement.ticker === 'NEXO' && movement.meta?.operationKind === 'balance_adjustment'
        )
        const adjustmentUsdc = plan.proposedMovements.find(movement =>
            movement.ticker === 'USDC' && movement.meta?.operationKind === 'balance_adjustment'
        )
        expect(adjustmentNexo?.quantity).toBeCloseTo(0.11173359, 8)
        expect(adjustmentUsdc?.quantity).toBeCloseTo(1.031414, 8)
        expect(adjustmentNexo?.meta?.requiresManualReview).toBe(true)
        expect(adjustmentUsdc?.meta?.requiresManualReview).toBe(true)

        expect(plan.reconciliationBefore.some(row => row.status !== 'ok')).toBe(true)
        expect(plan.reconciliationAfter.every(row => row.status === 'ok')).toBe(true)
        expect(plan.afterProjected.rows.find(row => row.accountId === 'nexo' && row.symbol === 'BTC')?.quantity)
            .toBeCloseTo(0.0172965, 8)
        expect(movements.every(movement => movement.meta?.operationStatus !== 'superseded')).toBe(true)
    })

    it('warns and does not force transfers/swaps when Binance lacks source balances', () => {
        const plan = buildBinanceNexoRepairPlan({
            movements: buildRepairFixtureMovements().filter(movement => !movement.id.endsWith('original')),
            accounts: repairAccounts,
            instruments: repairInstruments,
            targets: repairTargets,
        })
        expect(plan.warnings.some(warning => warning.includes('Saldo insuficiente en Binance'))).toBe(true)
        expect(plan.proposedMovements.some(movement => movement.meta?.operationKind === 'swap')).toBe(false)
        expect(plan.confidence).toBe('low')
    })

    it('limits candidate detection by repair window and expands linked legacy legs', () => {
        const movements = buildRepairFixtureMovements()
        const btcCandidate = movements.find(movement => movement.id === 'legacy-btc-sell')!
        const linkedLeg = {
            ...btcCandidate,
            id: 'legacy-linked-leg',
            type: 'BUY' as const,
            ticker: 'DAI',
            quantity: 1,
            totalAmount: 1,
            totalUSD: 1,
            linkedMovementId: btcCandidate.id,
        }
        const outsideWindow = {
            ...btcCandidate,
            id: 'same-shape-old',
            datetimeISO: '2026-06-01T10:00:00.000Z',
        }

        const candidates = detectBinanceNexoLegacyCandidates(
            [...movements, linkedLeg, outsideWindow],
            {
                accountIds: ['binance', 'nexo'],
                occurredAtISO: '2026-07-09T12:00:00.000Z',
            },
        )

        expect(candidates.map(candidate => candidate.movement.id)).toContain('legacy-linked-leg')
        expect(candidates.map(candidate => candidate.movement.id)).not.toContain('same-shape-old')
        expect(candidates.find(candidate => candidate.movement.id === 'legacy-linked-leg')?.confidence).toBe('medium')
    })
})
