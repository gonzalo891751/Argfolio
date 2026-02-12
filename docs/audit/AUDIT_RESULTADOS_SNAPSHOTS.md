# Auditoría Técnica: Resultados y Snapshots

**Fecha:** 2026-02-12
**Objetivo:** Diagnóstico de snapshots en $0, auditoría de cálculo de P&L, y plan para tarjeta "Resultados".

## 1. Resumen Ejecutivo

*   **Estado Actual**:
    *   **Cálculos ("Mis Activos")**: La lógica de valuación actual (`computeTotals.ts`, `useComputedPortfolio.ts`) es robusta y correcta. Calcula P&L realizado y no realizado, y maneja múltiples monedas (ARS/USD).
    *   **Snapshots**: El sistema de snapshots automáticos (`useAutoDailySnapshotCapture`) existe y guarda en base de datos local (Dexie), **PERO** tiene un bug crítico de condición de carrera que guarda valores en $0 al inicio.
    *   **Sincronización**: Los snapshots se guardan localmente pero **NO se sincronizan** con la nube (Cloudflare D1). El endpoint `/api/sync/push` soporta snapshots, pero el cliente nunca los envía.
    *   **Tarjeta Resultados**: Existe un prototipo HTML de alta fidelidad que se puede portar a React.

*   **Problemas Críticos**:
    1.  **Bug Snapshot $0**: Al cargar la app, `usePortfolioV2` devuelve un portafolio "vacío" (valores en 0) con `isLoading: false` mientras se inicializan los hooks dependientes o si hay datos parciales. El hook de auto-snapshot captura este estado erróneo inmediatamente.
    2.  **Falta de Sync**: Los snapshots generados en un dispositivo no aparecen en otros.
    3.  **Persistencia**: La tabla `snapshots` en D1 tiene un esquema diferente al de Dexie local (aunque manejable vía mapeo).

## 2. Mapa de Arquitectura

```mermaid
graph TD
    UI[Dashboard UI] --> HookPortfolio[usePortfolioV2]
    HookPortfolio --> HookAssets[useAssetsRows]
    HookAssets --> HookComputed[useComputedPortfolio]
    
    HookComputed --> Dexie[Local DB (Dexie)]
    HookComputed --> Prices[Hooks Precios (useFxRates, etc)]

    subgraph Snapshot System
        AutoSnap[useAutoDailySnapshotCapture] --> HookPortfolio
        AutoSnap --> ExpoSnap[snapshotsRepo (Dexie)]
        ExpoSnap -- FALTA CONEXIÓN --> RemoteSync[remote-sync.ts]
        RemoteSync --> CloudAPI[/api/sync/push]
        CloudAPI --> D1[Cloudflare D1]
    end
```

## 3. Inventario de Datos

*   **Tablas Locales (Dexie)**: `snapshots` (id, dateLocal, createdAtISO, source, breakdownRubros...).
*   **Tablas Remotas (D1)**: `snapshots` (date, payload_json, updated_at).
*   **Endpoints**:
    *   `POST /api/sync/push`: Acepta array de snapshots.
    *   `GET /api/sync/bootstrap`: Devuelve snapshots guardados.

## 4. Diagnóstico del Bug: Snapshots en $0

**Causa Raíz**: Condición de carrera en `usePortfolioV2`.

1.  `usePortfolioV2` llama a `useAssetsRows`.
2.  `useAssetsRows` depende de `groupedRows`.
3.  Si `groupedRows` está vacío (estado inicial antes de procesar), `usePortfolioV2` retorna un objeto `PortfolioV2` válido con totales en 0 y `isLoading: false`.
    ```typescript
    // src/features/portfolioV2/usePortfolioV2.ts
    // Si no hay filas y no está cargando (supuestamente), devuelve 0.
    if (Object.keys(groupedRows).length === 0 && !assetsLoading) { 
        return { isLoading: false, totalArs: 0... } 
    }
    ```
4.  `useAutoDailySnapshotCapture` se dispara porque `!isLoading` es true, y guarda el snapshot v2 con totales en 0.

**Solución Propuesta**:
Inteoducir un chequeo de "stale/ready" más estricto. No snapshotear si el `totalArs` es 0 a menos que confirmemos explícitamente que el usuario no tiene activos (ej. `instruments.length === 0` confirmado).

## 5. Propuesta de Integración: Tarjeta "Resultados"

Se utilizará la estructura del prototipo `dashtarjeta.html`.

**Estructura JSON propuesta (compatible con D1 y UI):**

```typescript
interface ResultsCardData {
  period: '1D' | '7D' | '30D' | '90D' | '1Y' | 'TOTAL';
  pnl: {
    ars: number;
    usd: number;
    trend: 'up' | 'down' | 'neutral';
  };
  breakdown: {
    rubroId: string; // 'cedears', 'crypto', etc.
    label: string;
    invested: { ars: number; usd: number };
    current: { ars: number; usd: number };
    pnl: { ars: number; usd: number };
  }[];
  meta: {
    lastSnapshotDate: string; // YYYY-MM-DD
    isEstimated: boolean; // Si faltan datos de hoy (billeteras)
  }
}
```

**Lógica de Cálculo**:
1.  **Diferencial**: `P&L = ValorActual (Hoy) - ValorHistorico (Snapshot T-x)`.
    *   *Nota*: Esto asume que no hubo *movimientos* (ingresos/egresos) en el medio. Para exactitud real (Time Weighted Return) se necesita ajustar por cashflows.
    *   **Simplificación Fase 1**: P&L simple entre snapshots. Si hubo un depósito grande ayer, aparecerá como "Ganancia" hoy.
    *   **Mejora Fase 2**: Restar flujos de caja netos del período al Resultado. `Resultado = (V_final - V_inicial) - NetFlows`.
    *   Recomiendo implementar la lógica de **Flujos Netos** desde el principio para evitar mostrar depósitos como ganancias.

2.  **Fuentes**:
    *   `Hoy`: `usePortfolioV2` (live).
    *   `T-x`: `useSnapshots` (histórico).

## 6. Plan de Implementación

### Fase 1: Fix Core Snapshots & Sync (Prioridad Alta)
- [ ] Modificar `useAutoDailySnapshotCapture` para evitar guardar 0s accidentales.
- [ ] Implementar `syncRemoteSnapshotUpsert` en `src/sync/remote-sync.ts`.
- [ ] Conectar `useSaveSnapshot` y `useAutoDailySnapshotCapture` para que invoquen el sync después de guardar local.
- [ ] Verificar persistencia en D1.

### Fase 2: Lógica de Comparación (Data Domain)
- [ ] Crear hook `usePortfolioHistory` o `useResultsCalculator`.
- [ ] Implementar búsqueda de snapshot más cercano a T-1, T-7, T-30.
- [ ] (Opcional recomendado) Implementar cálculo de "Flows" (movimientos) en el período para ajustar P&L.

### Fase 3: UI Tarjeta Resultados
- [ ] Portar `dashtarjeta.html` a componente React (`ResultsCard.tsx`).
- [ ] Migrar estilos CSS a Tailwind classes del proyecto.
- [ ] Crear Modal de Detalle (reutilizar `Dialog` de shadcn/ui).

### Fase 4: QA
- [ ] Verificar que el snapshot de hoy no sea 0.
- [ ] Verificar que al editar un activo (ej. comprar) y recargar, el resultado diario tenga sentido.
- [ ] Verificar sync entre navegador incógnito y normal.

## 7. Checklist de QA y Comandos

*   **Verificar DB Local**: `F12 -> Application -> Storage -> IndexedDB -> argfolio-db -> snapshots`.
*   **Forzar Sync**: `window.dispatchEvent(new CustomEvent('argfolio:force-sync'))` (si implementado) o recargar página.
*   **Logs**: Filtrar consola por `[sync]` y `[snapshots]`.

## 8. Preguntas Abiertas
*   ¿Cloudflare Pages soporta Cron Triggers para snapshots server-side? (Si no, dependemos 100% de que el usuario abra la app). *Asumimos que por ahora es client-side on-open.*
*   ¿Definición de "Invertido" para Cripto? ¿Costo promedio ponderado (FIFO/PPP)? *El sistema actual ya calcula `costBasisUsdEq` y `realizedPnL`. Usaremos eso.*

