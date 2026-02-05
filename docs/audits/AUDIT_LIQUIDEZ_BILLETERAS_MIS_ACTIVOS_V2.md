# Auditoría: Implementación de Liquidez y Billeteras (Mis Activos V2)
**Fecha:** 2026-02-04
**Estado:** Diagnóstico Completado
**Objetivo:** Identificar causa raíz de "Cuenta sin nombre", filas con saldo 0, y planificar la transición a una sección unificada de "Liquidez".

## 1. Hallazgos Principales

### A. Origen de "Cuenta sin nombre"
**Causa Raíz:** Fallback genérico en lógica de presentación.
- Cuando una cuenta tiene un ID tipo UUID (largo > 20 chars) y su campo `name` está vacío o es "Account", el sistema aplica un fallback hardcodeado.
- **Ubicación:** `src/hooks/useAccountSettings.ts` (L193) y `src/features/portfolioV2/builder.ts` (L151).
- **Código:**
  ```typescript
  if (accountId.length > 20 || /^[a-f0-9-]{20,}$/i.test(accountId)) {
      return 'Cuenta sin nombre'
  }
  ```
- **Impacto:** Cuentas creadas sin nombre explícito (posiblemente migradas o creadas via wizard rápido) caen en este bucket.

### B. Filas con Saldo $0
**Causa Raíz:** Filtrado incompleto de Providers vacíos.
- La función `buildProviderFromGroup` filtra los *items* individuales que tienen saldo 0 (usando `hasSignificantValue`), pero **retorna el objeto Provider igual**, aunque su lista de items esté vacía y sus totales sean 0.
- `buildRubros` agrega este Provider a la lista de visualización sin verificar si quedó vacío.
- **Ubicación:** `src/features/portfolioV2/builder.ts` (función `buildRubros`).
- **Impacto:** Se ven filas de cuentas (headers) con $0 y sin contenido desplegable.

### C. Clasificación "Billeteras" vs Brokers/Exchanges
**Estado Actual:** Exclusión mutua.
- `buildRubros` fuerza a que:
  - Cuentas tipo `EXCHANGE` -> Todo a Rubro "Cripto" (incluyendo cash).
  - Cuentas tipo `BROKER` -> Todo a Rubro "CEDEARs" (incluyendo cash).
  - Cuentas tipo `WALLET/BANK` -> Rubro "Billeteras".
- **Gap con Requerimiento:** El usuario necesita ver **toda la liquidez** (Cash en Brokers + Cash en Exchanges + Billeteras) en una sola sección "Liquidez".
- **Código:** `src/features/portfolioV2/builder.ts` (L394-462).

### D. TNA y Rendimientos
- **Fuente de Datos:** La TNA vive en la entidad `Account` (columna `cashYield` JSON en DB), no en `AccountSettings`.
- **Visualización:** Ya implementada en `DetailOverlay` para cuentas tipo `wallet_yield`.

## 2. Plan de Acción Recomendado

### Fase 1: Fixes Inmediatos (Limpieza)
1.  **Filtrar Providers Vacíos:**
    - Modificar `buildRubros` en `src/features/portfolioV2/builder.ts` para que descarte el provider si `items.length === 0` (y opcionalmente si `totals.ars === 0`).
2.  **Mejorar Naming Fallback:**
    - Modificar `getDisplayName` para intentar inferir un nombre más amigable si es posible, o cambiar el string "Cuenta sin nombre" por algo menos alarmante como "Cuenta Cash" o usar los primeros 4 caracteres del ID.
    - *Idealmente:* Script de migración para poner nombres reales a las cuentas en DB.

### Fase 2: Implementación de "Liquidez" Unificada
1.  **Refactor de Clasificación (Split de Cuentas):**
    - Modificar el loop principal de `buildRubros`.
    - En lugar de asignar una cuenta entera a un rubro, iterar los *items* de la cuenta.
    - **Regla:**
      - Items categoría `CASH_ARS` / `CASH_USD`: Siempre a Rubro "Liquidez/Billeteras".
      - Items categoría `CEDEAR`/`STOCK`: A Rubro "CEDEARs".
      - Items categoría `CRYPTO`/`STABLE`: A Rubro "Cripto".
    - Esto permitirá que un Broker (ej: IOL) aparezca en "CEDEARs" (con sus acciones) Y en "Liquidez" (con su saldo disponible).

### Fase 3: Detalle y Navegación
1.  **Nueva Página de Detalle:**
    - Reemplazar el modal actual por navegación a `/mis-activos/liquidez` o `/mis-activos/detalle/:accountId`.
    - Esta página mostrará el historial de movimientos filtrado por `accountId`.

## 3. Riesgos y Consideraciones
- **Duplicación visual de cuentas:** Al hacer el split, la misma cuenta "IOL" aparecerá en dos secciones. Esto es deseado pero requiere que el `id` del provider sea único en la lista global (ej: usar `iol-cash` y `iol-assets`).
- **Totales cruzados:** Asegurar que los KPIs globales no sumen doble (el refactor propuesto suma items, así que es seguro).

## 4. Archivos a Modificar
- `src/features/portfolioV2/builder.ts` (Lógica core de agrupación)
- `src/hooks/useAccountSettings.ts` (Naming fallback)
- `src/pages/assets-v2.tsx` (Solo para reflejar cambios de estructura si los hay)

---
**Próximo Paso:** Ejecutar Fase 1 (Fixes de limpieza) antes de reestructurar la clasificación.
