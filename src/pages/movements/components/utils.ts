import type { Movement, Instrument, Account } from '@/domain/types'

export function getMovementAssetDisplay(
    movement: Movement,
    instrument: Instrument | null | undefined,
    account: Account | null | undefined
) {
    if (movement.assetClass === 'pf') {
        return {
            title: 'Plazo Fijo',
            subtitle: account?.name || 'Plazo Fijo',
            symbol: 'PF',
            category: 'PF'
        }
    }

    if (movement.assetClass === 'fci' || instrument?.category === 'FCI') {
        // 1. Try Meta Snapshot (Saved at creation)
        if (movement.meta?.fci) {
            return {
                title: movement.meta.fci.nameSnapshot,
                subtitle: `${movement.meta.fci.managerSnapshot} • ${movement.meta.fci.categorySnapshot}`,
                symbol: 'FCI',
                category: 'FCI'
            }
        }

        // 2. Try Instrument (Name usually contains Fund Name)
        if (instrument) {
            return {
                title: instrument.name,
                subtitle: 'FCI',
                symbol: 'FCI',
                category: 'FCI'
            }
        }

        // 3. Fallback: Parse ID (fci:manager|name|curr)
        const parts = (movement.instrumentId || '').split('|')
        if (parts.length >= 2) {
            // 0: manager (fci:manager), 1: name, 2: currency
            const manager = parts[0].replace('fci:', '').toUpperCase()
            const name = parts[1].replace(/-/g, ' ').toUpperCase()
            return {
                title: name,
                subtitle: manager,
                symbol: 'FCI',
                category: 'FCI'
            }
        }

        return {
            title: movement.assetName || 'FCI Desconocido',
            subtitle: 'Fondo Común de Inversión',
            symbol: 'FCI',
            category: 'FCI'
        }
    }

    if (movement.assetClass === 'wallet' || movement.assetClass === 'currency') {
        const isUSD = movement.tradeCurrency === 'USD'
        return {
            title: isUSD ? 'Dólares' : 'Pesos',
            subtitle: 'Efectivo',
            symbol: isUSD ? 'USD' : 'ARS',
            category: movement.assetClass === 'wallet' ? 'WALLET' : 'CURRENCY'
        }
    }

    const symbol = instrument?.symbol || movement.ticker || '—'
    const name = instrument?.name || movement.assetName || '—'
    const category = instrument?.category || movement.assetClass || 'CASH'

    return {
        title: symbol,
        subtitle: name,
        symbol,
        category
    }
}
