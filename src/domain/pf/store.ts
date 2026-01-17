import { PFPosition } from './types'

const STORAGE_KEY = 'argfolio_pf_positions'

export const pfStore = {
    list: (): PFPosition[] => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? JSON.parse(raw) : []
        } catch (e) {
            console.error('Failed to load PF positions', e)
            return []
        }
    },

    save: (position: PFPosition) => {
        const list = pfStore.list()
        // Upsert
        const index = list.findIndex(p => p.id === position.id)
        if (index >= 0) {
            list[index] = position
        } else {
            list.push(position)
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    },

    delete: (id: string) => {
        const list = pfStore.list().filter(p => p.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    },

    get: (id: string): PFPosition | undefined => {
        return pfStore.list().find(p => p.id === id)
    }
}
