# Operaciones Cripto MVP — Transferencias, Swaps y Precio Faltante

**Fecha:** 2026-07-09
**Alcance:** Prompt 1 — base contable cripto. No incluye la reparación de datos Binance → Nexo (Prompt 2).

## 1. Contrato de operación compuesta

Se eligió la **Opción A**: extender `Movement.meta` con campos opcionales, 100% backwards compatible. No hay nueva entidad ni migración de Dexie/D1 (el payload de sync serializa el movimiento completo como JSON).

```ts
// src/domain/types.ts — Movement.meta
meta: {
    operationId?: string          // id compartido por todas las patas
    operationKind?: 'trade' | 'transfer' | 'swap' | 'balance_adjustment' | 'income' | 'fee'
    legRole?: 'source' | 'destination' | 'fee' | 'cash' | 'asset'
    operationStatus?: 'posted' | 'voided' | 'superseded'   // default: posted
    txHash?: string
    costBasisTransferredUsd?: number   // transferencias: costo que viaja al destino
    feeQty?: number                    // transferencias: cantidad perdida por fee de red
    // ...campos existentes (transferGroupId, allocations, etc.)
}
```

Además, cada pata nueva escribe `groupId = operationId` y `meta.transferGroupId = operationId` (transferencias) para compatibilidad con la agrupación legacy.

### Agrupación (lectura)

`src/domain/operations/operation.ts`:

- `getOperationId(m)`: `meta.operationId → meta.transferGroupId → groupId → relatedMovementId → linkedMovementId`.
- `groupMovementsByOperation(movements)`: agrupa patas con el mismo id (2+ patas = grupo; 1 pata huérfana = fila simple).
- `inferOperationKind(legs)`: contrato explícito o inferencia legacy (TRANSFER_* → transfer; SELL+BUY → swap).
- `findOperationLegs(m, movements)`: patas hermanas de un movimiento (para advertencias de edición/borrado).

Los movimientos viejos siguen funcionando sin cambios: la agrupación es un read-model puro.

## 2. Transferencia cripto (Fase 4)

`src/domain/operations/crypto-transfer.ts` — `buildCryptoTransferMovements(input)` construye las patas; la UI (`CryptoTransferDialog`) las persiste atómicamente (`db.transaction` + `bulkAdd`) y sincroniza en batch.

### Modelo contable (carry-over PPP)

- **TRANSFER_OUT** (origen): `quantity = enviado`, `unitPrice = costo promedio USD del origen`, `totalUSD = enviado × avgCost`. `computeAverageCost` reduce la base proporcionalmente (comportamiento existente).
- **TRANSFER_IN** (destino): `totalUSD = enviado × avgCost` (todo el costo viaja), `unitPrice = totalUSD / recibido`.
- **Fee en especie** (recibido < enviado): la diferencia se registra como movimiento `FEE` auditado (`legRole: 'fee'`) y su costo se **capitaliza** en el promedio del destino → **la base consolidada no cambia**; la cantidad consolidada baja por el fee real.
- **Sin PnL**: `computeRealizedPnL` fue corregido para que `TRANSFER_OUT` reduzca la posición auxiliar sin registrar resultado (antes ni siquiera reducía — asimetría P1 del diagnóstico).
- **Sin caja fantasma**: `computeCashLedger` ahora ignora `TRANSFER_IN/OUT/FEE` con `instrumentId` + `assetClass: 'crypto'` (movimientos en especie, no de caja). Las transferencias de caja de billeteras (sin instrumentId) no cambian.

### Validaciones

- Cuenta origen ≠ destino.
- Cantidades > 0; recibido ≤ enviado.
- No transferir más que el saldo disponible (`availableQty`), salvo `allowOverdraft` explícito.

### Límite conocido (FIFO)

El destino nace con **un solo lote** al costo promedio transferido (MVP PPP). No se portan los lotes individuales del origen. El costo total consolidado se conserva; la granularidad por lote no.

## 3. Swap / conversión (Fase 5)

`src/domain/operations/crypto-swap.ts` — `buildCryptoSwapMovements(input)`, UI en `CryptoSwapDialog`. Multi-origen soportado (ej: BTC + USDT → NEXO).

- Cada **pata origen** es un `SELL` al precio de ejecución → el motor existente realiza PnL sobre fuentes con costo variable (BTC); stables a US$1 → PnL ≈ 0.
- La **pata destino** es un `BUY` con `totalUSD = Σ(valor patas origen)` → el destino nace con costo verificable, **sin necesitar cotización** (caso NEXO: cantidad y costo quedan registrados; el valor de mercado se muestra "no disponible" hasta que haya precio).
- Cash-neutral por construcción (SELL acredita y BUY debita el mismo total, igual que el patrón auto-USDT existente).
- **Fees**: no hay campo de fee separado en el MVP. El fee implícito queda capturado en la relación entregado/recibido; un fee en otro activo (ej. BNB) se modela como pata origen adicional.

## 4. Precio faltante y precio manual (Fase 1)

- **NEXO** agregado a `COINGECKO_MAP` (`nexo`).
- Resolución de precio centralizada en `src/domain/prices/resolve-asset-price.ts`: **manual → proveedor → fallback del portfolio → missing**. El precio manual se marca `status: 'estimated'`, `source: 'manual'`, con fecha (`ManualPrice.updatedAtISO`).
- `resolvePriceWithCache` corregido: un precio manual/estimado válido ya no puede ser pisado por un precio cacheado del proveedor.
- **Missing seguro** en el builder V2 (`buildItemFromMetrics`): activo con `qty > 0` sin valuación → `valueMissing: true`, `pnl* = undefined`, `val* = 0` como placeholder neutro. La UI muestra "Valor no disponible"/"Sin precio"; **nunca** US$ 0,00 ni pérdida -100%. Los totales de provider/rubro no suman valores fantasma.
- `CryptoDetail` propaga `priceResult`/`valueMissing`: el detalle muestra "No disponible", "PnL no calculable", "—" en lotes, y CTA **"Cargar precio manual"** (diálogo en USD para cripto).
- FCI conserva su fallback existente (valuación por último trade / costo promedio) — el guard sólo aplica cuando no hay ninguna valuación.

## 5. Movimientos V2 (Fase 2)

- Filtros reales: texto libre (ticker/nombre/cuenta/nota), cuenta, activo, tipo (compra/venta/**transferencia**/**swap**/depósito/retiro/interés/PF) y rango de fechas ("Últimos 30 días" por defecto y **efectivo**, 90 días, año, todo, rango custom).
- Paginación: 50 operaciones visibles + "Cargar más".
- Agrupación por operación: las patas con el mismo `operationId`/`transferGroupId`/`groupId` se muestran como un bloque con header ("Transferencia BTC · Binance → Nexo · 3 patas").
- Drawer: sección "patas de la operación" (rol, cuenta, cantidad) con navegación entre patas, tx hash y advertencia. Editar/borrar una pata individual pide confirmación explícita con advertencia de desbalance.
- Lógica pura testeable en `movements-view.ts` / `movements-filter-state.ts`.

## 6. Acciones rápidas (Fase 6)

- **Mis Activos V2**: menú "⋯" en filas cripto/stable → Ver detalle, Ver movimientos (filtrados por cuenta+activo), Comprar, Vender, Transferir, Convertir/Swap, Precio manual. El badge "Sin precio" es un CTA directo a precio manual.
- **Detalle cripto**: botones Transferir, Convertir, Precio manual (si falta cotización o hay manual) y "Ver Movimientos" filtrado por cuenta/activo.
- "Ajustar saldo" NO está implementado (fase futura — el contrato ya reserva `operationKind: 'balance_adjustment'`).

## 7. Cómo se validó

```
npm test          → 19 archivos, 170 tests ✅ (114 preexistentes + 56 nuevos)
npm run build     → ✅
npm run lint      → 0 errores, 151 warnings (misma línea base preexistente)
npx tsc --noEmit  → 0 errores
```

Tests nuevos:

| Archivo | Cobertura |
|---|---|
| `src/domain/prices/resolve-asset-price.test.ts` | NEXO en el mapa CoinGecko, missing ≠ cero, manual como fallback con prioridad y fecha |
| `src/features/portfolioV2/missing-price.test.ts` | Sin precio: qty/costo conservados, PnL undefined (no -100%), totales sin fantasmas, manual valuado |
| `src/domain/operations/crypto-transfer.test.ts` | Caso 1 (0.01 BTC Binance→Nexo: base consolidada constante, PnL 0), Caso 2 (fee 0.0001: fee visible, costo capitalizado), validaciones, agrupación, caja limpia, FIFO destino |
| `src/domain/operations/crypto-swap.test.ts` | BTC→NEXO (PnL -7 USD sobre 0.001 BTC), USDT→NEXO (PnL 0, costo 80), multi-origen BTC+USDT→NEXO (162.22502272 NEXO, caso real), cash-neutral, validaciones |
| `src/pages/movements/components/movements-view.test.ts` | Filtro 30 días real, filtros cuenta/activo/tipo/texto, agrupación (contrato nuevo + legacy transferGroupId), paginación |

## 8. Límites conocidos

1. **PPP only**: el motor consolidado sigue siendo PPP. FIFO/LIFO/Baratos/Manual siguen siendo simulación/detalle (sin cambios respecto al diagnóstico).
2. **Lotes en transferencias**: el destino recibe un lote único al costo promedio (ver §2).
3. **Fee de swap**: sin campo dedicado; implícito en cantidades o como pata origen extra.
4. **Sin anulación/reemplazo**: borrar sigue siendo destructivo; el contrato reserva `operationStatus: 'voided'|'superseded'` para implementarlo. Por ahora hay advertencias fuertes al tocar patas de grupos.
5. **Sin conciliación de saldos** ("Ajustar saldo" deshabilitado).
6. **Datos reales intactos**: no se migró ni tocó ningún movimiento existente. La reparación Binance → Nexo es el Prompt 2 (backup + dry-run + reporte antes/después).
