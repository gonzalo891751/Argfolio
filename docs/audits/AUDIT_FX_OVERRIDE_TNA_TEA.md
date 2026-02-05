# AUDIT - FX Override (TC) + TNA/TEA chips + Scroll no-reset
**Fecha:** 2026-02-05  
**Scope:** `/mis-activos-v2` (Mis Activos V2) - Rubro Billeteras (Liquidez) + FX

## 0) Objetivo
1) En Billeteras: si una cuenta (ARS) es remunerada, en la fila se ven chips **TNA** + **TEA** (y no aparece "Liquidez inmediata").  
2) Chip **TC** clickeable: permitir override manual de **familia** (Oficial/MEP/Cripto) y **lado** (C/V), persistido en `localStorage`.  
3) El override debe impactar valuaciones y totales reales (no solo UI).  
4) Revalidaciones/refetch NO deben “pestañear” ni resetear el scroll.

## 1) Hallazgos / Causa raíz
### 1.1 TNA/TEA no aparecía (o quedaba mal)
- El render de chips en lista (`assets-v2`) depende de `item.yieldMeta.tna > 0`.
- En el flujo de Billeteras, el item de ARS (cash) no garantizaba `yieldMeta` en el shape final.
- Además, `computeTEA()` devolvía un valor **decimal** (0.xx) pero la UI lo mostraba como **%**, resultando en TEA visual incorrecta.

### 1.2 TC no era corregible por el usuario
- La valuación usa inferencia “smart” (familia FX por tipo de cuenta y lado por dirección), pero ante providers ambiguos (ej. wallets con flujos mixtos) el usuario necesitaba override persistente.

### 1.3 Scroll reset / flicker por refetch
- Cuando cambiaba el `queryKey` de `useComputedPortfolio`, React Query podía entrar en estado “loading sin data” momentáneamente.
- En `/mis-activos-v2`, eso podía disparar el fallback de loading, “achicar” el DOM y provocar un salto/scroll reset perceptible.

## 2) Solución implementada (mínima, sin deps)
### 2.1 YieldMeta en cash ARS (Billeteras)
- Se adjunta `yieldMeta` al item `cash_ars` cuando:
  - `account.cashYield.enabled === true`
  - moneda `ARS`
  - `tna > 0` (respeta override `tnaOverride` si existe)
- No se cambia el `label`/`kind` del item, por lo que la fila sigue siendo la de “Pesos Argentinos”.
- `computeTEA()` en el builder ahora retorna TEA en **porcentaje** (0-100), consistente con el resto del UI.

### 2.2 FX Override persistente y con impacto real
- Store/hook nuevo: `src/features/portfolioV2/fxOverrides.ts`
- Persistencia: `localStorage` key `argfolio.fxOverrides.v1`
- Clave por item: `${accountId}:${kind}` (ej: `fiwind:cash_ars`)
- Flujo:
  - `usePortfolioV2` lee `fxOverrides` y se los pasa al builder
  - Builder aplica override al construir `fxMeta` para items cash y recalcula `valArs/valUsd`
  - Totales de provider/rubro se siguen calculando a partir de items -> coherencia garantizada
- UI:
  - Chip “TC …” clickeable en fila (ItemRow) y header de provider
  - Modal con Auto/Manual + selects Familia y Lado
  - Botón “Restaurar Auto”

### 2.3 No scroll reset en refetch
- `useComputedPortfolio` usa `placeholderData` para mantener el snapshot previo mientras se calcula el nuevo.
- Esto evita que `/mis-activos-v2` caiga a un estado de loading transitorio y “pesteñee”.

## 3) Archivos tocados
- `src/features/portfolioV2/builder.ts`
- `src/features/portfolioV2/fxOverrides.ts` (new)
- `src/features/portfolioV2/usePortfolioV2.ts`
- `src/pages/assets-v2.tsx`
- `src/hooks/use-computed-portfolio.ts`

## 4) QA manual (pasos)
1) Ir a `/mis-activos-v2` -> Rubro **Billeteras**.
2) Cuenta ARS remunerada (ej. Carrefour/Fiwind):
   - Fila “Pesos Argentinos” muestra chips **TNA** y **TEA**.
   - No aparece “Liquidez inmediata”.
3) Cuenta NO remunerada:
   - No muestra chips (no “0%”).
4) Click en chip **TC** (fila o provider):
   - Elegir “Manual -> Oficial -> V (Venta)” y “Aplicar”.
   - Confirmar que cambian valuaciones (ARS/USD) y total del provider/rubro.
5) Reload:
   - El override persiste.
6) “Restaurar Auto”:
   - Vuelve al TC inferido.
7) Scroll:
   - Scrollear hacia abajo, esperar >6 min (o forzar refresh de queries): no debe resetear scroll ni “pestañear”.

## 5) Validación
- `npm test` OK (49/49)
- `npm run build` OK

