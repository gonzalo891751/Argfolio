import { describe, it, expect } from 'vitest'
import { computeCashBalances } from './computeHoldings'
import { Movement } from '@/domain/types'

describe('computeCashBalances', () => {
    it('should correctly process DEPOSIT into Account Cash Balance', () => {
        const movements: Movement[] = [
            {
                id: '1',
                accountId: 'Carrefour',
                type: 'DEPOSIT',
                date: '2024-01-20',
                datetimeISO: '2024-01-20T10:00:00Z',
                totalAmount: 67750,
                netAmount: 67750,
                tradeCurrency: 'ARS',
                quantity: 67750,
                instrumentId: 'cash-ars',
            } as any
        ]

        const balances = computeCashBalances(movements)

        const carrefour = balances.get('Carrefour')
        expect(carrefour).toBeDefined()
        expect(carrefour?.get('ARS')).toBe(67750)
    })

    it('should correctly process TRANSFER_IN and TRANSFER_OUT', () => {
        const movements: Movement[] = [
            {
                id: '1',
                accountId: 'Bank',
                type: 'TRANSFER_OUT',
                totalAmount: 1000,
                tradeCurrency: 'ARS',
                datetimeISO: '2024-01-20T10:00:00Z',
            } as any,
            {
                id: '2',
                accountId: 'Carrefour',
                type: 'TRANSFER_IN',
                totalAmount: 1000,
                tradeCurrency: 'ARS',
                datetimeISO: '2024-01-20T10:05:00Z',
            } as any,
        ]

        const balances = computeCashBalances(movements)

        // Initial balance is 0, so -1000 is expected for OUT
        expect(balances.get('Bank')?.get('ARS')).toBe(-1000)
        expect(balances.get('Carrefour')?.get('ARS')).toBe(1000)
    })
})
