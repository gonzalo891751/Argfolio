# Diagnóstico integral — Argfolio Activos y Movimientos

**Fecha:** 2026-07-09  
**Alcance:** auditoría de código y documentación. No se modificaron movimientos, cuentas, instrumentos ni lógica de la aplicación.

## 1. Resumen ejecutivo

Argfolio tiene una base útil para registración manual: los movimientos son la fuente de verdad, las tenencias se recalculan, hay cuentas, precios manuales, lotes visuales, backup JSON y sincronización opcional. No hace falta una reescritura total.

El módulo aún no es confiable para operaciones cripto complejas entre exchanges. El problema es una desalineación entre modelo, UI y cálculos:

- El modelo no representa explícitamente swap/conversión, ajuste de saldo, anulación ni operación compuesta.
- La transferencia atómica existe sólo para caja/billeteras. Cripto no tiene un flujo para transferir entre cuentas ni portación explícita de costo/lotes.
- La UI permite PPP, FIFO, LIFO, Baratos y Manual, pero el motor consolidado usa siempre promedio ponderado.
- NEXO no existe en el mapa local de CoinGecko. No se solicita cotización y una falta de precio puede terminar en US$ 0 y pérdida engañosa.
- Movimientos lee, filtra, ordena y renderiza todo el historial en cliente; no hay paginación real, agrupación por operación ni anulación auditable.

La prioridad debe ser integridad contable y trazabilidad antes de sumar pantallas. No conviene corregir Binance → Nexo editando o borrando registros sin exportar backup y preparar una reconstrucción reversible.

## 2. Stack y arquitectura detectada

| Capa | Implementación real |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6 y React Router 7 |
| UI | Tailwind CSS y componentes propios estilo shadcn |
| Datos de UI | TanStack Query y estado local por página/wizard |
| Persistencia local | Dexie 4 sobre IndexedDB, base argfolio-db |
| Cálculo | src/domain/portfolio y src/domain/assets |
| Cotizaciones | Dólar propio, CEDEAR PPI, cripto CoinGecko público y caché local |
| Sync opcional | Cloudflare Pages Functions + D1 con payload JSON completo |
| Backup | Exportación/importación JSON desde Settings |
| Gestor | npm con package-lock.json |

~~~mermaid
flowchart LR
  M[Movimientos Dexie] --> H[Holdings y costo]
  M --> C[Cash ledger]
  I[Instrumentos] --> H
  A[Cuentas] --> H
  Q[Precios y FX] --> V[Valuación]
  H --> V
  C --> V
  V --> R[useAssetsRows]
  R --> AV2[Mis Activos V2]
  M --> MV2[Movimientos V2]
  M -. sync opcional .-> D1[(Cloudflare D1)]
~~~

## 3. Archivos relevantes inspeccionados

### Datos y sincronización

- src/domain/types.ts, src/db/schema.ts.
- src/db/repositories/movements.ts, accounts.ts, instruments.ts y manual-prices.ts.
- src/domain/sync/local-backup.ts.
- src/sync/remote-sync.ts, functions/api/movements.ts, functions/api/sync/push.ts, functions/api/sync/bootstrap.ts y migrations/0001_sync_core.sql.

### Cálculo y cotizaciones

- src/domain/portfolio/computeHoldings.ts, average-cost.ts, fifo.ts, lot-allocation.ts, computePnL.ts, cash-ledger.ts y valuation.ts.
- src/domain/assets/valuation.ts, src/features/assets/useAssetsRows.ts y src/hooks/use-computed-portfolio.ts.
- src/hooks/use-crypto-prices.ts, src/data/providers/crypto-coingecko.ts, src/domain/prices/price-result.ts y price-cache.ts.

### UI

- src/pages/assets-v2.tsx, src/features/portfolioV2/builder.ts, usePortfolioV2.ts y types.ts.
- src/pages/crypto-detail.tsx, cedear-detail.tsx y src/components/assets/ManualPriceDialog.tsx.
- src/pages/movements/MovementsPageV2.tsx y sus componentes/wizards para crypto, wallet, FCI y CEDEAR.

También se revisaron README.md, docs/AI_HANDOFF.md, auditorías existentes de activos/resultados/transferencias, migraciones e inventario de tests.

## 4. Modelo de datos actual

Movement es el hecho contable central: fecha, tipo, cuenta, instrumento opcional, cantidad, precio, moneda de operación, total, comisión, FX y metadata. Instrument define símbolo/categoría/moneda nativa; Account define broker, exchange, banco o billetera.

Las tenencias no se persisten como saldo: se derivan de movimientos. Es una buena decisión para auditabilidad.

Los tipos presentes son BUY, SELL, DEPOSIT, WITHDRAW, FEE, DIVIDEND, INTEREST, TRANSFER_IN, TRANSFER_OUT, BUY_USD y SELL_USD. Faltan tipos o entidad equivalente para:

- swap/conversión;
- ajuste de saldo con motivo;
- reversión/anulación sin borrar el original;
- operación compuesta;
- conciliación con saldo observado, diferencia y evidencia.

groupId y meta.transferGroupId existen pero son opcionales; no hay una entidad de operación ni regla que exija dos patas correctas. Tampoco se obliga a editar/borrar ambas patas juntas.

Dexie es la fuente operativa local. D1 replica payloads cuando sync está activado. El backup JSON cubre cuentas, instrumentos, movimientos, snapshots, precios manuales y preferencias.

Riesgo: las eliminaciones remotas son DELETE físicos, no tombstones. Un movimiento eliminado puede reinyectarse desde otro dispositivo durante bootstrap. Eliminar no equivale a anular con auditoría.

## 5. Flujo actual de movimientos

1. MovementsPageV2 obtiene todos los movimientos y los filtra/ordena en memoria.
2. El wizard deriva a flujos por activo.
3. Crypto expone sólo Compra/Venta. En una cuenta EXCHANGE puede crear una contrapartida automática de USDT con linkedMovementId y reason auto_usdt_balance.
4. Wallet expone Ingreso, Egreso y Transferencia. Esta última crea TRANSFER_OUT y TRANSFER_IN dentro de una transacción Dexie, con grupo y contrapartes.
5. CEDEAR y FCI tienen compra/venta; FCI tiene una intención pendiente de corrección.
6. Crear/editar/eliminar invalida queries y recalcula cartera. El drawer edita, duplica o elimina un registro individual.

La transferencia de billetera es el patrón más sólido actual, pero no puede generalizarse a especies sin portación de costo/lotes. La edición/eliminación individual puede romper pares y grupos.

## 6. Cálculo actual de tenencias

computeHoldings agrupa por instrumento + cuenta y llama a computeAverageCost. No existe un inventario de lotes transferible entre cuentas.

computeAverageCost suma cantidad/base en compras, depósitos y TRANSFER_IN. En ventas, retiros y TRANSFER_OUT reduce base proporcionalmente. computeCashLedger lleva caja por cuenta/moneda e infiere saldo inicial al detectar una secuencia negativa.

Consecuencias:

- Una transferencia de especie puede dar al destino base proveniente de totalAmount, totalUSD o unitPrice de la entrada, en vez de copiar costo/lotes del origen.
- No hay validación central que impida sobreventa o saldo negativo de instrumentos.
- El saldo inicial inferido evita negativos visibles, pero es evidencia de historial incompleto, no conciliación formal.

## 7. Cálculo actual de precio promedio / cost basis

El cálculo consolidado es PPP. computeHoldings llama siempre a computeAverageCost y no consulta argfolio.cryptoCostingMethod.

Hay un motor FIFO y un asignador PPP/FIFO/LIFO/Baratos/Manual. Se usan en detalles y simuladores. La selección se persiste como meta.costingMethod y meta.allocations, pero computeAverageCost y computeRealizedPnL no consumen esos campos.

| Método mostrado | Efecto real en saldo/costo/PnL consolidado |
| --- | --- |
| PPP | Sí; es el método real |
| FIFO | Sólo simulación/detalle |
| LIFO | Sólo simulación/detalle |
| Baratos | Sólo simulación/detalle |
| Manual | Sólo simulación/detalle |

Las comisiones tampoco tienen política única: el ledger de caja las contempla, pero el PnL realizado usa cantidad × precio de venta y no descuenta fee. Puede sobreestimar resultados.

## 8. Cálculo actual de ganancia o pérdida

computeAssetMetrics calcula PnL no realizado como mercado menos base. computeRealizedPnL recorre ventas con promedio por instrumento + cuenta y acumula realizado por instrumento/cuenta.

Hallazgos:

- El PnL realizado no usa asignaciones de lotes ni preferencia de costeo.
- TRANSFER_IN se toma como alta en computeRealizedPnL, mientras TRANSFER_OUT no reduce su posición auxiliar. Esto puede distorsionar ventas futuras en destino.
- Se separan realizado/no realizado técnicamente, pero no hay traza completa desde el total hasta asientos/lotes.
- computeAssetMetrics devuelve null para valor/PnL sin precio, pero agregadores/UI convierten null a cero en varios puntos.

## 9. Diagnóstico específico: cripto

### Lo que funciona

- USDT, USDC, DAI y BUSD se fijan a USD 1.
- BTC, ETH, BNB y varios tokens conocidos tienen mapeo CoinGecko.
- El wizard registra cantidad, precio, fee y FX.
- El detalle muestra lotes y simulador de venta.

### Problemas críticos

1. **NEXO no está en COINGECKO_MAP.** El proveedor no solicita su precio.
2. **Sin precio no es semánticamente seguro.** La fila se conserva con badge, pero su valor puede ser cero y la base mantenerse; la pérdida resultante no representa mercado.
3. **No hay transferencia cripto en UI.** Sólo Compra/Venta; usarlas para Binance → Nexo altera costo/PnL.
4. **No hay swap formal.** El auto-balance USDT es una heurística, no una operación compuesta. No cubre USDC, múltiples fuentes de fondeo, NEXO ni fee multi-activo.
5. **Auto-balance incompleto posible.** Busca USDT existente de forma opcional; sin instrumento puede escribir un movimiento sin instrumentId, ignorado por holdings.
6. **Precio manual no es accesible para cripto.** Repositorio y diálogo existen; el motor prioriza manual. No se encontró caller del diálogo en UI actual.

## 10. Diagnóstico específico: Binance → Nexo

No hay datos personales en el repositorio para verificar asientos exactos. Las cifras del pedido son referencias visuales.

El comportamiento informado coincide con el código:

- BTC/BNB/USDT aún en Binance sugieren transferencias faltantes o cargadas como ventas/compras.
- NEXO sin precio se explica por ausencia del mapeo CoinGecko y semántica de valor faltante.
- La simulación venta BTC → compra USDT → compra NEXO son tres asientos independientes, no un swap financiado por dos orígenes.
- La diferencia BTC de referencia entre 0.01730431 y 0.01729650 es -0.00000781 BTC. Debe clasificarse como fee, transferencia pendiente o ajuste, no borrarse.

| Cuenta / activo | Saldo real de referencia | Tratamiento correcto |
| --- | ---: | --- |
| Nexo BTC | 0.01729650 BTC | Transferencia desde Binance, conservando costo/lotes; ajustar sólo diferencia demostrada |
| Nexo NEXO | 162.22502272 NEXO | Swap compuesto; costo de BTC + USDT/USDC y fees |
| Nexo USDC | 20.031414 USDC | Transferencia o depósito según evidencia |
| Nexo BNB | 0.03341429 BNB | Transferencia desde Binance, conservando costo/lotes |
| Binance | saldo final real | Llegar a cero sólo tras conciliar especie y dust/fees |

## 11. Problemas detectados

### 11.1 Bugs probables

- **P0:** NEXO sin cotización por falta de mapeo.
- **P0:** precio ausente convertido en pérdida/valor cero.
- **P0:** FIFO/LIFO/Baratos/Manual presentado como contable pero no aplicado.
- **P0:** transferencia de especie no preserva costo/lotes.
- **P1:** PnL realizado sin fee de venta.
- **P1:** tratamiento no simétrico de transferencias en PnL.
- **P1:** auto-balance USDT no atómico con el trade.
- **P1:** editar/borrar una pata rompe un grupo.

### 11.2 Problemas de modelo de datos

- No existe Operation o JournalEntry con patas, estado y auditoría.
- No hay motivo normalizado para ajustes.
- No hay snapshot/carry-over de costo/lotes transferidos.
- No hay fuente/evidencia para comprobantes, export CSV o tx hash.
- Currency es una unión corta; para tokens se usa USD como moneda nativa, útil para precio pero no como representación de especie.

### 11.3 Problemas de UX

- Faltan Transferir, Convertir, Ajustar saldo y Conciliar desde Mis Activos.
- El detalle cripto no ofrece transferencia, swap ni precio manual contextual.
- Movimientos tiene lista plana, búsqueda y cuatro chips. El botón Últimos 30 días no aplica un filtro real.
- Faltan filtros por cuenta, activo, tipo completo, moneda y fecha; no hay agrupación por operación/día.
- Borrar es destructivo en vez de anular/revertir.

### 11.4 Problemas de cálculo

- computeTotals, useAssetsRows y builder V2 aplican fallbacks distintos.
- La base depende de totalAmount, totalUSD, unitPrice y FX opcionales, sin contrato validado por tipo.
- No se puede separar con fiabilidad PnL de BTC, costo de NEXO y fees en una conversión múltiple.
- Resultado por cuenta/categoría existe parcialmente, sin drill-down auditable.

### 11.5 Problemas de persistencia o performance

- La tabla trae/ordena todo el historial; sin paginación/virtualización se degradará.
- Precios invalidan cálculos globales; auditorías previas registran riesgo de flicker.
- Sync no usa tombstones ni retry queue persistente.
- Snapshots pueden divergir al corregir movimientos pasados.

## 12. Qué debería hacer correctamente el sistema

### Transferencia

- Crear una operación TRANSFER con dos patas, mismo activo/cantidad neta.
- Cambiar custodia, no realizar PnL.
- Mover costo y lotes en igual orden.
- Registrar fee de red como pata o ajuste explícito.
- Editar/anular el grupo completo.

### Swap

- Una operación compuesta con varias salidas, entradas y fees.
- Calcular PnL realizado de cada origen según método real.
- Dar al destino costo verificable de patas y fees capitalizables.
- Mostrar una sola tarjeta con origen, destino, fee, FX y PnL.

### Ajuste y conciliación

- Comparar calculado contra declarado por cuenta, activo y fecha.
- Proponer diferencia, exigir motivo, guardar evidencia.
- No confundir un ajuste con compra/venta/transferencia.
- Definir política para fee, rounding, depósito, rendimiento, airdrop y corrección.

### Precio ausente

- Mantener cantidad y costo visibles.
- Mercado, PnL no realizado y ROI deben ser no disponibles, nunca cero.
- Exponer estado/fuente/fecha y precio manual.

## 13. Propuesta de rediseño funcional

Evolución mínima compatible:

1. Agregar entidad Operation, o extender Movement con contrato de grupo obligatorio.
2. Modelar legs/postings: cuenta, instrumento, delta de cantidad, valor/costo y rol.
3. Mantener Movement como posting legacy para lectura compatible, agregando operationId, legRole, status y replacesOperationId.
4. Sumar flujos Transferir, Swap, Ajustar saldo y Conciliar.
5. Implementar Anular y reemplazar en vez de edición destructiva.

Los legacy pueden seguir calculándose con reglas actuales mientras los nuevos grupos usan el modelo enriquecido y una herramienta de conversión asistida.

## 14. Propuesta de rediseño técnico

~~~ts
type OperationKind = 'TRADE' | 'TRANSFER' | 'BALANCE_ADJUSTMENT' | 'DEPOSIT' | 'WITHDRAW' | 'INCOME' | 'VOID'

interface Operation {
  id: string
  kind: OperationKind
  occurredAtISO: string
  status: 'posted' | 'voided' | 'superseded'
  notes?: string
  source?: { provider?: string; externalId?: string; txHash?: string }
}

interface OperationLeg {
  id: string
  operationId: string
  accountId: string
  instrumentId?: string
  quantityDelta: number
  valuationUsd?: number
  feeRole?: 'network' | 'provider' | 'spread'
  lotAllocations?: Array<{ lotId: string; quantity: number; costUsd: number }>
}
~~~

Puede persistirse en nuevas tablas Dexie/D1 o JSON versionado durante transición. Lo esencial es una proyección de inventario/lotes única.

Reglas:

- Un motor de inventario consume método de costeo y asignaciones persistidas.
- Transferir mueve lotes/costo sin PnL.
- Swap usa asignaciones en salidas.
- Fee sigue una política única testeada.
- PriceResult llega a UI sin convertir missing en cero.
- Guardar valida saldo, cuentas distintas, pares de transferencia y suma de patas.

## 15. Propuesta de rediseño UI/UX

### Mis Activos

Acciones por activo/cuenta:

- Ver detalle y movimientos filtrados.
- Comprar/vender.
- Transferir.
- Convertir/swap.
- Ajustar saldo.
- Editar precio manual.
- Conciliar cuenta.

Abrir el mismo wizard contextual, con activo/cuenta ya seleccionados.

### Movimientos

- Últimos 30 días reales como vista inicial.
- Filtros por cuenta, activo, tipo, estado, moneda y rango.
- Paginación cursor o virtualización local.
- Agrupar por día y operación compuesta; transferencia/swap plegable.
- Drawer con patas, fuentes, costo, PnL y auditoría.
- Export CSV filtrado y backup JSON completo.

### Conciliación

| Activo | Argfolio | Declarado | Diferencia | Acción |
| --- | ---: | ---: | ---: | --- |
| BTC | 0.01730431 | 0.01729650 | -0.00000781 | Fee o ajuste |
| NEXO | 0 | 162.22502272 | +162.22502272 | Crear swap/corrección |
| USDC | 0 | 20.031414 | +20.031414 | Transferencia/depósito |
| BNB | 0 | 0.03341429 | +0.03341429 | Transferir desde Binance |

Los importes finales deben provenir de un extracto fechado.

## 16. Plan de migración o corrección de datos

### Preparación

1. Exportar JSON desde Settings y conservarlo fuera del navegador.
2. Registrar fingerprint/saldos y comprobar sync antes de intervenir.
3. Exportar movimientos afectados y extractos Binance/Nexo con fecha, fees y hashes.
4. Ensayar en una copia local restaurable.

### Reconstrucción Binance → Nexo

1. Inventariar saldos inicial/final por especie y fecha; no asumir cero si existe dust.
2. Marcar los asientos simulados BTC/USDT/NEXO que se reemplazarán. Hoy documentar su vínculo; con modelo nuevo anularlos, no borrarlos.
3. Crear transferencias Binance → Nexo para BTC, BNB y stablecoins, con dos patas y carry-over de costo/lotes.
4. Crear un swap para 162.22502272 NEXO con patas de BTC y USDT/USDC, entrada NEXO y fees.
5. Aplicar diferencia BTC sólo tras identificarla; preferir fee demostrada.
6. Cargar cotización NEXO desde fuente/manual; mientras falte, mostrar mercado/PnL como no disponible.
7. Recalcular y comparar antes/después por activo, cuenta, cantidad, costo y PnL.

## 17. Riesgos

- Cambiar costeo retrospectivamente altera PnL; versionar política y mostrar impacto.
- Migrar sin datos de origen puede inventar costo; permitir costo desconocido.
- Borrar afecta sync y snapshots; usar backup/anulación/reemplazo.
- Precio manual sin fuente/fecha puede ocultar mercado no disponible.
- MovementWizard, assets-v2 y builder son grandes; aislar dominio y pruebas primero.

## 18. Quick wins

1. Catálogo de precios configurable con NEXO y override manual accesible.
2. Mostrar — y PnL no calculable ante precio faltante.
3. Etiquetar FIFO/LIFO/Manual como simulador hasta implementarlos de verdad.
4. Filtros efectivos por fecha/cuenta/activo y límite inicial en Movimientos.
5. Agrupar por groupId las transferencias wallet existentes.
6. Tests de transferencia de especie, fee de venta, NEXO sin precio y swap parcial.

## 19. Cambios recomendados por prioridad

| Prioridad | Cambio | Resultado |
| --- | --- | --- |
| P0 | Propagar PriceResult missing y precio manual cripto | NEXO no vale cero artificialmente |
| P0 | Transferencia de especie con carry-over | Binance → Nexo no genera venta/PnL falso |
| P0 | Método de costeo único y efectivo | Resultado coincide con selección |
| P0 | Swap compuesto | Compra NEXO trazable |
| P1 | Ajuste y conciliación | Diferencias auditadas |
| P1 | Anular/reemplazar grupos | Corrección reversible |
| P1 | Fees en PnL y pruebas de invariantes | Resultados confiables |
| P2 | Paginación/virtualización/filtros | Historial escalable |
| P2 | CSV filtrado, evidencia y auditoría | Mantenimiento simple |
| P3 | Importador Binance/Nexo | Carga más rápida |

## 20. Qué NO conviene hacer

- No convertir transferencias pasadas en ventas/compras para cuadrar.
- No resetear promedio al mover entre cuentas propias.
- No asignar precio cero a NEXO.
- No exponer métodos de costeo que no gobiernan el motor.
- No borrar histórico sin backup y vínculo de reemplazo.
- No reescribir todo antes de aislar contratos y tests.

## 21. Preguntas pendientes para el usuario

1. ¿Cuál es el método de costeo oficial por categoría y desde cuándo aplica?
2. ¿Moneda base de costo/PnL cripto: USD, ARS o ambas?
3. ¿Cómo se tratan fees de red: cantidad, costo o gasto?
4. ¿Hay CSV/extractos Binance y Nexo con fechas, trades, transferencias y fees?
5. ¿Cuál es política de costo para airdrop/reward/interés?
6. ¿La fase futura es manual asistida o también importadores?
7. ¿Binance debe llegar a cero exacto o mostrar dust real?

## 22. Prompt sugerido para la próxima etapa de implementación

~~~text
Actuá como Staff Engineer y Product Engineer financiero. Leé docs/ARGFOLIO_DIAGNOSTICO_ACTIVOS_MOVIMIENTOS.md y docs/AI_HANDOFF.md.

Implementá una primera fase sin reescritura:
1. Modelo tipado y testeado de operaciones compuestas para transferencia, swap y ajuste.
2. Transferencia de especie entre cuentas conservando cantidad, costo y lotes, sin PnL.
3. Swap multi-origen/multi-fee con PnL de salidas y costo de destino.
4. PPP/FIFO/LIFO/Baratos/Manual efectivo en motor, o restringir UI a PPP.
5. Precio faltante como no disponible y precio manual cripto; catálogo configurable con NEXO.
6. UI de conciliación por cuenta.

Restricciones:
- Dexie sigue fuente local; D1 réplica opcional.
- Lectura compatible con movimientos legacy.
- No borrar/migrar automáticamente; implementar backup, dry-run, reporte antes/después y rollback.
- No tocar PF/Finanzas Express salvo necesidad de compilación.
- Tests: BTC Binance→Nexo, BTC+USDT→NEXO, fee, NEXO sin precio/manual y ajuste 0.00000781 BTC.
- Implementar por fases pequeñas y validar npm run build, npm run lint y npm test.
~~~

## Validación de este diagnóstico

- Se inspeccionaron repo, documentación, schema Dexie, migraciones D1, repositorios, motor, precios, páginas y wizards citados.
- Cambios de esta fase: sólo documentación.
- npm run build: falló por marcadores de conflicto de merge en src/pages/settings.tsx y src/sync/remote-sync.ts. El prebuild advirtió además que falta data/comafi-cedears.xlsx y mantuvo el JSON existente.
- npm run lint: falló por esos mismos dos errores de parsing; emitió 150 warnings adicionales.
- npm test: pasó: 15 archivos y 114 tests.
