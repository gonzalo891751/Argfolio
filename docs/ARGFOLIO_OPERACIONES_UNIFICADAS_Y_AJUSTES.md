# Operaciones unificadas, ajustes y trazabilidad de caja

Fecha: 2026-07-10  
Estado: implementado en código; ningún movimiento productivo fue modificado.

## Resumen

Argfolio usa ahora un único contrato de entrada para abrir operaciones desde Nuevo Movimiento, Mis Activos, detalle cripto y detalle de billetera. Las operaciones compuestas siguen usando los builders de dominio existentes y el cash ledger deja de depender de que las patas de un swap se cancelen por igualdad flotante.

## Causa confirmada del saldo Binance ARS 119,31

La auditoría de solo lectura sobre `https://argfolio.pages.dev` encontró una sola contribución:

| Fecha | Cuenta | Movimiento | Cantidad | Precio | Total mostrado |
| --- | --- | --- | ---: | ---: | ---: |
| 2026-07-10 03:03 | Binance | Venta USDT standalone | 119,30695 USDT | US$ 1,00 | US$ 119,31 |

El drawer productivo además muestra `TOTAL ARS HIST. $187.110,28` y FX cripto 1568. El saldo de la billetera, sin embargo, era exactamente ARS 119,31 y la vista anterior no podía listar el movimiento dentro de movimientos ARS.

Causa técnica: `CryptoBuySellWizard` escribía automáticamente `meta.settlementCurrency='ARS'` para toda venta de stablecoin, pero no escribía `meta.settlementArs`. `cash-ledger.ts` resolvía entonces el settlement ARS usando `totalAmount=119.30695`, que estaba expresado en USD, y lo acreditaba como ARS 119,30695. No fue un residuo de redondeo del swap anterior.

No se obtuvo ni se modificó el ID interno porque la UI productiva no lo expone. La fila queda identificada de forma inequívoca por fecha, cuenta, tipo y cantidad; la nueva tabla de composición expone el `movementId` después de desplegar esta versión.

## Regla de cash settlement

- Un swap con `meta.operationKind='swap'` es cash-neutral por contrato. Sus SELL/BUY no pasan por caja, aunque los totales tengan distinta precisión o falte una pata legacy.
- Una transferencia o ajuste cripto es en especie y no toca caja.
- Una venta real de stablecoin acredita caja sólo con destino explícito:
  - ARS: requiere `settlementCurrency='ARS'` y `settlementArs > 0`;
  - fiat USD: requiere `settlementCurrency='USD'`.
- Un settlement ARS legacy sin importe real tiene impacto cero y aparece en la traza como `missing_settlement_metadata`.
- Una venta legacy sin `settlementCurrency` conserva el fallback histórico a `tradeCurrency`; las ventas nuevas no pueden confirmarse sin elegir destino.

## Contrato unificado de prefill

`src/pages/movements/movement-wizard-prefill.ts` define `MovementWizardPrefill`:

```ts
type MovementWizardPrefill = {
  assetClass?: 'crypto' | 'wallet' | 'cedear' | 'fci' | 'pf' | 'currency'
  operationMode?: 'buy' | 'sell' | 'transfer' | 'swap' | 'adjust_balance' | 'deposit' | 'withdraw'
  accountId?: string
  destinationAccountId?: string
  instrumentId?: string
  symbol?: string
  currency?: Currency
  realBalance?: number
  quantity?: number
  datetimeISO?: string
  note?: string
}
```

`MovementsPageV2` consume `location.state.movementWizardPrefill` y abre `MovementWizard` directamente en la clase correspondiente. Los helpers `cryptoMovementPrefill()` y `walletMovementPrefill()` son usados por detalles y filas, por lo que esas entradas producen el mismo contrato.

## Operaciones cripto

Nuevo Movimiento > Cripto muestra una grilla responsive con:

- Comprar;
- Vender;
- Transferir;
- Convertir;
- Ajustar saldo.

Transferir reutiliza `buildCryptoTransferMovements()`. El diálogo ahora es ancho, responsive, muestra stepper, cards de origen/destino, cantidad enviada/recibida, fee y resumen de costo/PnL.

Convertir reutiliza `buildCryptoSwapMovements()`, soporta múltiples fuentes y muestra valor entregado, costo del destino y PnL estimado. La grilla de patas deja de tener columnas fijas en mobile.

Ajustar saldo reutiliza `buildCryptoBalanceAdjustmentMovement()`. Compara saldo Argfolio contra saldo real, exige motivo, bloquea reward negativo y fee positivo, muestra costo/impacto y no genera caja ni una venta. El caso BTC Nexo `0.01730431 -> 0.01729650` produce `-0.00000781 BTC`.

## Operaciones de billetera

El mismo wizard ofrece Ingreso, Egreso, Transferencia y Ajustar saldo. El ajuste contextual:

- precarga cuenta y moneda;
- enfoca el saldo real;
- calcula automáticamente dirección e importe;
- exige motivo: gasto, ingreso, interés, comisión, corrección u otro;
- muestra before/after en confirmación;
- persiste `operationKind='balance_adjustment'`, `legRole='cash'` y `walletAdjustmentReason`.

Ejemplo: sistema 689041 / real 650000 produce diff -39041 y egreso 39041.

## Composición del saldo

`traceCashBalanceContributions()` devuelve por cuenta/moneda:

- movimiento y operationId;
- fecha/tipo/símbolo;
- impacto;
- razón contable;
- issues de swap/settlement;
- saldo inicial inferido cuando corresponda.

El detalle de billetera muestra `Cómo se compone este saldo`, con impacto y acumulado. Los swaps y settlements inválidos aparecen con importe cero y alerta; la tabla nunca repara ni borra.

## Corrección segura del saldo existente

La corrección del motor deja de computar los ARS 119,31 sin tocar el movimiento. Para corregir además holdings/PnL histórico, primero confirmar la intención real:

1. Si la venta fue una corrección de cantidad: marcar la SELL como `superseded` y crear un ajuste negativo USDT por 119,30695 con motivo `manual_correction` o `rounding`.
2. Si fue parte de una conversión: supersede de la SELL y creación del swap correcto con todas sus patas.
3. Si hubo cobro ARS real: conservar/reemplazar por venta con `settlementArs` igual al importe efectivamente acreditado (el drawer sugiere ARS 187.110,28, pero debe contrastarse con el comprobante).

No borrar físicamente y no crear un ajuste ARS automático para ocultar el bug.

## QA realizado

- Auditoría productiva de solo lectura: saldo ARS 119,31 y movimiento USDT confirmados.
- Local desktop: Nuevo Movimiento > Cripto muestra cinco operaciones.
- Local mobile 390x844: cards cripto en una columna y footer dentro del viewport; no hay overflow del modal. El ticker global animado conserva contenido ancho propio, fuera del alcance del wizard.
- Local mobile: Billetera muestra las cuatro operaciones y sin overflow horizontal.
- No se confirmó ningún formulario ni se modificaron datos reales.

## Límites conocidos

- La versión productiva auditada todavía no incluye la nueva tabla, por eso el ID interno de la SELL no estaba visible.
- El ajuste no decide por el usuario si el hecho fue fee, corrección, transferencia externa o conversión.
- PPP continúa siendo el método contable consolidado; el transporte granular de lotes sigue fuera de alcance.
- El sync local/D1 no es una transacción distribuida; se mantienen los warnings y procedimientos del documento de reparación Binance-Nexo.
