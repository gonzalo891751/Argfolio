import { describe, it, expect } from 'vitest'
import { computeResultsCardModel } from './results-service'
import type { PortfolioV2, ItemV2, RubroV2, WalletDetail } from '@/features/portfolioV2'
import type { Snapshot } from '@/domain/types'

// Mock minimal objects
const mockSnapshot: Snapshot = {
    id: 'snap-1',
    dateLocal: '2025-01-01',
    totalARS: 0,
    totalUSD: 0,
    fxUsed: { usdArs: 1000, type: 'MEP' },
    createdAtISO: '2025-01-01T10:00:00Z',
    breakdownRubros: {},
    breakdownItems: {},
    source: 'v2'
}

const mockFx = {
    officialSell: 1000,
    officialBuy: 950,
    mepSell: 1200,
    mepBuy: 1150,
    cclSell: 0,
    cclBuy: 0,
    cryptoSell: 0,
    cryptoBuy: 0,
    updatedAtISO: '2025-01-01T10:00:00Z'
}

describe('Results Audit - Logic Verification', () => {
    
    it('should calculate Wallet TOTAL results from interestTotalArs', () => {
        // Setup Wallet Item
        const walletItem: Partial<ItemV2> = {
            id: 'wallet-1',
            kind: 'wallet_yield',
            accountId: 'acc-1',
            valArs: 100000,
            valUsd: 100,
            label: 'Mercado Pago'
        }

        // Setup Wallet Detail with Interest
        const walletDetail: Partial<WalletDetail> = {
            accountId: 'acc-1',
            interestTotalArs: 500, // The key value we want to see
            tna: 45
        }

        const walletDetailsMap = new Map<string, WalletDetail>()
        walletDetailsMap.set('acc-1', walletDetail as WalletDetail)

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'prov-1',
                name: 'Mercado Pago',
                items: [walletItem as ItemV2],
                totals: { ars: 100000, usd: 100 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 100000, usd: 100 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: walletDetailsMap,
            fx: mockFx,
            asOfISO: '2025-01-01T10:00:00Z'
        }

        // Execute
        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-01T12:00:00Z')
        })

        // Verify
        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(500) // MUST be equal to interestTotalArs
        
        const item = walletCategory?.items.find(i => i.id === 'wallet-1')
        expect(item?.pnl.ars).toBe(500)
        expect(item?.subtitle).toContain('TNA 45%')
    })

    it('should calculate Plazo Fijo accrual correctly', () => {
        // Setup PF Item
        // Start: 2025-01-01, Maturity: 2025-01-31 (30 days)
        // Expected Interest: 3000
        // As of: 2025-01-16 (15 days elapsed) -> Should correspond to 1500 accrued
        
        const pfItem: Partial<ItemV2> = {
            id: 'pf-1',
            kind: 'plazo_fijo',
            label: 'PF Banco Galicia',
            valArs: 103000, // Principal + Interest (approx)
            pfMeta: {
                capitalArs: 100000,
                expectedInterestArs: 3000,
                expectedTotalArs: 103000,
                startDateISO: '2025-01-01T10:00:00Z',
                maturityDateISO: '2025-01-31T10:00:00Z',
                daysRemaining: 15
            }
        }

        const plazosRubro: Partial<RubroV2> = {
            id: 'plazos',
            providers: [{
                id: 'prov-pf',
                name: 'Galicia',
                items: [pfItem as ItemV2],
                totals: { ars: 103000, usd: 103 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 103000, usd: 103 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [plazosRubro as RubroV2],
            walletDetails: new Map(),
            fx: mockFx,
            asOfISO: '2025-01-16T10:00:00Z'
        }

        // Execute (Simulating "Today" as Jan 16th)
        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-16T10:00:00Z')
        })

        // Verify
        const pfCategory = result.categories.find(c => c.key === 'plazos')
        expect(pfCategory).toBeDefined()
        
        const item = pfCategory?.items.find(i => i.id === 'pf-1')
        expect(item).toBeDefined()
        
        // Elapsed: Jan 16 00:00 - Jan 1 10:00 = 14.5833 days
        // 3000 * (14.5833 / 30) = 1458.33
        expect(item?.pnl.ars).toBeCloseTo(1458.33, 1) 
    })

    it('should show "Faltan fechas" when PF dates are missing', () => {
        const pfItem: Partial<ItemV2> = {
            id: 'pf-missing',
            kind: 'plazo_fijo',
            label: 'PF Bad Data',
            pfMeta: {
                capitalArs: 100000,
                expectedInterestArs: 3000,
                expectedTotalArs: 103000,
                startDateISO: '', // MISSING
                maturityDateISO: '2025-01-31T10:00:00Z',
                daysRemaining: 15
            }
        }

        const plazosRubro: Partial<RubroV2> = {
            id: 'plazos',
            providers: [{
                id: 'prov-pf',
                name: 'Galicia',
                items: [pfItem as ItemV2],
                totals: { ars: 0, usd: 0 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 0, usd: 0 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [plazosRubro as RubroV2],
            walletDetails: new Map(),
            fx: mockFx,
            asOfISO: '2025-01-16T10:00:00Z'
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-16T10:00:00Z')
        })

        const pfCategory = result.categories.find(c => c.key === 'plazos')
        const item = pfCategory?.items.find(i => i.id === 'pf-missing')
        
        expect(item?.pnl.ars).toBeNull()
        expect(item?.subtitle).toContain('Faltan fechas')
    })

    it('should set walletEmptyStateHint when TOTAL=0 but yield accounts exist', () => {
        const walletItem: Partial<ItemV2> = {
            id: 'wallet-yield-no-interest',
            kind: 'wallet_yield',
            accountId: 'acc-2',
            valArs: 500000,
            valUsd: 500,
            label: 'Ualá',
            yieldMeta: { tna: 40 }
        }

        // No interestTotalArs — simulating no INTEREST movements
        const walletDetail: Partial<WalletDetail> = {
            accountId: 'acc-2',
            interestTotalArs: 0,
            tna: 40
        }

        const walletDetailsMap = new Map<string, WalletDetail>()
        walletDetailsMap.set('acc-2', walletDetail as WalletDetail)

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'prov-2',
                name: 'Ualá',
                items: [walletItem as ItemV2],
                totals: { ars: 500000, usd: 500 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 500000, usd: 500 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: walletDetailsMap,
            fx: mockFx,
            asOfISO: '2025-01-01T10:00:00Z'
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-01T12:00:00Z')
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(0)
        expect(walletCategory?.walletEmptyStateHint).toBe(true)
    })

    it('should NOT set walletEmptyStateHint when interest exists', () => {
        const walletItem: Partial<ItemV2> = {
            id: 'wallet-with-interest',
            kind: 'wallet_yield',
            accountId: 'acc-3',
            valArs: 100000,
            valUsd: 100,
            label: 'Mercado Pago',
            yieldMeta: { tna: 45 }
        }

        const walletDetail: Partial<WalletDetail> = {
            accountId: 'acc-3',
            interestTotalArs: 1200,
            tna: 45
        }

        const walletDetailsMap = new Map<string, WalletDetail>()
        walletDetailsMap.set('acc-3', walletDetail as WalletDetail)

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'prov-3',
                name: 'Mercado Pago',
                items: [walletItem as ItemV2],
                totals: { ars: 100000, usd: 100 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 100000, usd: 100 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: walletDetailsMap,
            fx: mockFx,
            asOfISO: '2025-01-01T10:00:00Z'
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-01T12:00:00Z')
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(1200)
        expect(walletCategory?.walletEmptyStateHint).toBe(false)
    })

    it('should mark period wallet results as isEstimated', () => {
        const walletItem: Partial<ItemV2> = {
            id: 'wallet-period',
            kind: 'wallet_yield',
            accountId: 'acc-4',
            valArs: 200000,
            valUsd: 200,
            label: 'Naranja X',
            yieldMeta: { tna: 38 }
        }

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'prov-4',
                name: 'Naranja X',
                items: [walletItem as ItemV2],
                totals: { ars: 200000, usd: 200 },
                pnl: { ars: 0, usd: 0 }
            }],
            totals: { ars: 200000, usd: 200 },
            pnl: { ars: 0, usd: 0 }
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: new Map(),
            fx: mockFx,
            asOfISO: '2025-02-01T10:00:00Z',
            kpis: { totalArs: 200000, totalUsd: 200, totalUsdEq: 200, pnlUnrealizedArs: 0, pnlUnrealizedUsd: 0, pnlUnrealizedUsdEq: 0 } as PortfolioV2['kpis'],
        }

        const snapshotWithBreakdown: Snapshot = {
            ...mockSnapshot,
            dateLocal: '2025-01-01',
            breakdownRubros: { wallets: { ars: 200000, usd: 200 } },
            breakdownItems: {},
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [snapshotWithBreakdown],
            periodKey: '30D',
            now: new Date('2025-02-01T12:00:00Z')
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.isEstimated).toBe(true)

        const item = walletCategory?.items.find(i => i.id === 'wallet-period')
        expect(item?.subtitle).toContain('Estimado')
        expect(item?.pnl.ars).toBeGreaterThan(0)
    })

    // ---------------------------------------------------------------
    // BUG FIX: cash_ars items with yieldMeta (real wallet shape)
    // ---------------------------------------------------------------

    it('should calculate TOTAL interest for cash_ars items with yieldMeta (real wallet shape)', () => {
        // This is the REAL shape produced by builder.ts for yield-bearing wallet accounts.
        // kind = 'cash_ars' (NOT 'wallet_yield') with yieldMeta attached.
        const walletItem: Partial<ItemV2> = {
            id: 'carrefour-cash',
            kind: 'cash_ars',
            accountId: 'carrefour',
            valArs: 250000,
            valUsd: 250,
            label: 'Pesos',
            yieldMeta: { tna: 42 },
        }

        const walletDetail: Partial<WalletDetail> = {
            accountId: 'carrefour',
            interestTotalArs: 3150.75,
            tna: 42,
        }

        const walletDetailsMap = new Map<string, WalletDetail>()
        walletDetailsMap.set('carrefour', walletDetail as WalletDetail)

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'carrefour',
                name: 'Carrefour',
                items: [walletItem as ItemV2],
                totals: { ars: 250000, usd: 250 },
                pnl: { ars: 0, usd: 0 },
            }],
            totals: { ars: 250000, usd: 250 },
            pnl: { ars: 0, usd: 0 },
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: walletDetailsMap,
            fx: mockFx,
            asOfISO: '2025-01-15T10:00:00Z',
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-15T12:00:00Z'),
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(3150.75)
        expect(walletCategory?.walletEmptyStateHint).toBe(false)

        const item = walletCategory?.items.find(i => i.id === 'carrefour-cash')
        expect(item?.pnl.ars).toBe(3150.75)
        expect(item?.subtitle).toContain('TNA 42%')
    })

    it('should NOT count deposits/withdrawals as PnL for wallets', () => {
        // A non-yield wallet with deposits only should show $0 PnL.
        const walletItem: Partial<ItemV2> = {
            id: 'checking-cash',
            kind: 'cash_ars',
            accountId: 'checking',
            valArs: 1000000,
            valUsd: 1000,
            label: 'Cuenta Corriente',
            // No yieldMeta — not a yield-bearing account
        }

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'checking',
                name: 'Banco Nación',
                items: [walletItem as ItemV2],
                totals: { ars: 1000000, usd: 1000 },
                pnl: { ars: 0, usd: 0 },
            }],
            totals: { ars: 1000000, usd: 1000 },
            pnl: { ars: 0, usd: 0 },
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: new Map(),
            fx: mockFx,
            asOfISO: '2025-01-15T10:00:00Z',
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-15T12:00:00Z'),
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(0)

        const item = walletCategory?.items.find(i => i.id === 'checking-cash')
        expect(item?.pnl.ars).toBe(0)
    })

    it('should set walletEmptyStateHint for cash_ars with yieldMeta but no interest yet', () => {
        const walletItem: Partial<ItemV2> = {
            id: 'mp-cash',
            kind: 'cash_ars',
            accountId: 'mp-acc',
            valArs: 300000,
            valUsd: 300,
            label: 'Pesos',
            yieldMeta: { tna: 45 },
        }

        const walletDetail: Partial<WalletDetail> = {
            accountId: 'mp-acc',
            interestTotalArs: 0,
            tna: 45,
        }

        const walletDetailsMap = new Map<string, WalletDetail>()
        walletDetailsMap.set('mp-acc', walletDetail as WalletDetail)

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'mp-acc',
                name: 'Mercado Pago',
                items: [walletItem as ItemV2],
                totals: { ars: 300000, usd: 300 },
                pnl: { ars: 0, usd: 0 },
            }],
            totals: { ars: 300000, usd: 300 },
            pnl: { ars: 0, usd: 0 },
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: walletDetailsMap,
            fx: mockFx,
            asOfISO: '2025-01-01T10:00:00Z',
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [mockSnapshot],
            periodKey: 'TOTAL',
            now: new Date('2025-01-01T12:00:00Z'),
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.pnl.ars).toBe(0)
        expect(walletCategory?.walletEmptyStateHint).toBe(true)
    })

    it('should estimate period interest for cash_ars items with yieldMeta', () => {
        const walletItem: Partial<ItemV2> = {
            id: 'mp-period',
            kind: 'cash_ars',
            accountId: 'mp-acc-2',
            valArs: 200000,
            valUsd: 200,
            label: 'Pesos',
            yieldMeta: { tna: 38 },
        }

        const walletsRubro: Partial<RubroV2> = {
            id: 'wallets',
            providers: [{
                id: 'mp-acc-2',
                name: 'Mercado Pago',
                items: [walletItem as ItemV2],
                totals: { ars: 200000, usd: 200 },
                pnl: { ars: 0, usd: 0 },
            }],
            totals: { ars: 200000, usd: 200 },
            pnl: { ars: 0, usd: 0 },
        }

        const portfolio: Partial<PortfolioV2> = {
            rubros: [walletsRubro as RubroV2],
            walletDetails: new Map(),
            fx: mockFx,
            asOfISO: '2025-02-01T10:00:00Z',
            kpis: { totalArs: 200000, totalUsd: 200, totalUsdEq: 200, pnlUnrealizedArs: 0, pnlUnrealizedUsd: 0, pnlUnrealizedUsdEq: 0 } as PortfolioV2['kpis'],
        }

        const snapshotWithBreakdown: Snapshot = {
            ...mockSnapshot,
            dateLocal: '2025-01-01',
            breakdownRubros: { wallets: { ars: 200000, usd: 200 } },
            breakdownItems: {},
        }

        const result = computeResultsCardModel({
            portfolio: portfolio as PortfolioV2,
            snapshots: [snapshotWithBreakdown],
            periodKey: '30D',
            now: new Date('2025-02-01T12:00:00Z'),
        })

        const walletCategory = result.categories.find(c => c.key === 'wallets')
        expect(walletCategory).toBeDefined()
        expect(walletCategory?.isEstimated).toBe(true)

        const item = walletCategory?.items.find(i => i.id === 'mp-period')
        expect(item?.pnl.ars).toBeGreaterThan(0)
        expect(item?.subtitle).toContain('Estimado')
    })
})
