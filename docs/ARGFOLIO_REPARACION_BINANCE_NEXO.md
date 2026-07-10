# Reparación asistida Binance → Nexo

Fecha: 2026-07-10  
Estado: implementada detrás de `?debug=1`; no se ejecutó sobre datos reales.

## Problema que resuelve

La carga manual original puede haber representado la migración Binance → Nexo como una venta de BTC, una compra intermedia de USDT y una compra aproximada de NEXO. Esa forma altera custodia, costo y PnL. La herramienta reconstruye el caso como hechos auditables:

- transferencias entre cuentas propias, sin PnL;
- conversiones BTC/USDT → NEXO, con PnL realizado en las patas vendidas;
- diferencias pequeñas de saldo clasificadas por el usuario;
- reemplazo lógico del historial legacy, nunca borrado físico.

Los movimientos siguen siendo la fuente de verdad. No se agregó una tabla ni una migración Dexie: el contrato vive en `Movement.meta`.

## Estados contables

`meta.operationStatus` admite:

- `posted` o ausente: el movimiento participa normalmente;
- `superseded`: fue reemplazado y queda sólo como historial;
- `voided`: fue anulado y queda sólo como historial.

Los motores de tenencias, costo promedio, FIFO, caja, PnL, PF, Dashboard y Portfolio V2 filtran `superseded`/`voided`. Los asistentes de venta también los excluyen al calcular disponibilidad. Movimientos V2 permite filtrar activos, reemplazados, anulados o todos y muestra badges. Un grupo parcialmente reemplazado se marca como `Estado mixto`.

## Acceso y flujo seguro

1. Abrir `/settings?debug=1`.
2. Buscar **Reparación asistida Binance → Nexo**.
3. Revisar targets, fecha de reconstrucción y precio estimado de NEXO.
4. Generar el dry-run.
5. Revisar y, si corresponde, desmarcar candidatos.
6. Revisar cada transferencia, swap y ajuste propuesto.
7. Clasificar explícitamente los ajustes pendientes. Un fee sólo puede ser negativo y un reward sólo positivo.
8. Comparar Antes / Después / Target / Diferencia.
9. Leer todos los warnings.
10. Confirmar y aplicar.

La aplicación descarga automáticamente un JSON antes de abrir la transacción. Si la descarga falla, no se escribe nada. El botón de apply no alcanza por sí solo: el servicio exige también `confirmed: true` y rechaza ajustes con motivo `unknown`.

## Dry-run

`buildBinanceNexoRepairPlan()` es puro: no usa Dexie ni modifica los arrays recibidos. Devuelve:

- ID y timestamp del plan;
- confianza y warnings;
- candidatos con motivo y confianza;
- selección propuesta para `superseded`;
- movimientos nuevos;
- snapshots antes/después;
- conciliación antes/después;
- fingerprint canónico de todos los movimientos de origen.

Los candidatos se limitan a las cuentas Binance/Nexo y a una ventana de dos días alrededor de la fecha elegida. Se reconocen las cantidades conocidas y también se incluyen patas legacy conectadas por `operationId`, `transferGroupId`, `groupId`, `relatedMovementId` o `linkedMovementId`. Una selección parcial de un grupo genera warning y baja la confianza.

El fingerprint incluye el movimiento completo con claves ordenadas. Si cualquier fila cambia entre dry-run y apply, se cancela antes del backup/escritura y se exige regenerar el plan.

## Conciliación

`reconcileCryptoBalances()` compara cantidad calculada contra target por cuenta e instrumento. No toca DB. Soporta cualquier cripto existente en Instrument y usa por defecto:

- BTC/BNB: `1e-8`;
- tokens y stables: `1e-6`.

Cada fila devuelve `currentQty`, `targetQty`, `diffQty`, estado y acción sugerida. Las sugerencias no se aplican automáticamente.

Targets iniciales:

| Cuenta | Activo | Target |
| --- | --- | ---: |
| Nexo | BTC | 0.01729650 |
| Nexo | NEXO | 162.22502272 |
| Nexo | USDC | 20.031414 |
| Nexo | BNB | 0.03341429 |
| Binance | BTC / BNB / USDT / USDC | 0 |

## Operaciones que propone para el caso conocido

El plan parte del estado real de Argfolio. Sólo propone una transferencia cuando Binance tiene saldo calculado suficiente; nunca fuerza un saldo negativo.

### Transferencias

- BTC Binance → Nexo: hasta llegar a 0.01857219 BTC antes de los swaps y 0.01729650 BTC después;
- BNB Binance → Nexo: hasta 0.03341429 BNB;
- USDT Binance → Nexo: hasta 40.735376 USDT necesarios para la conversión visible.

Cada transferencia tiene `TRANSFER_OUT` + `TRANSFER_IN`, costo PPP portado y cero PnL.

### Swaps

Por fidelidad histórica se crean cinco operaciones separadas, cada una con pata origen `SELL` y destino `BUY`:

- 40.735376 USDT → 54.62027067 NEXO;
- 0.00079592 BTC → 67.02356636 NEXO;
- 0.00015993 BTC → 13.50000000 NEXO;
- 0.00015907 BTC → 13.46945210 NEXO;
- 0.00016077 BTC → 13.50000000 NEXO.

Total visible: 162.11328913 NEXO. El precio de ejecución BTC se estima desde el precio NEXO editable (inicialmente US$ 0.74) y se muestra un warning porque afecta costo y PnL. Debe contrastarse con el extracto antes de confirmar.

### Diferencia NEXO

`162.22502272 - 162.11328913 = +0.11173359 NEXO` se propone como ajuste positivo con motivo `unknown`, desactivado hasta elegir:

- reward/interés;
- redondeo;
- depósito o transferencia externa;
- corrección manual.

No se atribuye una causa. Si se clasifica como reward pasa a `INTEREST`, `operationKind=income` y costo cero. Una corrección manual conserva el costo promedio para no crear una ganancia de mercado artificial.

### Diferencia USDC

Si existen 19 USDC visibles y el target es 20.031414, se propone `+1.031414 USDC` como ajuste sin clasificar. No queda seleccionado hasta que el usuario confirme si fue depósito, transferencia externa u otra corrección. Diferencias mayores a 2 USDC no se convierten en ajuste: quedan como revisión manual.

## Apply, sync y atomicidad

`applyRepairPlanWithStore()`:

1. valida modo dry-run, confirmación, IDs y clasificación;
2. verifica que importes, identidad contable y metadata protegida coincidan con el plan;
3. valida fingerprint;
4. descarga backup;
5. vuelve a validar dentro de la transacción;
6. marca candidatos con `operationStatus=superseded` y trazas del plan;
7. inserta patas nuevas como `posted`;
8. sincroniza el batch por el flujo D1 existente.

No llama a `delete` ni `bulkDelete`. Si una escritura local falla, Dexie revierte todo. El sync remoto ocurre después del commit local; si falla, el resultado queda `ok` local con warning visible. Como D1 es autoritativo al arrancar, no se debe editar desde otro dispositivo hasta reconciliar ese fallo.

## Rollback

El resultado exitoso ofrece **Revertir esta reparación** con una segunda confirmación. El rollback:

1. descarga otro backup;
2. en una transacción marca las patas nuevas `voided`;
3. reactiva como `posted` los legacy cuyo `supersededByOperationId` coincide con el plan;
4. conserva timestamps y `rollbackOfRepairPlanId`;
5. sincroniza las actualizaciones por batch.

Tampoco borra filas. Un segundo rollback no encuentra efectos activos y se rechaza. Como alternativa forense, el JSON previo conserva todos los datos, pero una importación merge por sí sola no elimina patas creadas; por eso se prefiere el rollback del panel.

## Precio NEXO faltante

La reparación conserva cantidad y costo aunque no exista cotización actual. La UI debe mostrar `Sin precio`, valor/PnL no calculable y nunca US$ 0 o -100 %. Luego puede cargarse un precio manual desde Mis Activos o el detalle cripto.

## Validación posterior

- Movimientos: buscar por `repairPlanId`, usar estado `Todos` y abrir los grupos.
- Mis Activos: comparar Binance y Nexo contra targets.
- Confirmar que las transferencias no generaron PnL.
- Confirmar PnL realizado de cada BTC → NEXO con el precio de ejecución validado.
- Confirmar que legacy aparece `Reemplazado`.
- Sin precio NEXO: valor y PnL deben quedar no disponibles.
- Con precio manual NEXO: verificar valuación y timestamp/fuente manual.

## Límites conocidos

- No importa extractos ni consulta Binance/Nexo; las cantidades provienen del usuario.
- El costeo consolidado continúa siendo PPP. FIFO/LIFO/manual siguen siendo simulación en otras pantallas.
- El precio de ejecución NEXO inicial es un supuesto editable, no evidencia externa.
- Binance puede quedar con dust o stables remanentes. El plan lo reporta; no inventa una salida.
- El apply local y el push D1 no forman una transacción distribuida; los fallos remotos se informan para reconciliación.

## QA manual

1. Abrir la app con `?debug=1` y entrar a Settings.
2. Generar dry-run sin aplicar.
3. Cambiar un target y confirmar que el plan previo desaparece.
4. Regenerar y revisar candidatos, cuenta, confianza y motivo.
5. Desmarcar una pata vinculada y confirmar warning de selección parcial.
6. Revisar transferencias, cinco swaps y ajustes.
7. Confirmar que un ajuste `unknown` no puede seleccionarse/aplicarse.
8. Clasificar NEXO y USDC; revisar el reporte proyectado.
9. Exportar backup manual.
10. En una copia de datos, aplicar y verificar resultados/IDs.
11. Ver Movimientos con estados Activos, Reemplazados, Anulados y Todos.
12. Ejecutar rollback y confirmar nuevas patas anuladas + legacy reactivados.

