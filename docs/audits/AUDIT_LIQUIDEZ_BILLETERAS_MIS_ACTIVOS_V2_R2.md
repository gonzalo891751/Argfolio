# AUDIT R2 — Liquidez/Billeteras en `/mis-activos-v2` (diagnóstico profundo)
**Fecha:** 2026-02-05  
**Estado:** Diagnóstico + plan (sin implementar fixes)  
**Scope:** Providers “Liquidez XXXX”, filas $0/empties, chip TNA faltante en subcuentas ARS remuneradas, UX acordeones (abrir todo), y riesgos de totales/FX.

---

## 0) Resumen ejecutivo
Hoy se observa en **Mis Activos V2 → Billeteras**:
- Providers con nombre fantasma **`Liquidez 3A94 / Liquidez 85FE`** (IDs UUID “humanizados” por fallback).
- Un provider incluso con **total $0** y **sin subitems** (no debería renderizarse).
- Subcuentas ARS remuneradas (ej. Fiwind) sin chip **`TNA xx%`**.
- UX: rubro “Billeteras” y sus providers empiezan colapsados; se requiere abrir “flechita por flechita”.

**Causa raíz principal (naming):** el engine de portfolio inyecta cash (ARS/USD) como “holding” con un **Account placeholder** `name: 'Account'`, y la UI descarta ese nombre como genérico, cayendo al fallback **`Liquidez ${last4(accountId)}`** para IDs UUID.  
**Causa raíz secundaria ($0/empties):** `buildProviderFromGroup()` filtra items $0 pero **igual retorna el provider**, y `buildRubros()` lo empuja sin un filtro a nivel provider; además suma totales de rubro desde métricas **no filtradas**, lo que puede desalinear “totales vs filas visibles”.  
**Causa raíz terciaria (TNA):** `yieldMeta` solo se adjunta en el flujo de “Frascos”; los items de cash que se muestran en “Billeteras” se construyen sin `yieldMeta`, y `ItemRow` renderiza el chip únicamente si existe `item.yieldMeta.tna`.

---

## 1) Fase 0 — Repro + mapa de flujo (cómo llega la data a Billeteras)
### Repro manual (en tu máquina)
1. `npm run dev`
2. Abrir `http://localhost:5173/mis-activos-v2`
3. En rubro **Billeteras**:
   - Anotar providers visibles (nombre + total ARS/USD) y si tienen subitems.
   - Marcar si aparecen **`Liquidez XXXX`** y/o providers con **$0 sin items**.
4. Abrir `http://localhost:5173/movements`:
   - Validar que la columna **Cuenta** muestra nombres reales (Carrefour/Fiwind/Binance/etc).

### Mapa de flujo (paths reales)
1. `src/hooks/use-computed-portfolio.ts` llama a:
   - `computeHoldings(movements, instruments, accounts)` → holdings “normales” con `account` real.
   - `computeCashLedger(movements)` (si `argfolio.trackCash === 'true'`) → balances por `accountId/currency`.
   - `computeTotals({ holdings, cashBalances, ... })` → **inyecta cash como holdings**.
2. `src/features/assets/useAssetsRows.ts` consume `portfolio.categories[*].items[*].byAccount[*]` y arma:
   - `groupedRows[accountId].accountName = holding.account.name`
3. `src/features/portfolioV2/builder.ts` construye rubros/providers/items:
   - `getDisplayName(accountId, accountName, settingsMap)`
4. `src/pages/assets-v2.tsx` renderiza:
   - Rubros → Providers → Items, con estado local `expandedRubros/expandedProviders`.

---

## 2) Fase 1 — Causa raíz “Liquidez XXXX” (providers fantasma / naming mismatch)
### Evidencia (origen exacto del fallback)
**Fallback a “Liquidez XXXX”** (últimos 4 chars del ID) vive en:
- `src/features/portfolioV2/builder.ts` → `getDisplayName()` (fallback UUID/hash).
- `src/hooks/useAccountSettings.ts` → `resolveDisplayName()` (misma lógica).

Snippet relevante:
```ts
// src/features/portfolioV2/builder.ts
if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
  const suffix = accountId.slice(-4).toUpperCase()
  return `Liquidez ${suffix}`
}
```

### Por qué se dispara hoy (aunque Movimientos muestra nombres reales)
El cash (ARS/USD) se inyecta en el portfolio con un **Account mock**:
- `src/domain/portfolio/computeTotals.ts` (inyección de cash) crea holdings con:
  - `account: { id: accountId, name: 'Account', kind: 'BROKER', ... }`

Snippet relevante:
```ts
// src/domain/portfolio/computeTotals.ts
account: { id: accountId, name: 'Account', kind: 'BROKER', defaultCurrency: 'ARS' }
```

Luego `useAssetsRows` toma `holding.account.name` (que vale `'Account'`) y lo pasa como `accountName` a V2.  
Finalmente `getDisplayName()` descarta `'Account'` como placeholder y cae al fallback por UUID → `Liquidez XXXX`.

### Tabla — providers fantasma (modelo de diagnóstico)
Sin instrumentación runtime no puedo afirmar qué `provider.id` exacto corresponde a cada “Liquidez XXXX”, pero el mapping es determinístico:

| Provider visible | `provider.id` (interno) | `accountId` base | Origen | Fix recomendado |
|---|---|---|---|---|
| `Liquidez 3A94` | `<uuid…3a94>` | `<uuid…3a94>` | `accountName === 'Account'` → fallback UUID | Usar Account real en cash holdings **o** resolver nombre vía `accountsMap` al construir providers |
| `Liquidez 85FE` | `<uuid…85fe>` o `<uuid…85fe>-cash` | `<uuid…85fe>` | idem, o `account` indefinido en builder → fallback | idem + evitar settings sobre IDs sintetizados |

**Cómo confirmar en 30s:** agregar un debug dev-only (ver sección 7) o loggear `portfolio.rubros.find(r=>r.id==='wallets')?.providers` en consola.

---

## 3) Fase 2 — Filtro $0: por qué se renderiza un provider vacío
### Evidencia (función exacta que deja pasar providers vacíos)
`buildProviderFromGroup()` filtra items por `hasSignificantValue()` pero **si el filtrado deja 0 items, igual retorna**:
- `src/features/portfolioV2/builder.ts` → `buildProviderFromGroup()`

Snippet:
```ts
const filteredMetrics = metrics.filter(m => hasSignificantValue(...))
const items = filteredMetrics.map(...)
return { id: accountId, items } // items puede quedar []
```

### Problema adicional: totales de rubro calculados con métricas no filtradas
En varios rubros, `buildRubros()`:
- calcula `itemsTotals` desde `matchingMetrics` (sin filtrar),
- empuja el provider construido desde *filteredMetrics*,
- y acumula `rubroTotals` usando `itemsTotals` (no necesariamente coincide con lo mostrado).

Impacto:
- Provider puede quedar visible con **$0 y sin items** (si *todas* las métricas quedan bajo el umbral).
- Los totales (rubro/KPI) pueden no coincidir con la suma de providers/items renderizados.

### Criterio de “significancia” recomendado (consistente bimonetario)
Guardrail mínimo (sin re-diseñar todo):
- **Provider visible** si `items.length > 0` **y** (`abs(totals.ars) >= 1` **o** `abs(totals.usd) >= 0.01`).
- **Item visible** si `hasSignificantValue(...)` (ya existe) pero revisar umbral USD si hace falta.

---

## 4) Fase 3 — Chip TNA ausente (Fiwind y otros)
### Evidencia (dónde se “pierde” el yield)
`ItemRow` muestra chip si:
- `const hasTna = item.yieldMeta?.tna && item.yieldMeta.tna > 0` en `src/pages/assets-v2.tsx`.

Pero `yieldMeta`:
- **solo se adjunta** en el flujo “Frascos” (`wallet_yield`) dentro de `buildRubros()`:
  - `src/features/portfolioV2/builder.ts` (bloque `config.id === 'frascos'`).
- Para Billeteras, los items se crean con `buildItemFromMetrics()` que **no asigna `yieldMeta`**.

Resultado: aunque `Account.cashYield.enabled === true`, los items cash en Billeteras no tienen `yieldMeta` ⇒ **no hay chip**.

### Fix mínimo (sin duplicar lógica)
En `src/features/portfolioV2/builder.ts`, al construir items de cash (CASH_ARS):
- Si `account.cashYield?.enabled === true` (y currency ARS), setear:
  - `item.kind = 'wallet_yield'`
  - `item.yieldMeta = { tna, tea, lastAccruedISO }` (idealmente usando `tnaOverride` si existe)
  - `item.label = 'Cuenta remunerada'` (en vez de `Pesos Argentinos`)

Aplicar esto tanto a:
- WALLET/BANK (Case A de `wallets`)
- Cash extraído de BROKER/EXCHANGE (Case B) si el producto requiere yield ahí también (Fiwind parece caer en este caso según cómo se clasifique).

---

## 5) Fase 4 — UX acordeones: abrir TODO por defecto en Billeteras
Hoy `src/pages/assets-v2.tsx` inicializa:
- `expandedRubros = new Set()`
- `expandedProviders = new Set()`

**Fix mínimo propuesto:**
- Al cargar portfolio, pre-expand:
  - Rubro `wallets`
  - Todos sus providers (`rubro.providers.map(p => p.id)`)
- Al abrir rubro `wallets` manualmente, auto-expand todos los providers (y dejar que el usuario colapse individualmente después).

**Opcional:** persistir en `localStorage` (ej. `argfolio.ui.wallets.expandedProviders`) para recordar estado.

---

## 6) Fase 5 — Iconos ARS/USD + jerarquía visual + verificación de totales
### Evidencia de gaps actuales
- `ItemRow` usa un **emoji** para cash/wallet (`'💵'`), no iconos (lucide).  
  `src/pages/assets-v2.tsx` → `ItemRow`.
- `ItemRow` usa `oficialSell = 1465` hardcodeado (conversión secundaria puede ser incorrecta).  
  `src/pages/assets-v2.tsx` → `ItemRow`.
- Provider header muestra solo ARS (providers USD-only pueden verse como “$0”).  
  `src/pages/assets-v2.tsx` → `ProviderSection`.

### Especificación técnica mínima (sin rediseño global)
- Iconos (sin deps nuevas; ya usan `lucide-react`):
  - ARS: `Banknote` o `Landmark`
  - USD: `BadgeDollarSign` o `DollarSign`
  - (Opcional) mini-chip “ARS” / “USD” en la fila
- Jerarquía:
  - Totales principales: `font-mono font-semibold text-sm` → subir a `text-base`/`text-lg` para totales
  - Secundarios (equivalencias): `text-xs text-muted-foreground`
- Cálculos:
  - `rubro.totals` debe ser suma de `provider.totals` **post-filtro**
  - `provider.totals` debe ser suma de `item.val*` **post-filtro**
  - Conversions en UI deben usar `portfolio.fx.officialSell` (no hardcode)

---

## 7) Instrumentación opcional (dev-only) para confirmar rápido (recomendado)
Objetivo: en `/mis-activos-v2?debug=1` mostrar/volcar:
- `rubroId`, `provider.id`, `provider.name`, `baseAccountId` (strip `-cash`), `totals`, `items.length`
- Para cada item cash: `kind`, `label`, `yieldMeta`

Implementación mínima (plan, no aplicado):
- `src/pages/assets-v2.tsx`:
  - leer `new URLSearchParams(location.search).get('debug') === '1'`
  - `console.table(...)` al render (guardado por flag) o panel debajo del header.

---

## 8) Plan de fixes mínimo (paso a paso, verificable)
### Fix 1 — Naming consistente para cash holdings (eliminar “Liquidez XXXX”)
**Opción A (recomendada, raíz real):** usar Account real al inyectar cash en el engine.
- `src/domain/portfolio/computeTotals.ts`
  - extender `ComputeTotalsInput` para recibir `accounts: Map<string, Account>` (o `accountsById`)
  - al crear holding cash: `account: accounts.get(accountId) ?? placeholder`
- `src/hooks/use-computed-portfolio.ts`
  - pasar `accounts` map a `computeTotals`
- `src/domain/portfolio/computeCashBalances.test.ts`
  - actualizar llamadas a `computeTotals` (y agregar aserción de `account.name` en cash holdings)

**Opción B (menos raíz, menor alcance):** resolver `accountName` en V2 desde `accountsMap`.
- `src/features/portfolioV2/builder.ts`
  - en `wallets` Case A, pasar `account?.name` a `buildProviderFromGroup` cuando `group.accountName === 'Account'`

### Fix 2 — Eliminar providers vacíos y alinear totales con lo visible
- `src/features/portfolioV2/builder.ts`
  - hacer que `buildProviderFromGroup()` retorne `null` cuando `filteredMetrics.length === 0`
  - en `buildRubros()`, skip si provider es `null`
  - acumular `rubroTotals/rubroPnl` desde `provider.totals/provider.pnl` (no desde métricas pre-filtro)

### Fix 3 — Chip TNA en Billeteras (cash ARS remunerado)
- `src/features/portfolioV2/builder.ts`
  - al mapear métricas CASH_ARS para una cuenta con `cashYield.enabled`:
    - set `kind: 'wallet_yield'`, `yieldMeta`, y `label: 'Cuenta remunerada'`
  - decidir precedencia: `AccountSettings.tnaOverride` > `Account.cashYield.tna`

### Fix 4 — UX: abrir Billeteras + providers por defecto
- `src/pages/assets-v2.tsx`
  - al cargar portfolio, inicializar `expandedRubros` con `'wallets'`
  - setear `expandedProviders` con todos los providers del rubro `'wallets'`
  - opcional: persistir/restaurar desde `localStorage`

### Fix 5 — Iconos ARS/USD + conversiones correctas
- `src/pages/assets-v2.tsx`
  - reemplazar emoji por iconos lucide (ARS/USD)
  - remover `oficialSell = 1465` hardcode; pasar `portfolio.fx.officialSell` a `ItemRow`
  - en `ProviderSection` mostrar ARS + USD eq (o elegir principal según composición)

---

## 9) QA manual propuesto (pasos exactos)
1. Activar cash tracking si aplica: `localStorage.setItem('argfolio.trackCash','true')` y recargar.
2. Ir a `/mis-activos-v2`:
   - No debe aparecer ningún provider `Liquidez XXXX` si la cuenta tiene nombre real en DB.
   - No debe renderizarse ningún provider con `items.length === 0`.
   - Providers con USD-only no deben verse como `$0` (mostrar USD).
3. Para una cuenta con `cashYield.enabled === true` y balance ARS:
   - La subcuenta ARS debe mostrar chip `TNA xx%`.
   - El label debe ser “Cuenta remunerada” (o el definido).
4. UX:
   - Billeteras debe venir expandida (rubro + providers) por defecto.
   - El usuario puede colapsar un provider individual y se respeta.
5. Verificación de totales:
   - Rubro total == suma providers visibles (post-filtro).
   - Provider total == suma de items visibles (post-filtro).

---

## 10) Guardrails (“qué NO tocar”)
- No agregar dependencias nuevas.
- No refactor masivo del engine (mantener cambios acotados a: `computeTotals` cash injection + builder V2 + assets-v2 UI state).
- No cambiar esquemas de DB salvo que sea imprescindible (no parece serlo para este fix).
- No mezclar este trabajo con otros temas (mock prices, FX, etc.) excepto lo estrictamente necesario para eliminar hardcodes visibles en la pantalla objetivo.

