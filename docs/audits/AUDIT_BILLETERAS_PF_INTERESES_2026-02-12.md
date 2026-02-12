# Auditoría de Resultados: Billeteras y Plazos Fijos

**Fecha:** 12 de Febrero de 2026
**Autor:** Gemini CLI Agent
**Branch:** `audit/results-wallets-pf`

## 1. Resumen Ejecutivo
- **Billeteras (Intereses):** La lógica de cálculo es **correcta**. El resultado "0" que se observa comúnmente se debe a la **ausencia de movimientos tipo `INTEREST`** en la base de datos. El sistema requiere que el usuario active "Auto-accrue" o importe intereses manualmente.
- **Plazos Fijos (Faltan fechas):** Se identificó y **corrigió un bug** en `results-service.ts`. El sistema marcaba erróneamente "Faltan fechas" debido a un error de parseo de fechas ISO (se agregaba un sufijo de hora redundante que invalidaba el timestamp).
- **Estado Actual:** Con el fix aplicado, los Plazos Fijos ahora muestran el devengado correcto si tienen fechas válidas. Las Billeteras seguirán mostrando 0 hasta que se generen datos de interés.

## 2. Hallazgos y Evidencia

### 2.1. Billeteras: Lógica vs. Datos
- **Ubicación Lógica:** `src/features/portfolioV2/builder.ts` y `src/features/dashboardV2/results-service.ts`.
- **Cálculo:** Se suman todos los movimientos `INTEREST` históricos de la cuenta (`interestTotalArs`).
- **Causa del 0:**
    - El seeding inicial (`seed.ts`) no crea movimientos de interés.
    - El hook `use-preferences.ts` define `autoAccrueWalletInterest` como `OFF` por defecto.
    - Sin activar esa opción o importar datos, `interestTotalArs` es 0.
- **Prueba:** Se verificó mediante test unitario (`results-audit.test.ts`) que si se inyecta un `interestTotalArs > 0` simulado, el reporte lo muestra correctamente.

### 2.2. Plazos Fijos: "Faltan fechas"
- **Síntoma:** El UI mostraba "Faltan fechas" y PnL nulo, aun cuando los datos del PF (`pfMeta`) tenían `startDateISO` y `maturityDateISO` correctos.
- **Causa Raíz:**
    - `builder.ts` pasa fechas en formato ISO completo (ej: `2025-01-01T10:00:00.000Z`).
    - `results-service.ts` intentaba forzar UTC agregando `T00:00:00Z` ciegamente:
      ```typescript
      // ANTES (BUG)
      new Date(pfMeta.startDateISO + 'T00:00:00Z')
      // Resultado: "2025-01-01T10:00:00.000ZT00:00:00Z" -> Invalid Date -> NaN
      ```
- **Solución (Aplicada):** Se modificó `computePfAccrued` para detectar si el string ya contiene tiempo antes de agregar el sufijo.
- **Verificación:** Test unitario `results-audit.test.ts` pasando fechas ISO completas confirmó que el cálculo ahora devuelve un valor numérico correcto.

## 3. Planes y Recomendaciones

### Plan A (Actual - Correctitud)
Mantener la lógica actual de Billeteras. El "0" es correcto contablemente si no hay movimientos.
- **Acción:** Educar al usuario sobre la necesidad de activar "Auto-accrue" o importar intereses si desea ver rendimientos históricos.

### Plan B (Estimación - UI Friendly)
Si se desea evitar el "0" en Billeteras cuando falta data histórica:
- **Propuesta:** En `buildWalletItemsTotal`, si `interestTotalArs` es 0 pero hay saldo y TNA, mostrar una estimación (ej: proyección 30d o acumulado estimado desde fecha X).
- **Estado:** No implementado (se priorizó la correctitud del Plan A).

### Corrección Realizada
Se aplicó el fix para Plazos Fijos directamente en esta auditoría dado que era un bug crítico de visualización y de bajo riesgo.

## 4. Archivos Modificados
- `src/features/dashboardV2/results-service.ts`: Fix de parseo de fechas.
- `src/features/dashboardV2/results-audit.test.ts`: Test de reproducción y verificación (nuevo).

## 5. QA Manual Sugerido
1. Abrir `/dashboard` -> Resultados -> Plazos Fijos.
2. Verificar que los PF activos ahora muestren un monto en "Resultado" (PnL) en lugar de "Faltan fechas".
3. Verificar que Billeteras siga mostrando 0 (o el total real si se tienen movimientos).
