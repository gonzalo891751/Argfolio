export interface WalletBalanceAdjustment {
    systemBalance: number
    realBalance: number
    diff: number
    amount: number
    direction: 'income' | 'expense' | 'none'
    before: number
    after: number
}

export function computeWalletBalanceAdjustment(systemBalance: number, realBalance: number): WalletBalanceAdjustment {
    if (!Number.isFinite(systemBalance) || !Number.isFinite(realBalance) || realBalance < 0) {
        throw new Error('Los saldos del ajuste deben ser números válidos y no negativos.')
    }
    const diff = realBalance - systemBalance
    return {
        systemBalance,
        realBalance,
        diff,
        amount: Math.abs(diff),
        direction: Math.abs(diff) < 0.005 ? 'none' : diff > 0 ? 'income' : 'expense',
        before: systemBalance,
        after: realBalance,
    }
}
