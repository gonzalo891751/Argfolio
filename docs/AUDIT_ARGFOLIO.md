# Auditoría Técnica: Argfolio

**Fecha:** 4 de Febrero, 2026
**Autor:** Auditoría Técnica (Antigravity)
**Estado del Proyecto:** Fase 2 (Migración y Consolidación)

---

## 1. Snapshot del Proyecto

### Stack Tecnológico
- **Frontend:** React 18 + Vite + TypeScript
- **Estilos:** TailwindCSS + Shadcn/ui
- **Estado:** React Query (Server/Async State) + Local State (useState). No hay global store complejo (Redux/Zustand) excepto Hooks custom.
- **Persistencia:** `Dexie.js` (IndexedDB) para almacenamiento local.
- **Routing:** `react-router-dom` v7.

### Scripts y Salud
- **Build:** `npm run build` falla actualmente (errores de TypeScript en imports y tipos).
- **Lint:** `npm run lint` reporta errores (4 errors).
- **Tests:** `npm test` ejecuta `vitest`.

### Estructura de Directorios
```
src/
├── db/             # Schema de Dexie (Source of Truth)
├── domain/         # Definiciones de Tipos y Lógica Pura (Portfolio Engine)
├── features/       # Módulos encapsulados (assets, personal-finances)
├── hooks/          # Data Access Layer (React Query hooks)
├── pages/          # Vistas principales (Rutas)
└── components/     # UI Reutilizable
```

---

## 2. Mapa de Navegación

| Ruta | Página / Componente | Estado | Riesgos |
|------|---------------------|--------|---------|
| `/dashboard` | `DashboardPage` | OK | Depende de cálculos pesados en cliente. |
| `/assets` | `AssetsPage` | **HÍBRIDO** | Mezcla lógica legacy de Plazos Fijos con nueva lógica de `useAssetsRows`. Complejidad alta. |
| `/movements` | `MovementsPage` (V2) | OK | Nueva implementación V2. Parece robusta. |
| `/history` | `HistoryPage` | **RIESGO** | Usa Snapshots estáticos. No recalcula historia si se corrigen movimientos pasados ("Drift"). |
| `/settings` | `SettingsPage` | OK | Configuración de FX y Reset. |
| `/personal-finances` | `PersonalFinancesPage` | WIP | Nuevo módulo para Deudas/Cashflow. |
| `/import` | `ImportPage` | OK | Importación masiva. |

---

## 3. Modelo de Dominio

### Flujo de Datos
`DB (Dexie)` -> `React Query (Hooks)` -> `Domain Logic (Computed)` -> `UI`

### Entidades Principales (`src/domain/types.ts`)
- **Movements:** La tabla central. Contiene `tradeCurrency`, `fxAtTrade`, `fee`. Es el unico "Source of Truth" transaccional.
- **Instruments:** Activos (Cedears, Crypto, etc).
- **Accounts:** Brokers/Bancos.
- **Snapshots:** Foto estática del patrimonio (`totalARS`, `totalUSD`).

### Lógica de Cálculo (`src/domain/portfolio`)
El sistema no guarda "Holdings" en DB. Los recalcula **al vuelo** en cada carga (`useComputedPortfolio.ts`).
- **Engine:** Usa `computeHoldings` y `fifo.ts` (FIFO Inventory) para determinar costo y cantidad.
- **Precios:** Combina Mock (stocks), Crypto API, y CEDEARs (PPI) en un `priceMap`.

---

## 4. Sistema Multi-moneda (CRÍTICO)

### Monedas Soportadas
ARS, USD, USDT, USDC, BTC, ETH.

### Tipos de Cambio (FX)
- **Fuente:** `useFxRates` (DolarApi). Cacheado en localStorage.
- **Tipos:** MEP, CCL, OFICIAL, CRIPTO.
- **Manejo en Movimientos:** Se guarda `fxAtTrade` en cada movimiento.
- **Riesgo Detectado:**
    - Si `fxAtTrade` no se carga al crear el movimiento, se asume 1 o hay que inferirlo.
    - El cálculo de `totalUSD` histórico depende críticamente de este valor.

### Conversiones Clave
- **Total ARS -> USD:** Se usa el FX preferido en Configuración (MEP/CCL).
- **Total USD -> ARS:** Se usa el FX preferido.
- **Activos:**
    - `CASH_USD` y `CRYPTO` -> Valuados en USD. Se convierten a ARS usando FX del día.
    - `CEDEAR` -> Valuados en ARS. Se convierten a USD ("USD Equivalente") usando CCL/MEP.

---

## 5. Auditoría de "Mis Activos"

### Situación Actual
No existen dos páginas separadas visibles. Existe una única `AssetsPage` (`src/pages/assets.tsx`) que está en proceso de transición.

- **Componente:** `AssetsPage`
- **Logic Hook:** `useAssetsRows` (en `src/features/assets`).
- **Problema:** El código contiene bloques explícitos para "Plazos Fijos" (legacy) que se están moviendo a una vista por cuenta.
- **Hallazgo:** La tabla principal (`useAssetsRows`) maneja bien la mayoría de activos, pero los FCIs y Plazos Fijos tienen tratamientos UI separados o "parchados".
- **Gaps:**
    - Precios de Stocks (AAPL, GOOGL) están **HARDCODED** (`mockPrices` en `use-computed-portfolio.ts`).
    - No hay distinción clara visual entre resultado por precio vs resultado por FX en la columna de ganancia.

---

## 6. Auditoría de "Movimientos"

### Estado: V2 (`src/pages/movements.tsx`)
- **Tipos:** Soporta BUY, SELL, DIVIDEND, INTEREST, DEBT_ADD, etc.
- **Validaciones:** Basadas en UI (Zod forms en `MovementModal`). No parece haber validación estricta de "Saldo negativo" en el Engine (el FIFO simplemente consume lo que hay).
- **Duplicación:** No detectada. `useMovements` es el único writer.

---

## 7. Auditoría de "Historial"

### Estado: Snapshots
- **Mecánica:** El usuario debe guardar manualmente (o script diario) un registro en la tabla `snapshots`.
- **Riesgo Mayor (Drift):** Si hoy corrijo un movimiento de Enero, el Snapshot de Enero **NO** cambia. El historial quedará inconsistente con la realidad recalculada.
- **Recomendación:** Implementar un "Log de Patrimonio" calculado dinámicamente o regenerar snapshots históricos al editar movimientos viejos.

---

## 8. Lista Priorizada de Hallazgos (Action Plan)

| ID | Severidad | Módulo | Hallazgo | Solución Propuesta |
|----|-----------|--------|----------|--------------------|
| **P0** | **CRÍTICA** | **Precios** | Precios de acciones (AAPL, etc.) están hardcoded (Mock) en `use-computed-portfolio`. | Implementar fetch real (Yahoo Finance / AlphaVantage) o eliminar stocks de prueba. |
| **P1** | Alta | Build | El build falla (`npm run build`). Impide deploy. | Corregir errores de tipos TS y dependencias circulares si las hay. |
| **P1** | Alta | Historial | Los snapshots son estáticos y manuales. | Automatizar snapshots diarios y alerta de inconsistencia si se edita el pasado. |
| **P2** | Media | Assets | UI mixta (Legacy PFs + Nueva Tabla). | Unificar todo en `useAssetsRows` y que la tabla sea agnóstica del tipo de activo. |
| **P2** | Media | FX | Dependencia de `fxAtTrade` opcional. | Hacer obligatorio el FX en movimientos de cruce de moneda. |

### Quick Wins (Próximos 3 pasos)
1. **Fix Build:** Lograr que `npm run build` pase verde. Esto asegura integridad de tipos.
2. **Eliminar Mocks:** Reemplazar `mockPrices` en `use-computed-portfolio` por una llamada vacía o real, para no engañar al usuario con precios falsos.
3. **Unificar Assets:** Mover la lógica de visualización de FCIs y PFs completamente dentro de `useAssetsRows` para limpiar `AssetsPage`.
