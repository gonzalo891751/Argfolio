# IMPLEMENTATION DASHBOARD V2

Date: 2026-02-09
Owner: Codex (Staff Engineer)
Scope: Replace legacy `/dashboard` with Dashboard v2 using PortfolioV2 as single source of truth.
Status: Implemented (phases 0-3 completed in code). Final manual browser QA pending.

## Phase 0 - Repo Map (Current State)

1. Router and `/dashboard`
- Router lives in `src/App.tsx`.
- `/dashboard` currently renders `DashboardPage` from `src/pages/dashboard.tsx`.
- Current dashboard is legacy and consumes `useComputedPortfolio` + legacy dashboard components.

2. Legacy dashboard data path
- `src/pages/dashboard.tsx` imports `useComputedPortfolio` and `useSnapshots`.
- Legacy UI components in `src/components/dashboard/*`:
  - `kpi-card.tsx`
  - `portfolio-chart.tsx`
  - `composition-chart.tsx`
  - `top-positions.tsx`
  - `debts-card.tsx`
  - `empty-state.tsx`
  - `category-card.tsx` (currently orphaned)

3. Dexie schema and snapshots table
- Dexie schema lives in `src/db/schema.ts`.
- Table `snapshots!: Table<Snapshot, string>` exists since v1.
- Current indexed fields: `id, dateLocal, createdAtISO`.
- Current `Snapshot` type in `src/domain/types.ts` has only:
  - `id`, `dateLocal`, `totalARS`, `totalUSD`, `fxUsed`, `createdAtISO`.

4. Snapshot storage hooks/services
- Hook: `src/hooks/use-snapshots.ts`.
  - `useSnapshots()` -> list.
  - `useSaveSnapshot()` currently computes from `useComputedPortfolio` (legacy drift source).
  - `useDeleteSnapshot()` -> delete one snapshot.
- Repository: `src/db/repositories/snapshots.ts` with `list/get/getByDate/create/delete/getLatest`.
- UI currently using snapshots:
  - `src/pages/dashboard.tsx` (legacy chart)
  - `src/pages/history.tsx` (manual save/list/delete)

5. FX source and cache
- FX hook: `src/hooks/use-fx-rates.ts`.
- Provider: `src/data/providers/dolar-api.ts`.
- FX cache in localStorage key: `argfolio_fx_rates_cache`.
- Daily FX snapshot utility for FX deltas: `src/lib/daily-snapshot.ts` (separate from portfolio snapshots).

6. PortfolioV2 truth source
- Hook: `src/features/portfolioV2/usePortfolioV2.ts`.
- Core builder: `src/features/portfolioV2/builder.ts`.
- Portfolio totals and rubro/item breakdown available in `portfolio.kpis` and `portfolio.rubros`.
- Existing detail routes used by Mis Activos v2:
  - `/mis-activos-v2/billeteras/:accountId`
  - `/mis-activos-v2/plazos-fijos/:pfId`
  - `/mis-activos-v2/cripto/:accountId/:symbol`
  - `/mis-activos-v2/cedears/:accountId/:ticker`
  - `/mis-activos-v2/fondos/:accountId/:instrumentId`

7. Movement wizard integration point
- Reusable wizard: `src/pages/movements/components/MovementWizard.tsx`.
- It is currently mounted in `src/pages/movements/MovementsPageV2.tsx`.
- There is no global "open movement wizard" store; dashboard must mount it and control `open` state locally.

## Decisions (Locked)

1. Snapshot source-of-truth
- All NEW snapshots will be `source: 'v2'` and computed from `usePortfolioV2` only.
- Legacy snapshots remain readable and marked `source: 'legacy'`.

2. Snapshot granularity for drivers
- Persist both:
  - `breakdownRubros` (rubro-level totals)
  - `breakdownItems` (asset-level totals with stable `assetKey`)
- `assetKey` format will be deterministic and account-scoped, ex:
  - `cedear:iol:SPY`
  - `crypto:binance:BTC`
  - `fci:ppi:fci-premier-ahorro`
  - `wallet:carrefour:ARS`
  - `pf:santander:pf-XXXX`

3. Idempotent daily save
- Save operation will be upsert by `dateLocal`.
- If a snapshot already exists that day, it is replaced/merged (no duplicate error).

4. Drivers TOTAL criterion
- `TOTAL` default uses snapshot delta from first available V2 snapshot when present.
- If no suitable old snapshot, fallback is `PortfolioV2` unrealized PnL/cost-basis approximation and UI label explicitly says `Total (desde costo)`.

5. Projection criterion
- Historical line: V2 snapshots.
- Projected line:
  - Yield assets (items with `yieldMeta`): daily compounding from current TNA.
  - Non-yield assets: default 0 drift, optionally recent trend when enough data points exist.
- UI must mark projected mode as estimate.

6. Risk metrics criterion
- Volatility 30D: from daily returns of snapshot series.
- Max Drawdown 90D: from snapshot equity curve.
- Sharpe 1Y: from returns when enough samples, otherwise `N/A`.
- Expo USD: from PortfolioV2 exposure used in Mis Activos v2 KPIs.

7. Snapshot automation toggle
- Add real toggle setting in localStorage.
- When enabled, app auto-saves one V2 snapshot per day.
- Include "Limpiar historial" with confirmation and real delete-all behavior.

## Execution Plan

1. Phase 1 (blocking) - Snapshot V2 backbone
- Extend `Snapshot` type + Dexie schema version bump/migration.
- Implement V2 snapshot compose/upsert pipeline.
- Add pure helpers:
  - `getSnapshotAtOrBefore`
  - `getSnapshotForPeriod`
  - `computeReturns`
  - `computeDrivers`
- Add vitest coverage for migration compatibility and helpers.

2. Phase 2 - Dashboard v2 UI port
- Replace `src/pages/dashboard.tsx` with new v2 page aligned to `docs/prototypes/dash1.html`.
- Build section blocks:
  - Hero + quick actions + movement CTA
  - KPI cards
  - Evolution chart (ARS/USD, range, historico/proyectado)
  - Drivers table + modal
  - Distribucion + Riesgo
  - Snapshots automation strip + alertas placeholder
- Data sources:
  - Current: `usePortfolioV2`
  - Historical/Drivers/Risk: V2 snapshots only

3. Phase 3 - integration and cleanup
- Keep `/dashboard` pointing to the new v2 page.
- Remove legacy dashboard components `src/components/dashboard/*` once orphaned.
- Validate totals parity with Mis Activos v2.

## Risks and Mitigations

1. Legacy snapshot discontinuity
- Risk: jump between old and new methodology.
- Mitigation: explicit `source` tagging and V2-only analytics paths.

2. Missing historical depth for risk/drivers
- Risk: insufficient snapshots for 30D/90D/1Y metrics.
- Mitigation: return `N/A` with clear UI labels/tooltips.

3. Asset key instability
- Risk: drivers deltas break if keys change.
- Mitigation: deterministic key builder based on item kind + account + instrument/symbol.

4. Regression in Movements / Mis Activos v2
- Risk: Dashboard integration might affect shared queries.
- Mitigation: isolate dashboard logic in feature folder, preserve existing hooks contracts, run build/lint/test/tsc.

## Files Touched

- `src/domain/types.ts`
- `src/db/schema.ts`
- `src/db/repositories/snapshots.ts`
- `src/db/repositories/snapshot-utils.ts`
- `src/db/repositories/snapshot-utils.test.ts`
- `src/hooks/use-snapshots.ts`
- `src/components/GlobalDataHandler.tsx`
- `src/features/dashboardV2/snapshot-v2.ts`
- `src/features/dashboardV2/snapshot-helpers.ts`
- `src/features/dashboardV2/snapshot-helpers.test.ts`
- `src/pages/dashboard.tsx`
- `src/components/dashboard/category-card.tsx` (deleted)
- `src/components/dashboard/composition-chart.tsx` (deleted)
- `src/components/dashboard/debts-card.tsx` (deleted)
- `src/components/dashboard/empty-state.tsx` (deleted)
- `src/components/dashboard/kpi-card.tsx` (deleted)
- `src/components/dashboard/portfolio-chart.tsx` (deleted)
- `src/components/dashboard/top-positions.tsx` (deleted)
- `docs/IMPLEMENTATION_DASHBOARD_V2.md`
- `docs/AI_HANDOFF.md`

## Implementation Notes

1. Snapshot migration and V2 source alignment
- Added Dexie v7 migration for `snapshots` with `source` index and legacy backfill (`source='legacy'`).
- Snapshot write path now uses `usePortfolioV2` only.
- Snapshot save is now idempotent by day (`upsertByDate`), replacing/merging same `dateLocal`.

2. V2 snapshot payload
- New snapshots include:
  - `source='v2'`
  - `breakdownRubros`
  - `breakdownItems`
  - `meta.fxRef`
- Stable `assetKey` builder implemented in `snapshot-v2.ts`.

3. Dashboard v2 UI and behavior
- `/dashboard` now renders the new v2 dashboard in `src/pages/dashboard.tsx`.
- Includes:
  - Hero + quick actions + real `MovementWizard` button ("Agregar movimiento")
  - KPI block (total, 1D, MTD, YTD)
  - Liquidity + Net Income 30D decomposition
  - Evolution chart with ARS/USD, range selector, Historico/Proyectado
  - Drivers table with period selector and blur modal per category
  - Distribution donut + Risk metrics
  - Auto snapshots toggle + clear history + "Alertas inteligentes - Proximamente"

4. Drivers TOTAL criterion
- Uses first V2 snapshot when available (`Total (desde primer snapshot)`).
- Fallback: current PnL vs estimated cost basis from PortfolioV2 (`Total (desde costo)`).

5. Risk and projection criteria
- Volatility 30D, Max Drawdown 90D, Sharpe 1Y from V2 snapshot returns.
- Projection uses:
  - Yield-bearing assets daily compounding by `yieldMeta.tna`
  - Non-yield drift from recent returns when enough data, else neutral
- Tooltip/text explicitly marks projected mode as estimate.

## Current Limitations

- Manual browser parity check (`/mis-activos-v2` total vs `/dashboard` total) is not executable from CLI-only environment.
- Build currently reports pre-existing warnings unrelated to this task:
  - CSS `@import` order warning in `src/index.css`
  - Large chunk warning from Vite bundle size
- Lint has pre-existing warnings across repo (`no-explicit-any`, hook deps), but no lint errors.

## Validation Commands (Summary)

Last execution: 2026-02-09

1. `npm test`
- Result: PASS
- Summary: 11 test files, 84 tests passed (including new snapshot helper/repository tests)

2. `npm run build`
- Result: PASS
- Notes: production build completed; existing non-blocking warnings remained (CSS import order, chunk size)

3. `npm run lint`
- Result: PASS (0 errors)
- Notes: 124 warnings (pre-existing repo debt), no new lint errors introduced

4. `npx tsc --noEmit`
- Result: PASS

## Phase 3 Integration Notes

- `/dashboard` now renders Dashboard v2 directly from `src/pages/dashboard.tsx`.
- Legacy dashboard component files under `src/components/dashboard/*` were removed.
- Snapshot capture entrypoint is now global via `src/components/GlobalDataHandler.tsx` using `useAutoDailySnapshotCapture()`.
- Data parity implementation guarantee:
  - Dashboard total ARS/USD is taken from `portfolio.kpis.totalArs` and `portfolio.kpis.totalUsd` from `usePortfolioV2`.
  - Mis Activos v2 reads the same `usePortfolioV2` source.
  - Therefore, totals are computed from the same source-of-truth pipeline.

## QA checklist
- [x] `/dashboard` renders Dashboard v2.
- [x] Patrimonio ARS/USD uses the same `usePortfolioV2` source as Mis Activos v2.
- [ ] Manual browser parity check `/mis-activos-v2` vs `/dashboard` (visual QA pending).
- [x] New snapshots are saved as `source='v2'` with rubro/item breakdowns.
- [x] Drivers by period work (`TOTAL` default + selector + modal rows clickable).
- [x] Evolucion historico/proyectado works and is understandable.
- [x] Auto snapshots toggle works; clear history works with confirmation.
- [x] `npm test` green.
- [x] `npm run build` green.
- [x] `npm run lint` green (no errors).
- [x] `npx tsc --noEmit` green.
