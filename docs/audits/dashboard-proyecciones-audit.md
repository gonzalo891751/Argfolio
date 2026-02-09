# Audit Dashboard Proyecciones (Phase 0)

Fecha: 2026-02-09 15:37:59 -03:00
Alcance: auditoria tecnica sin implementacion. Se relevan fuentes reales, estados actuales y plan Phase 1 minimo para metricas de resultado hoy/proyectado.

## Resumen ejecutivo
- El dashboard ya no esta completamente vacio: las tarjetas principales usan `computeDashboardMetrics(...)` con `usePortfolioV2 + useSnapshots + useMovements`.
- Los `N/A` actuales son intencionales cuando falta baseline historico (snapshots) para el rango pedido.
- `Drivers del Periodo` hoy muestra columna principal de `Resultado` y columna secundaria de `Tenencia`; no existe aun un modo separado de `PROYECCION` para ganancias futuras por categoria.
- La proyeccion actual existe solo en la curva `Evolucion Patrimonio` (modo `PROJ`), no en Drivers ni en una tarjeta dedicada de ganancias proyectadas por rubro.
- Hay datos suficientes para un MVP de proyecciones sin tocar costeo/movimientos: billeteras remuneradas y PF tienen tasas/devengamiento; CEDEAR/Cripto/FCI tienen PnL actual y valuacion, pero sin modelo de retorno futuro general.

## Mapa de fuentes por tarjeta

| Tarjeta | Archivo UI | Hook/selector | Fuente de datos real | Depende de | Causa de vacio/N/A |
|---|---|---|---|---|---|
| Variacion Hoy (24h) | `src/pages/dashboard.tsx` | `dashboardMetricsForDrivers.variation24h` | `computeDashboardMetrics` (`src/features/dashboardV2/dashboard-metrics.ts`) | snapshots + portfolio actual | `missing_history` si no hay snapshot baseline 1D (`Falta historial: genera al menos 2 snapshots`) |
| Rendimiento Mes (MTD) | `src/pages/dashboard.tsx` | `dashboardMetricsForDrivers.mtd` | `computeDashboardMetrics` | snapshots + portfolio actual | `missing_history` si no hay snapshot al inicio de mes |
| Rendimiento Anio (YTD) | `src/pages/dashboard.tsx` | `dashboardMetricsForDrivers.ytd` | `computeDashboardMetrics` | snapshots + portfolio actual | `missing_history` si no hay snapshot al inicio de anio |
| Ingresos Netos (rango) + chips Int/Var/Fees | `src/pages/dashboard.tsx` | `netIncomeMetric` | `buildNetIncome(...)` dentro de `dashboard-metrics.ts` | snapshots (baseline), movements (interest/fee), portfolio actual (valuacion + estimacion yield PF/wallet) | si falta baseline del rango devuelve `status=missing_history` |
| Drivers del Periodo (TOTAL/1D/7D/30D/90D/1Y) | `src/pages/dashboard.tsx` | `driversComputation` | `buildDrivers(...)` dentro de `dashboard-metrics.ts` + `computeDrivers(...)` en `snapshot-helpers.ts` | breakdownItems de snapshots V2 + portfolio actual | en rangos no TOTAL: `missing_history` si falta baseline con `breakdownItems`; en TOTAL: fallback `desde costo` si no hay snapshots V2 historicos |
| Distribucion | `src/pages/dashboard.tsx` | `distributionSlices` | `portfolio.rubros[].totals` (`usePortfolioV2`) | holdings/valuacion actual | vacio solo si total USD <= 0 |
| Riesgo & Metricas | `src/pages/dashboard.tsx` | `riskMetrics` | series de `chartSeries` + helpers (`computeAnnualizedVolatility`, `computeMaxDrawdown`, `computeSharpeRatio`) | snapshots V2 + punto actual portfolio | `N/A` si no hay suficientes puntos (por ejemplo Sharpe < 20 retornos) |

Notas de arquitectura de datos:
- `usePortfolioV2` deriva de hooks existentes (`useAssetsRows`, `usePF`, `useMovements`, `useFxRates`, etc.) y consolida holdings + PnL + detalles por activo/rubro.
- `useSnapshots` y `useMovements` son `react-query` sobre repos Dexie (`snapshotsRepo`, `movementsRepo`).

## Estado actual de snapshots

### Donde se crean
- Manual:
  - Dashboard: boton `Guardar ahora` en `src/pages/dashboard.tsx` -> `useSaveSnapshot().mutate('MEP')`.
  - Historial: `src/pages/history.tsx` -> `useSaveSnapshot().mutateAsync('MEP')`.
- Automatico diario:
  - `useAutoDailySnapshotCapture()` en `src/hooks/use-snapshots.ts`.
  - Se ejecuta globalmente desde `src/components/GlobalDataHandler.tsx`.

### Estructura guardada
- Builder: `buildSnapshotFromPortfolioV2(...)` en `src/features/dashboardV2/snapshot-v2.ts`.
- Campos relevantes:
  - `totalARS`, `totalUSD`, `fxUsed`, `source: 'v2'`.
  - `breakdownRubros: { rubroId -> {ars, usd} }`.
  - `breakdownItems: { assetKey -> {rubroId, ars, usd} }`.
  - `meta.fxRef`, `createdAtISO`.

### Persistencia
- DB local Dexie (`argfolio-db`), tabla `snapshots`.
- Esquema: `src/db/schema.ts` (version 7 con `source` y migracion legacy).
- Repo: `src/db/repositories/snapshots.ts`.
- Upsert idempotente por `dateLocal`: `upsertByDate(...)`.
- Toggle auto snapshots en localStorage: `argfolio.snapshots.auto.v2`.

### Consumo y calculo TOTAL
- Drivers TOTAL usa snapshot mas antiguo con `breakdownItems` como baseline.
- Si no existe snapshot V2 con breakdown, fallback a `resultado desde costo` (PnL actual por rubro).

### Confiabilidad para 1D/7D/30D/etc
- Si existen snapshots del rango (o anteriores al target) es confiable para:
  - deltas de patrimonio,
  - net income,
  - drivers (solo si baseline tiene `breakdownItems`).
- Si hay solo snapshots legacy (sin breakdown), los deltas globales pueden funcionar, pero drivers por rubro no.

## Inventario de datos disponibles para proyeccion por categoria

### Billeteras remuneradas
- Datos existentes:
  - `ItemV2.yieldMeta.tna/tea` (builder V2).
  - utilidades `computeYieldMetrics(balanceArs, tna)` (interes manana, 30d, 1y) en `src/domain/yield/accrual.ts`.
  - UI actual de proyeccion en `src/pages/wallet-detail.tsx` y `src/components/assets/YieldSummaryCard.tsx`.
- Confiabilidad: alta para carry por tasa (sin precio de mercado).

### Plazos fijos
- Datos existentes:
  - `fixedDepositDetails` en `PortfolioV2` (capital, tna/tea, termDays, start/maturity, expectedInterestArs, accruedInterestArs).
  - derivacion desde movimientos PF en `usePF` + `derivePFPositions(...)` (`src/domain/pf/processor.ts`).
  - estimacion de devengado por rango ya usada en dashboard: `estimatePfAccruedInRange(...)` en `dashboard-metrics.ts`.
- Confiabilidad: alta para devengamiento contractual (lineal actual del sistema).

### CEDEARs
- Datos existentes:
  - lotes FIFO, costo ARS/USD historico, `fxAtTrade`, PnL ARS/USD actual en `portfolioV2/builder.ts` y `cedearDetails`.
  - motor de lotes/costeo en `src/domain/portfolio/fifo.ts`, `src/domain/portfolio/average-cost.ts`, `src/domain/portfolio/lot-allocation.ts`.
- Proyeccion disponible real hoy: solo escenario `precio constante` (incremental futuro = 0).
- Restriccion: no hay modelo de expected return/volatilidad para CEDEAR en dashboard drivers.

### Cripto
- Datos existentes:
  - lotes/costo USD, precio actual, PnL USD/ARS en `cryptoDetails` (`portfolioV2/builder.ts`).
- Proyeccion disponible real hoy: `precio constante` (incremental = 0).
- Restriccion: no hay modelo de drift/forecast por activo para tarjeta de drivers.

### FCI
- Datos existentes:
  - lotes, costo ARS/USD, VCP actual, PnL actual en `fciDetails` (`portfolioV2/builder.ts`).
- Proyeccion disponible real hoy:
  - general: `precio constante` (incremental = 0).
  - money market: solo si se dispone tasa explicita (hoy no estandarizada en todos los fondos).
- Restriccion: no hay campo universal de expected return para FCI en PortfolioV2.

## Funciones/utilidades existentes reutilizables
- `src/domain/yield/accrual.ts`
  - `computeTEA(tna)`
  - `computeTermTEA(tna, termDays)`
  - `computeYieldMetrics(balanceArs, tna)`
  - `generateAccrualMovements(...)`
- `src/features/dashboardV2/dashboard-metrics.ts`
  - `estimateWalletInterestForRange(...)`
  - `estimatePfAccruedInRange(...)`
  - `buildNetIncome(...)`
  - `buildDrivers(...)`
  - `computeDashboardMetrics(...)`
- `src/domain/pf/processor.ts`
  - `derivePFPositions(...)` (capital/interes/tea de PF desde movimientos)
- `src/features/portfolioV2/builder.ts`
  - armado de `walletDetails`, `fixedDepositDetails`, `cedearDetails`, `cryptoDetails`, `fciDetails`
  - calculos de PnL por activo/lote
- `src/domain/portfolio/fifo.ts` y `src/domain/portfolio/average-cost.ts`
  - motores de lotes/costeo existentes (no tocar en MVP)

## Propuesta MVP (sin implementar)

### Objetivo funcional
- Mantener `Drivers del Periodo` historico por snapshots como esta.
- Agregar modo `PROYECCION` (toggle) en Drivers o nueva tarjeta `Proyeccion de Ganancias`.
- Mostrar por categoria horizontes: `Hoy`, `Manana`, `7D`, `30D`, `1Y`.

### Definiciones operativas
- `Hoy`: resultado actual observado (PnL y/o carry devengado del dia segun datos existentes).
- `Manana`/`7D`/`30D`/`1Y`: escenario base `sin cambio de precios` para activos de mercado, mas carry contractual de yield assets.
- Etiquetado explicito en UI: evitar confundir `tenencia` con `ganancia`.

### Formulas propuestas por categoria
- Billeteras remuneradas:
  - tasa diaria `r = (TNA/100)/365`.
  - ganancia proyectada `h` dias: `P * ((1+r)^h - 1)` (mismo criterio de `computeYieldMetrics`).
- PF:
  - respetar formula ya vigente en sistema (devengamiento lineal actual usado en dashboard):
  - `accrued(h) = expectedInterestArs * min(h, dias_restantes) / termDays`.
  - si PF vencido/cerrado: incremental futuro `0`.
- CEDEAR/Cripto/FCI (sin modelo):
  - incremental proyectado `0` bajo supuesto `precio constante`.
  - resultado total mostrado = PnL actual (hoy), y futuro igual al actual salvo carry.
- Datos faltantes:
  - FCI con tasa esperada: `requiere` campo de expected return por fondo si se quiere proyectar algo distinto a 0.

## Plan de implementacion (Phase 1)

### Etapa 1: motor de calculo proyectado (sin romper calculos actuales)
- Crear modulo puro, por ejemplo `src/features/dashboardV2/projected-earnings.ts`.
- Exponer `computeProjectedEarningsByCategory({ portfolio, horizonDays, now })`.
- Reusar:
  - tasas de `yieldMeta` para wallets,
  - `fixedDepositDetails` para PF,
  - PnL actual de rubros para CEDEAR/Cripto/FCI (sin drift).
- No tocar motores de movimientos/lotes/costeo.

### Etapa 2: UI minima
- Opcion A (minimo diff): toggle `HISTORICO | PROYECCION` dentro de `Drivers del Periodo` en `src/pages/dashboard.tsx`.
- Opcion B: tarjeta nueva `Proyeccion de Ganancias` (menos riesgo de confusion con drivers historicos).
- Incluir leyenda explicita: `Escenario sin cambio de precio para CEDEAR/Cripto/FCI`.

### Etapa 3: tests + validacion visual
- Unit tests de modulo nuevo en `src/features/dashboardV2/projected-earnings.test.ts`.
- Extender tests de dashboard metrics solo si se reutiliza logica compartida.
- QA manual dashboard con datasets chico/grande.

## Riesgos y mitigaciones
- ARS/USD inconsistente entre rubros:
  - Mitigar usando siempre FX del `portfolio.fx` vigente y helpers existentes.
- Doble conteo (resultado CEDEAR + efecto TC):
  - Mantener definicion unica de PnL actual por rubro desde `PortfolioV2`; no recalcular costo.
- Activos sin yield prometiendo retorno:
  - Mostrar incremental = 0 y badge `sin modelo de rendimiento`.
- Performance con holdings grandes:
  - Modulo puro + memoizacion por `portfolio.asOfISO` y `horizon`.
- Snapshots legacy:
  - Mantener fallback actual en drivers historicos, separado de proyeccion.

## QA plan
- Dataset chico (pocas cuentas/movimientos).
- Dataset grande (muchos lotes CEDEAR/Cripto/FCI).
- Sin snapshots: dashboard debe mostrar mensajes de faltante solo en historico.
- Solo billeteras remuneradas: proyecciones deben moverse en todos los horizontes.
- PF en curso y PF vencidos: devengamiento futuro correcto.
- CEDEAR comprado en ARS vs USD/fx historico: PnL hoy consistente y proyeccion incremental 0.
- Mix ARS/USD: validar conversiones y subtotales por rubro.

## Archivos clave auditados
- `src/pages/dashboard.tsx`
- `src/features/dashboardV2/dashboard-metrics.ts`
- `src/features/dashboardV2/snapshot-v2.ts`
- `src/features/dashboardV2/snapshot-helpers.ts`
- `src/hooks/use-snapshots.ts`
- `src/components/GlobalDataHandler.tsx`
- `src/db/schema.ts`
- `src/db/repositories/snapshots.ts`
- `src/features/portfolioV2/usePortfolioV2.ts`
- `src/features/portfolioV2/builder.ts`
- `src/features/portfolioV2/types.ts`
- `src/features/assets/useAssetsRows.ts`
- `src/hooks/use-movements.ts`
- `src/hooks/use-pf.ts`
- `src/domain/pf/processor.ts`
- `src/domain/yield/accrual.ts`
- `src/domain/portfolio/fifo.ts`
- `src/domain/portfolio/average-cost.ts`
- `src/domain/portfolio/lot-allocation.ts`
- `src/domain/types.ts`
- `src/pages/history.tsx`
- `src/pages/wallet-detail.tsx`
- `src/pages/pf-detail.tsx`
- `docs/AI_HANDOFF.md`
