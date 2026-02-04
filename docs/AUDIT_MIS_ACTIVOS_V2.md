# Auditoría Técnica y Plan de Migración: Mis Activos V2

> **Fecha:** 04/02/2026
> **Objetivo:** Diagnóstico completo de la implementación actual de "Mis Activos" y plan de migración hacia el Prototipo V2, asegurando integridad financiera y UX estable.

---

## 1. Resumen Ejecutivo

1.  **Estado Actual:** La página `AssetsPage` (`src/pages/assets.tsx`) es funcional pero sufre de problemas de rendimiento y estabilidad (parpadeos) debido a una arquitectura de "God Hook" (`useAssetsRows`) y efectos secundarios que escriben en la DB durante el renderizado.
2.  **Calidad de Datos:** El motor de cálculo (`useComputedPortfolio`) es robusto y centralizado, manejando correctamente la priorización de precios (Manual > CEDEAR > Cripto > Mock) y la lógica de FX.
3.  **Riesgo Crítico (Flickering):** Se detectó un **efecto colateral síncrono** en la UI: `AssetsPage` dispara `generateAccrualMovements` en un `useEffect`. Si faltan intereses, escribe en la DB (`movements`), lo que invalida inmediatamente las queries de `useComputedPortfolio`, provocando un re-render y "parpadeo" infinito o cíclico al cargar.
4.  **Deuda Técnica:** Mezcla excesiva de responsabilidades en la capa de vista (`assets.tsx` maneja lógica de negocio de intereses) y hooks inflados (`useAssetsRows` hace fetching, filtrado, transformación y agrupación).
5.  **Gap vs V2:** El backend lógico (cálculos) soporta el 80% de los requisitos V2. El gap principal es visual (dashboard, agrupación, detalle lateral) y de organización de datos (V2 requiere estructura jerárquica más estricta).
6.  **Migración:** Se recomienda una estrategia de "Parallel Route". Construir `src/features/portfolioV2` sin tocar lo actual, exponer ruta `/mis-activos-v2`, y switchear solo cuando haya paridad.
7.  **Fuentes de Verdad:** `Dexie` (DB local) es la fuente única. No hay estado en memoria volátil crítico que se pierda al recargar.
8.  **Performance:** El recálculo total del portafolio en cada cambio de precio (crypto/cedear) es costoso. V2 debe usar selectores más finos.
9.  **Limpieza:** Se identificaron componentes y hooks obsoletos o duplicados que podrán eliminarse post-migración.
10. **Conclusión:** La base es sólida para migrar. El mayor desafío es desacoplar el motor de intereses de la UI para evitar parpadeos y reestructurar el output JSON para alimentar la nueva UI Jerárquica.

---

## 2. Inventario de Archivos Clave

### UI / Componentes Visuales
-   `src/pages/assets.tsx`: **[TARGET]** Página actual "Mis Activos". Contiene lógica de vista y *side-effects* peligrosos.
-   `src/components/assets/AssetDrawer.tsx`: Detalle actual (debe reemplazarse por el Overlay V2).
-   `src/components/assets/PortfolioSummaryCard.tsx`: Dashboard de KPIs actual (reutilizable o refactorizable).

### Lógica de Negocio y Datos (Sources of Truth)
-   `src/features/assets/useAssetsRows.ts`: **[DEPRECATE V2]** Hook monolítico que agrupa lógica. Candidato a dividirse.
-   `src/hooks/use-computed-portfolio.ts`: **[CORE]** Motor de cálculo. Orquesta `useMovements`, precios y FX.
-   `src/domain/assets/valuation.ts`: **[CORE]** Lógica pura de valuación (ARS vs USD, PnL per asset).
-   `src/domain/yield/accrual.ts`: **[CORE]** Motor de generación de intereses diarios.
-   `src/db/schema.ts`: Definición de tablas `movements`, `instruments`, `accounts`.

### Data Providers (Market)
-   `src/hooks/use-fx-rates.ts`: Cotizaciones (DolarAPI).
-   `src/hooks/use-cedear-prices.ts`: Precios CEDEARs (PPI / InvertirOnline).
-   `src/hooks/use-crypto-prices.ts`: Precios Cripto.

---

## 3. Mapa de Datos (Traceability)

| KPI / Dato | Fuente Lógica | Inputs Principales | Archivo Responsable |
| :--- | :--- | :--- | :--- |
| **Patrimonio Total (ARS)** | `computePortfolioTotals` | Suma de `AssetMetrics.valArs` | `src/domain/assets/valuation.ts` |
| **Patrimonio Total (USD)** | `computePortfolioTotals` | Suma de `AssetMetrics.valUsdEq` | `src/domain/assets/valuation.ts` |
| **PnL No Realizado** | `computeAssetMetrics` | `valArs - costArs` (o USD eq) | `src/domain/assets/valuation.ts` |
| **Intereses Diarios** | `generateAccrualMovements` | `Account.cashYield.tna` + Saldo | `src/domain/yield/accrual.ts` |
| **Precios CEDEAR** | `useCedearPrices` | API Externa | `src/hooks/use-cedear-prices.ts` |
| **FX (MEP/Oficial/Cripto)** | `useFxRates` | DolarAPI | `src/hooks/use-fx-rates.ts` |
| **Saldo Inicial Inferido** | `computeHoldings` | Movimientos tipo `INFERRED_INIT` o lógica deducción | `src/domain/portfolio/holdings.ts` |

---

## 4. Hallazgos Críticos y Diagnóstico de Parpadeos

### A. Causa Raíz del Flickering (Confirmado)
En `src/pages/assets.tsx` (Líneas 99-147), existe un `useEffect` que detecta cuentas remuneradas y ejecuta `generateAccrualMovements`.
1.  **El problema:** Si detecta que faltan intereses (ej: ayer), genera movimientos y hace `db.movements.bulkPut`.
2.  **El Ciclo:** Escribir en la DB dispara una actualización en `useMovements` (live query).
3.  **Resultado:** `useComputedPortfolio` se invalida -> `useAssetsRows` se recalcula -> `AssetsPage` se renderiza de nuevo.
4.  Si el cálculo de fechas tiene un "off-by-one" o condiciones de carrera, esto puede ocurrir en *loop* o causar múltiples renders seguidos al cargar la página ("saltos").

**Mitigación Propuesta para Fase 1:**
-   Mover la lógica de `runAccrual` fuera de la vista principal.
-   Ejecutarla en un contexto global (App load) o en un Service Worker/Hook aislado que no bloquee el render de `AssetsPage`.
-   Usar `toast` discreto, no bloquear UI.

### B. Rendimiento de `useAssetsRows`
Cada vez que cambia *un* precio (ej: Bitcoin sube 1 USD), `useComputedPortfolio` recalcula **todo** el árbol de holdings, y `useAssetsRows` regenera todos los objetos agrupados.
-   **Impacto:** Consumo de CPU innecesario y *frame drops* si hay muchos activos y actualizaciones frecuentes de precios.

### C. Confusión de Responsabilidades
`assets.tsx` está calculando totales de PF (`usePF`) y combinándolos manualmente con los totales de `useAssetsRows`. Esto duplica lógica de agregación y hace propenso a errores en el "Total General".

---

## 5. Gap Analysis: Actual vs Prototipo V2

| Requisito V2 (`NuevoMisActivos.html`) | Estado Actual (`assets.tsx`) | Acción Requerida |
| :--- | :--- | :--- |
| **Dashboard KPIs unificados** | Disperso entre `PortfolioSummaryCard` y lógica en Page. | **New Component**: Crear `DashboardV2` puro que reciba totales ya calculados. |
| **Agrupación Jerárquica** (Rubro->Provider->Item) | Agrupación plana por Cuenta (`groupedRows`). | **Refactor Logic**: Adaptar el builder para devolver árbol jerárquico Rubro -> Provider. |
| **Detalle en Overlay Temporal** | Drawer lateral (`AssetDrawer`) | **Adapt**: Reestilar Drawer o reemplazar por Overlay completo. |
| **Panel "Cómo se calcula"** | No existe (solo tooltip o implícito). | **New Component**: Implementar panel lateral con tabla de FX explicita. |
| **Tabla de FX explícita** | Oculta en hooks. | **Expose Data**: Pasar objeto `fxQuotes` a la UI. |
| **Filtros rápidos (Chips)** | Tabs por categoría (`Tabs`). | **Reuse/Style**: Cambiar estilo de Tabs a Chips "pills". |
| **Intereses "Reales"** | Generación en `useEffect`. | **Refactor**: Mover fuera de UI, visualizar como lista en Detalle. |
| **Lotes / FIFO UI** | No visible. | **New Feature**: Exponer array de lotes en el Detalle V2 (la data ya existe en `Holding`). |

---

## 6. Plan de Migración (Estrategia "Sin Basura")

La migración se ejecutará en paralelo, sin destruir la UI actual hasta la validación final.

### Fase A: Builder V2 (Lógica Pura)
1.  Crear `src/features/portfolioV2/builder.ts`.
2.  Este builder consumirá `useComputedPortfolio`.
3.  **Transformación:** Convertirá la estructura plana de holdings en la estructura jerárquica del Prototipo (Rubros > Providers > Items).
4.  **Test:** Unit test exhaustivo comparando totales V1 vs V2.

### Fase B: UI V2 "Shadow"
1.  Crear ruta temporal `/mis-activos-v2` (`src/pages/assets-v2.tsx`).
2.  Implementar el layout del Prototipo (`NuevoMisActivos.html`) usando componentes React y Tailwind.
3.  Conectar con `builder.ts`.
4.  Implementar Panel de "Cómo se calcula" (solo lectura).

### Fase C: Paridad & Switch
1.  Navegar Assets V1 vs V2 lado a lado.
2.  Verificar que los totales (ARS/USD) coincidan al centavo.
3.  Validar corrección de parpadeos (al no tener el *useEffect* de intereses en V2).
4.  Migrar el *trigger* de intereses a `src/App.tsx` o un `GlobalDataHandler`.

### Fase D: Cleanup (Eliminación Segura)
Una vez V2 es oficial:
1.  Eliminar ruta `/assets` (o redirigir a nueva).
2.  Eliminar `src/pages/assets.tsx`.
3.  Eliminar `src/features/assets/useAssetsRows.ts` (si ya no se usa).
4.  Eliminar componentes viejos (`PortfolioSummaryCard` v1 si no se reusó).

---

## 7. DELETE CANDIDATES (Post-Migración)

Archivos que se eliminarán **solo después** de verificar la Fase C.

1.  `src/pages/assets.tsx` (La página vieja).
2.  `src/features/assets/useAssetsRows.ts` (El hook monolítico viejo).
3.  `src/components/assets/PortfolioSummaryCard.tsx` (Si se reemplaza por el nuevo Dashboard V2).
4.  `src/components/assets/AssetDrawer.tsx` (Si se reemplaza por el Overlay V2).
5.  `src/components/assets/CurrencyRatioCard.tsx` (Integrado en Dashboard V2).

---

## 8. Checklist QA Manual

1.  **Carga Inicial:**
    -   [ ] Abrir Mis Activos V2.
    -   [ ] Verificar que NO hay parpadeo de datos ni spinner infinito.
    -   [ ] Verificar que los totales ARS cargan en < 1s (si hay caché).

2.  **Validación Numérica:**
    -   [ ] Sumar manualmente totales de cada Rubro. ¿Coinciden con Total Patrimonio?
    -   [ ] Verificar conversión ARS->USD usando el tipo de cambio mostrado en "Cómo se calcula".
    -   [ ] Verificar que CEDEARs usan MEP y Crypto usa Cripto/USDT.

3.  **Intereses:**
    -   [ ] Verificar que una billetera remunerada muestra "TNA %".
    -   [ ] Verificar en Detalle que el gráfico/lista de intereses diarios coincide con lo esperado.

4.  **UX:**
    -   [ ] Abrir Overlay de Detalle de un activo.
    -   [ ] Cerrar Overlay. La posición de scroll de la lista principal debe mantenerse.
    -   [ ] Cambiar filtro "Billeteras". Solo se ven billeteras.

---

## 9. Comandos de Validación

```bash
# Verificar Build
npm run build

# Verificar Linter
npm run lint

# Tests (si existen, o crear nuevos para el builder)
npm test src/features/portfolioV2
```
