# Argfolio D1 Sync MVP

## Objetivo
Habilitar sync remoto mínimo para `accounts` + `movements`, manteniendo Dexie como cache local/offline.

## Feature Flags
- Cliente (build-time): `VITE_ARGFOLIO_REMOTE_SYNC=1`
- Functions write gate (runtime): `ARGFOLIO_SYNC_WRITE_ENABLED=1`

Por seguridad, la escritura queda **bloqueada por default** si no se activa `ARGFOLIO_SYNC_WRITE_ENABLED`.

## Endpoints
- `GET /api/sync/bootstrap`
- `GET|POST|PUT|DELETE /api/movements`
- `GET|POST|PUT|DELETE /api/accounts`

## Flujo de app
1. Con `VITE_ARGFOLIO_REMOTE_SYNC=1`, `GlobalDataHandler` hace bootstrap remoto.
2. Datos remotos se guardan en Dexie (`bulkPut`) y la UI lee desde cache local.
3. Escrituras en repos (`movementsRepo`, `accountsRepo`) intentan API remota.
4. Si falla red o write-gate, fallback local + aviso "usando datos locales".

## Migraciones
- Archivo: `migrations/0001_sync_core.sql`
- Aplicar con:
  - `wrangler d1 migrations apply argfolio-prod --remote`

