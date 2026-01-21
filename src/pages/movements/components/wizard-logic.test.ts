
import { describe, it, expect } from 'vitest'
import {
    calculateUnitPrice,
    calculateTotal,
    inferAccountKind,
    sortAccountsForAssetClass
} from './wizard-helpers'
import { Account } from '@/domain/types'

// Mock Accounts
const mockAccounts: Account[] = [
    { id: '1', name: 'Banco Galicia', kind: 'BANK', balance: {} } as any,
    { id: '2', name: 'Binance', kind: 'EXCHANGE', balance: {} } as any,
    { id: '3', name: 'Bull Market', kind: 'BROKER', balance: {} } as any,
    { id: '4', name: 'Caja Fuerte', kind: 'OTHER', balance: {} } as any,
    // Test inference overriding
    { id: '5', name: 'Lemon Cash', kind: 'OTHER', balance: {} } as any,
]

describe('Wizard Logic Helpers', () => {

    describe('calculateUnitPrice', () => {
        it('calculates correct price', () => {
            expect(calculateUnitPrice(1000, 10)).toBe(100)
        })
        it('handles zero quantity', () => {
            expect(calculateUnitPrice(1000, 0)).toBe(0)
        })
        it('handles zero total', () => {
            expect(calculateUnitPrice(0, 5)).toBe(0)
        })
        it('precision check (crypto)', () => {
            const p = calculateUnitPrice(100, 3)
            expect(p).toBeCloseTo(33.333333, 4)
        })
    })

    describe('calculateTotal', () => {
        it('calculates total', () => {
            expect(calculateTotal(100, 10)).toBe(1000)
        })
    })

    describe('inferAccountKind', () => {
        it('respects existing specific kinds', () => {
            expect(inferAccountKind('Banco Galicia', 'BANK')).toBe('BANK')
            expect(inferAccountKind('Binance', 'EXCHANGE')).toBe('EXCHANGE')
        })

        it('infers EXCHANGE for Lemon (if currently OTHER)', () => {
            expect(inferAccountKind('Lemon', 'OTHER')).toBe('EXCHANGE')
        })

        it('infers BROKER for Bull Market (if currently OTHER)', () => {
            expect(inferAccountKind('Bull Market', 'OTHER')).toBe('BROKER')
        })

        it('defaults to OTHER for unknown names', () => {
            expect(inferAccountKind('My House', 'OTHER')).toBe('OTHER')
        })
    })

    describe('sortAccountsForAssetClass', () => {
        it('prioritizes EXCHANGE for CRYPTO', () => {
            const sorted = sortAccountsForAssetClass(mockAccounts, 'crypto')
            // Binance (Exchange) and Lemon (Inferred Exchange) should be top
            expect(sorted[0].name).toMatch(/Binance|Lemon/)
            expect(sorted[1].name).toMatch(/Binance|Lemon/)
            // Bull Market (Broker) next
            // Galicia (Bank)
        })

        it('prioritizes BROKER for CEDEAR', () => {
            const sorted = sortAccountsForAssetClass(mockAccounts, 'cedear')
            // Bull Market should be first
            expect(sorted[0].name).toBe('Bull Market')
        })

        it('prioritizes BANK/WALLET for PF/Default', () => {
            const accounts = [
                { id: '1', name: 'Galicia', kind: 'BANK' } as any,
                { id: '2', name: 'Lemon', kind: 'EXCHANGE' } as any
            ]
            const sorted = sortAccountsForAssetClass(accounts, 'pf')
            expect(sorted[0].name).toBe('Galicia')
        })
    })
})
