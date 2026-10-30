# Propuesta: historial completo aunque no abras la app

_30/10/2026_

## Dónde estamos

- Argfolio guarda una "foto" del patrimonio **solo cuando abrís la app** (en el navegador).
- En producción hay **96 fotos entre el 10/02 y el 30/10/2026** (263 días). Los últimos meses casi no
  tienen: agosto 4, septiembre 1, octubre 1 (hoy).
- Con huecos así, "cómo te fue en 30 días" compara contra la foto más cercana, que puede ser de hace
  semanas, y el gráfico es una línea recta entre puntos.

Dos problemas de datos que vimos hoy afectan las fotos viejas:

1. **Split de SPY (3:1) entre el 27 y el 30 de mayo de 2026.** El precio por CEDEAR pasó de $54.800 a
   $18.750 y la app siguió contando 12 (Galicia) y 1 (IOL). Desde el 30/05 todas las fotos valúan SPY
   a un tercio. Hoy se cargó el split (fechado el 29/05), así que **de hoy en adelante está bien**,
   pero las fotos del 30/05 al 29/10 quedaron bajas (≈ US$ 250–330 menos por día).
2. **Fiwind y Carrefour** seguían sumando intereses sobre plata que ya no estaba. No sabemos desde
   cuándo, así que esas fotos tienen pesos de más.

Por eso, cualquier comparación que cruce el 30/10 va a mostrar un salto que es corrección, no
ganancia ni pérdida.

## Opción A (recomendada): foto diaria en el servidor

Un **Cloudflare Worker con Cron Trigger** (las Pages Functions no tienen cron) que todos los días a las
18:30 (hora Argentina) hace lo mismo que la app al abrirse:

1. Lee cuentas, instrumentos y movimientos de D1 (`argfolio-prod`).
2. Trae precios: dólares (dolarapi), CEDEARs (PPI, mismo `src/server/market/ppiCedearsProvider.ts`),
   cripto (CoinGecko), FCIs (ArgentinaDatos + IOL, `fciProvider.ts`).
3. Calcula el portfolio con el mismo motor (`src/domain/portfolio/*` y `features/portfolioV2/builder.ts`
   son funciones puras, sin React).
4. Guarda la foto del día en `snapshots` **solo si ese día no tiene una** (la de la app, si la abrís,
   sigue teniendo prioridad), marcada `source: 'server'`.

- **Ventaja:** desde que se activa, no vuelve a haber huecos. Usa precios reales del día.
- **Trabajo:** medio. Un `worker/` nuevo con su `wrangler.toml` (mismo D1), un bundle del motor y un
  test que compare la foto del Worker con la de la app para la misma cartera.
- **Riesgo:** si un proveedor falla ese día, no guarda (igual que la app con `MISSING_PRICES`) y
  reintenta a la hora siguiente.

## Opción B: reconstruir los días que faltan (hacia atrás)

Para cada día sin foto, calcular el patrimonio con:

| Qué | Cantidad | Precio histórico |
|---|---|---|
| Billeteras, frascos, plazos fijos | movimientos hasta ese día (incluye los intereses diarios que ya se guardan) | — (pesos) |
| Cripto | movimientos hasta ese día | CoinGecko `coins/{id}/market_chart?days=…&interval=daily` |
| CEDEARs | movimientos hasta ese día (con el split en su fecha) | precio del subyacente en USD (Stooq, cierre diario) × dólar CCL/MEP del día ÷ ratio. Aproxima BYMA con 1–3 % de error |
| FCIs | movimientos hasta ese día | valor cuotaparte del día (ArgentinaDatos, FCIs por fecha) |
| Dólares (MEP, oficial, cripto) | — | ArgentinaDatos `cotizaciones/dolares/{casa}` |

- Se guardan con `source: 'reconstruido'`, **nunca pisan una foto real**, y en el gráfico se dibujan
  punteadas para distinguirlas.
- **Límite:** solo es tan bueno como los movimientos. Donde la app no sabía algo (por ejemplo, cuándo
  vaciaste Fiwind), la reconstrucción repite ese error.
- **Trabajo:** medio-alto (precios históricos de 4 fuentes, con límites de uso de CoinGecko).

## Arreglo puntual de las fotos viejas (rápido, recomendado)

Corregir SPY en las fotos guardadas del **30/05 al 29/10**: multiplicar el valor de SPY de cada foto por
3 y sumar la diferencia al total y al rubro CEDEARs (en pesos y en dólares). Es una sola consulta sobre
`snapshots`, con respaldo previo. No toca movimientos. Lo de Fiwind/Carrefour no se puede corregir sin
saber las fechas: si las recordás aproximadamente, se cargan retiros fechados y se recalculan esas fotos
con la Opción B.

## Recomendación

1. **Ya:** el arreglo de SPY en fotos viejas (requiere tu OK porque cambia datos guardados).
2. **Siguiente:** Opción A, para que el historial no tenga más huecos.
3. **Opcional:** Opción B para rellenar febrero–octubre con precios reales, empezando por los meses
   con menos fotos (agosto–octubre).
