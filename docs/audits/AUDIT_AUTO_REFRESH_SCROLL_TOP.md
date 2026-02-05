# Audit: Auto-Refresh & Scroll-Top Bug

**Date:** 2026-02-04  
**Author:** AI Assistant (Claude)  
**Status:** ✅ Fixed

---

## Síntoma
- UI "pestañea" cada ~5 minutos en `/mis-activos-v2` y otras páginas
- El scroll vuelve a la posición inicial (top)
- Usuario reporta que la página parece "refrescarse sola"

## Cómo Reproducir (Pre-Fix)
1. Navegar a `/mis-activos-v2`
2. Scrollear al medio de la página
3. Esperar 5 minutos sin tocar nada
4. ❌ La UI parpadea y el scroll vuelve arriba

---

## Causa Raíz

### Hook `useAutoRefresh` defaulteaba a `true`

[use-auto-refresh.tsx:17-19](file:///d:/Git/Argfolio/src/hooks/use-auto-refresh.tsx#L17-L19):
```typescript
const [isAutoRefreshEnabled, setAutoRefreshEnabledState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored !== 'false' // ← Defaulteaba a TRUE
})
```

Esto causaba `refreshInterval = 5 * 60 * 1000` (5 min) que se pasaba a React Query.

### Fallbacks hardcodeados ignoraban el setting

Incluso si se deshabilitaba, estos hooks tenían fallbacks que lo forzaban:

| Archivo | Problema |
|---------|----------|
| [use-crypto-prices.ts:70](file:///d:/Git/Argfolio/src/hooks/use-crypto-prices.ts#L70) | `refetchInterval: refreshInterval ?? 5 * 60 * 1000` |
| [use-fx-rates.ts:50](file:///d:/Git/Argfolio/src/hooks/use-fx-rates.ts#L50) | `refetchInterval: refreshInterval ?? 5 * 60 * 1000` |

### Qué NO causaba el problema:
- ❌ PWA/Service Worker (no detectado)
- ❌ ScrollToTop components
- ❌ `key={timestamp}` en rutas
- ❌ `location.reload()` o `navigate(0)`

---

## Fix Aplicado

### 1. use-auto-refresh.tsx
```diff
- return stored !== 'false' // Default to true
+ return stored === 'true' // Default to false (opt-in)
```

### 2. use-crypto-prices.ts
```diff
- refetchInterval: refreshInterval ?? 5 * 60 * 1000,
+ refetchInterval: refreshInterval, // 0 when disabled
```

### 3. use-fx-rates.ts
```diff
- refetchInterval: refreshInterval ?? 5 * 60 * 1000,
+ refetchInterval: refreshInterval, // 0 when disabled
```

---

## Archivos Cambiados

| Archivo | Cambio |
|---------|--------|
| `src/hooks/use-auto-refresh.tsx` | Default de `true` → `false` |
| `src/hooks/use-crypto-prices.ts` | Removido fallback 5min |
| `src/hooks/use-fx-rates.ts` | Removido fallback 5min |

---

## QA Checklist

- [ ] `/mis-activos-v2`: scroll + esperar 5 min → NO pestañea
- [ ] `/movements`: scroll + esperar 5 min → NO pestañea
- [ ] Botón refresh header: actualiza datos, NO resetea scroll
- [ ] Ticker del header sigue funcionando
- [ ] `npm run build` pasa
- [ ] `npm test` pasa

---

## Riesgos y Notas

> [!NOTE]
> Los datos ya no se actualizan automáticamente. Usuarios deben usar el botón de refresh manual.

> [!TIP]
> Para reactivar auto-refresh: `localStorage.setItem('argfolio-auto-refresh', 'true')`

> [!IMPORTANT]
> El `setInterval` en `use-pf-settlement.ts` para liquidación automática de Plazos Fijos se conserva ya que NO causa re-render de UI.
