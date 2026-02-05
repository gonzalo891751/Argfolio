import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemKind } from './types'

export type FxOverrideFamily = 'Oficial' | 'MEP' | 'Cripto'
export type FxOverrideSide = 'C' | 'V'

export interface FxOverride {
    family: FxOverrideFamily
    side: FxOverrideSide
}

export type FxOverridesMap = Record<string, FxOverride>

const STORAGE_KEY = 'argfolio.fxOverrides.v1'
const EVENT_NAME = 'argfolio:fxOverrides'

export function buildFxOverrideKey(accountId: string, kind: ItemKind): string {
    return `${accountId}:${kind}`
}

function readFxOverrides(): FxOverridesMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return {}
        return parsed as FxOverridesMap
    } catch {
        return {}
    }
}

function writeFxOverrides(map: FxOverridesMap) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function notifyFxOverridesChanged() {
    window.dispatchEvent(new Event(EVENT_NAME))
}

export function setFxOverrideLocal(
    accountId: string,
    kind: ItemKind,
    override: FxOverride | null
) {
    const key = buildFxOverrideKey(accountId, kind)
    const current = readFxOverrides()
    if (override) current[key] = override
    else delete current[key]
    writeFxOverrides(current)
    notifyFxOverridesChanged()
}

export function clearFxOverrideLocal(accountId: string, kind: ItemKind) {
    setFxOverrideLocal(accountId, kind, null)
}

export function useFxOverrides() {
    const [overrides, setOverrides] = useState<FxOverridesMap>(() => readFxOverrides())

    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== STORAGE_KEY) return
            setOverrides(readFxOverrides())
        }

        const onLocal = () => {
            setOverrides(readFxOverrides())
        }

        window.addEventListener('storage', onStorage)
        window.addEventListener(EVENT_NAME, onLocal as EventListener)
        return () => {
            window.removeEventListener('storage', onStorage)
            window.removeEventListener(EVENT_NAME, onLocal as EventListener)
        }
    }, [])

    const getOverride = useCallback((accountId: string, kind: ItemKind): FxOverride | undefined => {
        return overrides[buildFxOverrideKey(accountId, kind)]
    }, [overrides])

    const setOverride = useCallback((accountId: string, kind: ItemKind, override: FxOverride | null) => {
        setFxOverrideLocal(accountId, kind, override)
    }, [])

    const clearOverride = useCallback((accountId: string, kind: ItemKind) => {
        clearFxOverrideLocal(accountId, kind)
    }, [])

    const keys = useMemo(() => Object.keys(overrides), [overrides])

    return {
        overrides,
        keys,
        getOverride,
        setOverride,
        clearOverride,
        storageKey: STORAGE_KEY,
    }
}

