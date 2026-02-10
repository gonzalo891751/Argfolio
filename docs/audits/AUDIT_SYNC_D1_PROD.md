# Argfolio - Auditoria completa de deploy + Sync remoto (Pages Functions + D1)

Fecha de auditoria: 2026-02-10
Scope: solo auditoria y documentacion (sin cambios funcionales).

## 1) Resumen ejecutivo
Hay una falla real en prod en `POST /api/sync/push` que termina en HTTP 500 durante `Settings -> Subir todo a D1`, y eso corta el camino de sincronizacion multi-dispositivo (el segundo dispositivo cae en modo local Dexie con mensaje de offline).

El diagnostico mas probable no es de UX sino de deploy/versionado: en este workspace existe hardening especifico para evitar el error D1 interno de `duration`, pero ese hardening esta en un commit local que aun no esta en `origin/main` (`main...origin/main [ahead 1]`). Si Cloudflare Pages despliega desde `origin/main`, produccion seguiria con la version previa del endpoint `push`.

Impacto multi-dispositivo: si el push falla, D1 no queda poblado/actualizado; entonces el bootstrap remoto de otro dispositivo no puede hidratar datos reales y la app queda en fallback local.

## 2) Hechos confirmados (con evidencia)
### 2.1 Estructura y artefactos de deploy
- Root del repo: `D:\Git\Argfolio`.
- Existe `functions/` en root: si.
- Existe `migrations/`: si (`migrations/0001_sync_core.sql`).
- Existe `wrangler.toml`: si, con `binding = "DB"`, `database_name = "argfolio-prod"`, `migrations_dir = "migrations"` (`wrangler.toml:5`, `wrangler.toml:6`, `wrangler.toml:7`, `wrangler.toml:9`).

### 2.2 Rutas API de sync presentes
- `POST /api/sync/push`: `functions/api/sync/push.ts`.
- `GET /api/sync/status`: `functions/api/sync/status.ts`.
- `GET /api/sync/bootstrap`: `functions/api/sync/bootstrap.ts`.

### 2.3 Variables y flags detectadas en codigo
- Build-time flag cliente: `VITE_ARGFOLIO_REMOTE_SYNC` (`src/sync/remote-sync.ts:4`, `src/sync/remote-sync.ts:101`, `src/sync/remote-sync.ts:102`).
- Write gate runtime: `ARGFOLIO_SYNC_WRITE_ENABLED` (`functions/api/_lib/sync.ts:3`, `functions/api/_lib/sync.ts:38`, `functions/api/sync/push.ts:318`).
- Token runtime: `ARGFOLIO_SYNC_TOKEN` (`functions/api/_lib/sync.ts:4`, `functions/api/sync/_middleware.ts:17`).

### 2.4 Uso de db.batch y generacion de statements
- Ejecucion batch D1: `await db.batch(chunk)` (`functions/api/sync/push.ts:134`).
- Hardening actual en HEAD:
  - filtra statements invalidos (`functions/api/sync/push.ts:123`, `functions/api/sync/push.ts:131`),
  - no ejecuta batch vacio (`functions/api/sync/push.ts:125`, `functions/api/sync/push.ts:132`),
  - chunking por 50 (`functions/api/sync/push.ts:121`, `functions/api/sync/push.ts:130`).
- Generacion de statements:
  - accounts (`functions/api/sync/push.ts:149`),
  - movements (`functions/api/sync/push.ts:178`),
  - instruments (`functions/api/sync/push.ts:219`).

### 2.5 Version skew confirmado (documentado vs deployable)
- `git status -sb`: `## main...origin/main [ahead 1]`.
- Commit local no presente en `origin/main`: `38bb109 fix(sync): harden D1 push and require bearer token on /api/sync/*`.
- Diff local vs remoto incluye:
  - `M functions/api/sync/push.ts`
  - `A functions/api/sync/_middleware.ts`
  - `M src/sync/remote-sync.ts`
  - `M src/pages/settings.tsx`
  - `M docs/AI_HANDOFF.md`

Esto significa que puede existir diferencia directa entre "lo que se ve en este repo local" y "lo que Pages despliega desde origin/main".

## 3) Trazado del flujo end-to-end (diagrama textual)
### A) Export/Import JSON local (Dexie)
1. En Settings, `Exportar JSON` llama `exportLocalBackup()` (`src/pages/settings.tsx:76`, `src/pages/settings.tsx:79`).
2. `exportLocalBackup()` lee Dexie (`accounts`, `instruments`, `movements`, `manualPrices`) + preferencias de localStorage (`src/domain/sync/local-backup.ts:35`, `src/domain/sync/local-backup.ts:42`, `src/domain/sync/local-backup.ts:51`).
3. `Importar JSON` parsea y valida (`parseBackupJson`) y hace upsert via `bulkPut` (`src/pages/settings.tsx:99`, `src/domain/sync/local-backup.ts:61`, `src/domain/sync/local-backup.ts:110`).

### B) Click "Subir todo a D1" -> payload -> endpoint -> D1
1. Boton en Settings llama `handlePushAllToD1` (`src/pages/settings.tsx:130`, `src/pages/settings.tsx:446`).
2. Frontend exige token local (`getSyncToken`), si falta corta con alert (`src/pages/settings.tsx:133`, `src/pages/settings.tsx:135`).
3. Frontend arma payload con `exportLocalBackup()` (`src/pages/settings.tsx:139`).
4. Hace `fetch('/api/sync/push')` con `Authorization: Bearer <token>` (`src/pages/settings.tsx:141`, `src/pages/settings.tsx:145`).
5. Backend `push.ts` valida metodo/payload y arrays (`functions/api/sync/push.ts:255`, `functions/api/sync/push.ts:274`, `functions/api/sync/push.ts:281`).
6. Si payload vacio (accounts/movements/instruments en 0), responde 200 no-op y no toca D1 (`functions/api/sync/push.ts:298`, `functions/api/sync/push.ts:306`).
7. Si write gate OFF: 403 (`functions/api/sync/push.ts:318`).
8. Si falta `env.DB`: 500 con hint (`functions/api/sync/push.ts:326`).
9. Si sigue: asegura schema, construye statements y ejecuta batch en chunks (`functions/api/sync/push.ts:341`, `functions/api/sync/push.ts:343`, `functions/api/sync/push.ts:346`, `functions/api/sync/push.ts:347`, `functions/api/sync/push.ts:354`).

Donde puede ocurrir el HTTP 500:
- en `db.batch(chunk)` (`functions/api/sync/push.ts:134`),
- en `ensureSyncSchema(db)` (`functions/api/sync/push.ts:341`),
- en `getDatabase`/binding (`functions/api/_lib/sync.ts:30`, `functions/api/_lib/sync.ts:32`),
- en errores de SQL/columnas durante inserts/upserts (`functions/api/sync/push.ts:156`, `functions/api/sync/push.ts:185`, `functions/api/sync/push.ts:226`).

### C) Bootstrap remoto en otro dispositivo -> endpoint -> Dexie -> online/offline
1. `GlobalDataHandler` dispara `useRemoteSync()` al cargar app (`src/components/GlobalDataHandler.tsx:23`).
2. `useRemoteSync()` llama `bootstrapRemoteSync()` (`src/hooks/use-remote-sync.ts:28`).
3. Cliente consulta `GET /api/sync/bootstrap` con token en header si existe (`src/sync/remote-sync.ts:60`, `src/sync/remote-sync.ts:62`, `src/sync/remote-sync.ts:156`).
4. Backend bootstrap lee D1 y devuelve `accounts/movements/instruments` (`functions/api/sync/bootstrap.ts:89`, `functions/api/sync/bootstrap.ts:104`).
5. Cliente hace `bulkPut` en Dexie (`src/sync/remote-sync.ts:161`).
6. Si error:
- `401` -> mensaje "Sync remoto sin token" (`src/sync/remote-sync.ts:120`),
- `403` -> "solo lectura" (`src/sync/remote-sync.ts:129`),
- otros (incluye 500/red) -> "Sin conexion (Dexie)" (`src/sync/remote-sync.ts:138`).

## 4) Diagnostico probable del HTTP 500 "Cannot read properties of undefined (reading 'duration')"
Diagnostico principal: error D1 interno al ejecutar batch en endpoint `push`, muy probablemente en version previa sin hardening desplegada en prod.

Evidencia:
- El propio handoff declara que Fase 4.3 apunta a corregir exactamente ese caso (`docs/AI_HANDOFF.md:2102`, `docs/AI_HANDOFF.md:2120`, `docs/AI_HANDOFF.md:2130`).
- El hardening que evita batch invalidos existe en el repo local (`functions/api/sync/push.ts:123`, `functions/api/sync/push.ts:125`, `functions/api/sync/push.ts:131`, `functions/api/sync/push.ts:134`) pero esta en commit local adelantado vs `origin/main`.
- `origin/main` conserva `runBatchInChunks` previo (sin filtro booleano y chunk distinto) en `functions/api/sync/push.ts` del remoto.

Conclusión operativa: el 500 reportado en prod es consistente con "Pages desplegando codigo previo" o con "runtime D1 ejecutando path vulnerable de batch".

## 5) Hipotesis (ordenadas por probabilidad) + pruebas propuestas sin Cloudflare
### Hipotesis 1 (muy alta): version skew de deploy (prod en commit viejo)
- Que explica: prod sigue con `push.ts` previo al hardening del bug `duration`.
- Como confirmarla sin Cloudflare: revisar git local y remoto tracking.
- Evidencia:
  - `main...origin/main [ahead 1]`.
  - commit local `38bb109` describe fix exacto.
  - `git diff origin/main..HEAD` muestra cambios en `push.ts` y auth sync.

### Hipotesis 2 (alta): `db.batch` en camino vulnerable (sin filtros/no-op robusto)
- Que explica: D1 interno rompe al procesar un lote problematico y devuelve stack tipo `cloudflare-internal:d1-api`.
- Como confirmarla sin Cloudflare: comparar implementacion actual vs origin/main de `runBatchInChunks`.
- Evidencia:
  - HEAD: filtro de statements y skip batch vacio (`functions/api/sync/push.ts:123-134`).
  - origin/main: version mas simple sin esos guardas.

### Hipotesis 3 (media): binding DB/migracion aplicada en entorno distinto al esperado
- Que explica: errores 500 generales y fallback offline en operaciones remotas.
- Como confirmarla sin Cloudflare: verificar contratos en codigo/config (no estado real).
- Evidencia:
  - `getDatabase` falla si `env.DB` no existe (`functions/api/_lib/sync.ts:30-33`).
  - `push.ts` devuelve 500 si `env.DB` undefined (`functions/api/sync/push.ts:326-331`).
  - `wrangler.toml` define binding `DB` y `migrations_dir` (`wrangler.toml:5-9`).

### Hipotesis 4 (media): drift de schema D1 (tabla vieja/incompatible)
- Que explica: batch falla por columnas o tipos no alineados con SQL de upsert.
- Como confirmarla sin Cloudflare: comparar SQL esperado en codigo vs migracion.
- Evidencia:
  - SQL esperado en upserts (`functions/api/sync/push.ts:156-165`, `functions/api/sync/push.ts:185-201`, `functions/api/sync/push.ts:226-235`).
  - Esquema base en `migrations/0001_sync_core.sql:4-40` y `ensureSyncSchema` (`functions/api/_lib/sync.ts:45-84`).
  - Si existe tabla previa con forma distinta, `CREATE TABLE IF NOT EXISTS` no corrige columnas existentes.

### Hipotesis 5 (media-baja): mismatch documentacion vs codigo en auth/status y pruebas manuales
- Que explica: validaciones operativas confusas (ej: probar `/api/sync/status` directo sin token y asumir caida).
- Como confirmarla sin Cloudflare: leer `AI_HANDOFF` y middleware.
- Evidencia:
  - Fase 4.2 documenta status diagnostico (`docs/AI_HANDOFF.md:2080-2084`).
  - Fase 4.3 agrega auth obligatoria para `/api/sync/*` (`docs/AI_HANDOFF.md:2113-2117`, `functions/api/sync/_middleware.ts:12-36`).
  - Resultado: `status` y `bootstrap` requieren bearer token cuando esta version esta desplegada.

## 6) Gaps entre "documentado" y "deployable"
- Gap 1: `AI_HANDOFF` mezcla checkpoints 4.2 (status abierto) y 4.3 (auth obligatoria) en el mismo documento; puede llevar a pruebas manuales equivocadas.
- Gap 2: 4.1 describe guard clause frontend por payload vacio (`docs/AI_HANDOFF.md:2017`), pero en HEAD el control principal esta en backend no-op (`functions/api/sync/push.ts:298-316`), y el frontend prioriza token.
- Gap 3: respuesta de `push` evoluciono (`accountsUpserted` en 4.1 vs `counts.accounts` + `durationMs` en hardening actual), lo que requiere validar que frontend y backend desplegados sean de la misma version.
- Gap 4 (critico): codigo local incluye hardening no presente en `origin/main`; Pages puede estar desplegando la version vieja.

## 7) Checklist de Cloudflare (validacion de prod)
1. Confirmar commit desplegado en Pages (debe incluir hardening de `push.ts` y `functions/api/sync/_middleware.ts`).
2. Confirmar binding D1 `DB -> argfolio-prod` en entorno Production (y Preview si tambien se usa).
3. Confirmar que migraciones de `migrations/0001_sync_core.sql` esten aplicadas a la DB real de prod.
4. Confirmar secrets en Production:
- `ARGFOLIO_SYNC_TOKEN`
- `ARGFOLIO_SYNC_WRITE_ENABLED=1`
5. Confirmar build env var `VITE_ARGFOLIO_REMOTE_SYNC=1` en entorno de build.
6. Recordar que cambios en `VITE_*` requieren redeploy completo del frontend (build-time).
7. Probar `GET /api/sync/status` con `Authorization: Bearer <token>` cuando version con middleware este activa.
8. Validar que el token cargado en `/settings` coincida exactamente con secret (sin espacios).

## 8) Plan minimo de correccion (propuesto, no implementado)
1. Alinear deploy con codigo corregido: publicar a `origin/main` el commit de hardening y redeploy de Pages.
2. Verificar runtime config (DB binding, secrets, env vars VITE) en Production y redeploy forzado.
3. Ejecutar smoke test controlado:
- `GET /api/sync/status` (con token) -> `ok: true`, `d1Bound: true`.
- `GET /api/sync/bootstrap` (con token) -> 200 con arrays.
- `POST /api/sync/push` desde `/settings` con datos reales -> 200 + counts > 0.
4. Confirmar bootstrap cross-device: segundo dispositivo con mismo token debe hidratar Dexie desde D1.
5. Si persiste 500: capturar body JSON de error y revisar logs server de `sync/push` por etapa (`start/chunk failed/failed`) para aislar si rompe en schema o batch.

## 9) Plan futuro "multiusuario" (high-level)
- Introducir `user_id` en tablas sync (`accounts`, `movements`, `instruments`) y en claves/indices.
- Reemplazar token unico global por identidad por usuario (Cloudflare Access/JWT).
- Aplicar autorizacion por `user_id` en cada endpoint y bootstrap filtrado por usuario.
- Mantener Dexie como cache local por usuario/sesion.

## 10) Como validar en produccion
URL 1: `/api/sync/status`
- Esperado (deploy con middleware):
  - sin token -> `401 Unauthorized` JSON.
  - con `Authorization: Bearer <token>` -> `200` JSON con `ok`, `d1Bound`, `writeEnabled`, `counts`.

URL 2: `/api/sync/bootstrap`
- Esperado:
  - sin token (si middleware activo) -> `401`.
  - con token valido -> `200` con `accounts[]`, `movements[]`, `instruments[]`, `durationMs`.

URL 3: `/settings` -> boton `Subir todo a D1`
- Esperado:
  - token faltante -> alerta local de token.
  - write gate OFF -> `HTTP 403` con hint.
  - config correcta + datos -> exito, conteos > 0.
  - payload vacio -> exito 200 con conteos en 0 (no-op backend).
