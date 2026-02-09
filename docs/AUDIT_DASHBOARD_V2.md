# Audit Dashboard V2: Análisis Técnico y Plan de Migración

> **Fecha:** 09/02/2026
> **Estado:** Fase 0 (Diagnóstico Completo)
> **Autor:** AI Assistant (Staff Engineer Role)

## 1. Resumen Ejecutivo

Este documento detalla el estado actual del proyecto Argfolio para la implementación del **Dashboard v2**. Se ha identificado el prototipo de UI, la lógica actual ("legacy") y la nueva lógica de negocio ("Mis Activos v2").

**Hallazgo Principal:** Existe una **divergencia crítica** en la persistencia de datos históricos. El sistema actual de snapshots (`useSnapshots`) solo guarda totales globales (`totalARS`, `totalUSD`) calculados con la lógica vieja (`useComputedPortfolio`). Para soportar los requerimientos del Dashboard v2 (Drivers 1D/7D, Evolución detallada), es mandatorio migrar el mecanismo de snapshots para usar la nueva lógica V2 y persistir un desglose por activo/rubro.

---

## 2. Mapa de Arquitectura y Archivos Relevantes

### 2.1. UI / Prototipos
- **Dashboard v2 (Target):** `docs/prototypes/dash1.html`
  - Contiene la estructura HTML/Tailwind completa.
  - Incluye: KPIs, Gráfico de Evolución (Hist/Proj), Tabla de Drivers, Donut de Distribución, Métricas de Riesgo.
- **Dashboard Viejo (Legacy):** `src/pages/dashboard.tsx`
  - Renderiza componentes de `src/components/dashboard/*`.
  - Depende de `useComputedPortfolio` (Legacy Logic).

### 2.2. Lógica de Negocio (Source of Truth)
- **Lógica Nueva (V2):** `src/features/portfolioV2/usePortfolioV2.ts`
  - **Builder Core:** `src/features/portfolioV2/builder.ts` (LÓGICA ROBUSTA).
  - **Tipos de Datos:** `src/features/portfolioV2/types.ts`.
  - Maneja: Overrides de FX, precios de FCI, distinción de rubros (Billeteras, Frascos, etc.).
- **Lógica Vieja (Legacy):** `src/hooks/use-computed-portfolio.ts`
  - Usada actualmente por el dashboard viejo y el mecanismo de snapshots.
  - **Riesgo:** Si no se actualiza, los snapshots guardarán valores diferentes a los que ve el usuario en "Mis Activos v2".

### 2.3. Datos y Persistencia
- **Snapshots (DB):** `src/db/schema.ts` (Table: `snapshots`)
- **Precios (FX):** `src/hooks/use-fx-rates.ts` (Cache en `localStorage`).
- **Movimientos:** `src/hooks/use-movements.ts` -> DB `movements`.

---

## 3. Auditoría de Datos y Mapeo de KPIs

### 3.1. KPIs Principales (Header)

| KPI | Fuente V2 (`PortfolioV2`) | Fórmula / Lógica | Gap / Acción |
| :--- | :--- | :--- | :--- |
| **Patrimonio Total (ARS)** | `portfolio.kpis.totalArs` | Suma de `valArs` de todos los items. | ✅ Listo en V2. |
| **Patrimonio Total (USD)** | `portfolio.kpis.totalUsd` | Suma de `valUsd` de todos los items (TC implícito de cada activo). | ✅ Listo en V2. Mejor que "Legacy" (que divide totalARS / TC global). |
| **Cambio 1D / MTD / YTD** | `N/A` (No existe en V2 snapshot) | Requiere comparar `totalArs` actual vs Snapshot histórico (T-1, T-30, etc.). | ⚠️ **GAP CRÍTICO**. Los snapshots actuales solo tienen totales "Legacy". Se necesita snapshot V2. |
| **Liquidez** | `portfolio.rubros` (filtro) | Sumar rubro `wallets` + `frascos` + `crypto` (stable). | ✅ Calculable desde `portfolio.rubros`. |
| **Resultado Neto** | `portfolio.kpis.pnlUnrealizedArs` | `valArs` - `costBasisArs`. | ✅ Disponible. Falta "Realized PnL" robusto en V2. |

### 3.2. Drivers del Período (Tabla de Variaciones)

El prototipo muestra cuánto contribuyó cada categoría (CEDEARs, Bonos, etc.) a la variación del patrimonio en un período (ej: 1D, 7D).

- **Estado Actual:** NO EXISTE.
- **Problema:** `usePortfolioV2` calcula el estado *presente*. No sabe cuánto valían los CEDEARs hace 7 días.
- **Solución Requerida:** Actualizar el schema de `snapshots` para guardar el desglose por Rubro (al menos) o por Activo.
  - *Plan Mínimo:* Guardar totales por Rubro en el snapshot diario (`json` blob o tabla relacional).

### 3.3. Evolución (Gráfico)

- **Histórico:** Actualmente lee de la tabla `snapshots`.
  - *Riesgo:* Los datos viejos son "Legacy". Los nuevos deben ser "V2". Habrá un salto/discontinuidad si la lógica de valuación difiere.
- **Proyectado:**
  - *Gap:* No hay lógica de proyección en el backend/hooks.
  - *Propuesta:* Proyección lineal simple basada en TNA ponderada (disponible en `yieldMeta` para PF y Cuentas Remuneradas).

### 3.4. Distribución y Riesgo

- **Distribución (Donut):**
  - **Fuente:** `portfolio.rubros`. Iterar y sacar `%` sobre el total. ✅ Listo.
- **Métricas de Riesgo (Volatilidad, Sharpe, Drawdown):**
  - **Fuente:** NO EXISTE. Requiere serie de tiempo de retornos diarios.
  - **Gap:** Calculable si tenemos historial de snapshots limpio. Si no, quedarán en "N/A" o "Pendiente".

---

## 4. Análisis de Gaps y Stop Checkpoint

### 🚨 Gaps Críticos Detectados
1.  **Divergencia de Lógica en Snapshots:**
    - `useSaveSnapshot` llama a `useComputedPortfolio` (Viejo).
    - El Dashboard V2 mostrará datos de `usePortfolioV2` (Nuevo).
    - **Resultado:** El gráfico histórico (snapshots) no coincidirá con el valor actual del header.
2.  **Falta de Granularidad Histórica:**
    - `Snapshot` schema = `{ totalARS, totalUSD }`.
    - Dashboard V2 requiere = `{ [Rubro]: { valArs, valUsd } }` para calcular Drivers.

### 🛑 STOP CHECKPOINT
**Piezas listas para reusar:**
- `usePortfolioV2`: Hook sólido para el estado actual.
- `builder.ts`: Lógica de valuación correcta.
- `docs/prototypes/dash1.html`: UI clara para migrar a componentes React.

**Piezas faltantes (Bloqueantes para feature completa):**
- Migración de `useSaveSnapshot` para usar `usePortfolioV2`.
- Migración de schema `Snapshot` en Dexie para soportar composición (`breakdown`).

---

## 5. Plan de Implementación (Propuesta)

### Fase 1: Arquitectura de Datos (Backbone)
1.  **Refactor Snapshot Schema:**
    - Agregar campo `breakdown` (JSON) a la tabla `snapshots`.
    - Estructura: `{ [rubroId]: { ars: number, usd: number } }`.
2.  **Actualizar `useSaveSnapshot`:**
    - Cambiar dependencia: `useComputedPortfolio` -> `usePortfolioV2`.
    - Guardar `rubros` en el nuevo campo `breakdown`.

### Fase 2: Componentes UI (Skeleton)
1.  Crear `src/components/dashboard-v2/`
    - Portear `dash1.html` a componentes React (`DashboardLayout`, `KpiGrid`, `DriversTable`).
2.  Crear `DashboardViewModel`:
    - Hook adaptador que consuma `usePortfolioV2` y `useSnapshots`.
    - Calcule variaciones (1D, 7D) on-the-fly comparando `current` vs `snapshot[i]`.

### Fase 3: Integración y Reemplazo
1.  Crear ruta `/dashboard-v2` (temporal).
2.  Validar coincidencia de datos con Mis Activos v2.
3.  Reemplazar ruta `/dashboard` oficial.

---

## 6. Siguientes Pasos (Role: USER)

1.  Aprobar este plan de auditoría.
2.  Autorizar la modificación del Schema de Base de Datos (Dexie) en la siguiente tarea.
3.  Definir si se permite "romper" el historial de snapshots existente o si se requiere migración (recalcular totales viejos será imposible sin tener las tenencias históricas, se asume discontinuidad o se mantiene solo el total).
