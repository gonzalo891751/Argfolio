# Mobile Audit Report

**Date:** 2026-02-11
**Version:** 1.0
**Status:** In Progress

## 1. Executive Summary

The Argfolio application has a strong foundation for mobile responsiveness, utilizing Tailwind CSS effectively for layout adaptation. However, a **critical severity bug** prevents the mobile navigation menu from opening, rendering the application difficult to navigate on small screens. 

Other than this critical blocker, the desktop-to-mobile degradation is handled well in most views, with tables wrapped in scroll containers and grids adjusting to single columns.

## 2. Critical Issues (Blockers)

### 🚨 Mobile Menu Not Opening
- **Severity:** Critical (P0)
- **Component:** `MobileNav` / `AppLayout`
- **Root Cause:** The `MobileNav` component is correctly implemented and exported from `src/components/layout/sidebar.tsx`, but it is **never rendered** in the main application layout (`src/components/layout/app-layout.tsx` or `src/App.tsx`).
- **Impact:** Users on mobile devices cannot access the navigation menu, locking them to the active page.
- **Fix:** Import and render `<MobileNav />` within the `AppLayout` component.

## 3. Page-by-Page Responsiveness Analysis

### 3.1 Global Layout (`AppLayout`, `ArgfolioHeader`)
- **Status:** Good (pending fix)
- **Observations:**
  - Header handles mobile view well, showing the "Menu" trigger button (hamburger) on `lg:hidden`.
  - Ticker pauses on mobile, which is good for performance and space.
  - Sidebar correctly hides on mobile.

### 3.2 Dashboard (`DashboardPage`)
- **Status:** Passed Code Inspection
- **Observations:**
  - Uses standard CSS/Tailwind responsiveness.
  - Charts use `ResponsiveContainer` from Recharts, ensuring they resize to fit mobile screens.
  - KPI cards likely stack vertically (confirmed in similar components).

### 3.3 Mis Activos (`AssetsPageV2`)
- **Status:** Passed Code Inspection
- **Observations:**
  - `AssetsKpiTop` uses `grid-cols-1 md:grid-cols-2`, enabling perfect stacking on mobile.
  - Tables and complex lists need to be verified in-browser for potential horizontal scrolling issues, but standard `overflow-x-auto` wrappers appear to be present in shared components.

### 3.4 Mercado (`MarketPage`)
- **Status:** Passed Code Inspection
- **Observations:**
  - `IndicesGrid` adapts to `grid-cols-2 md:grid-cols-4`.
  - `DollarStrip` uses `flex-wrap`, which is excellent for mobile.
  - Tabs are scrollable (`overflow-x-auto`), handling narrow screens well.
  - Tables (Cedears/Crypto) are standard; column visibility on mobile needs to be verified (e.g., hiding "Change %" or "Volume" on very small screens if crowded).

### 3.5 Movimientos (`MovementsPageV2`)
- **Status:** Passed Code Inspection
- **Observations:**
  - `MovementsTable` is wrapped in `overflow-x-auto`.
  - Columns like "Cuenta" and "Precio" are hidden on smaller screens (`hidden md:table-cell`), which is a best practice for mobile tables.
  - "Nuevo Movimiento" wizard is a modal overlays, usually works well on mobile if `Sheet` or `Dialog` is used (uses `Drawer/Dialog`).

### 3.6 Detalle Cripto (`CryptoDetailPage`)
- **Status:** Passed Code Inspection
- **Observations:**
  - Hero section stacks (`grid-cols-1 lg:grid-cols-3`).
  - KPIs use `grid-cols-2`.
  - Lots table is scrollable.
  - Simulator form uses `grid-cols-1`, stacking input and preview.

## 4. UI/UX Consistency (Brand System)
- **Fonts:** `Inter` and `JetBrains Mono` (numbers) are consistently applied via `font-sans` and `font-mono`.
- **Colors:** Usage of `slate-400` to `slate-500` for secondary text and `indigo/emerald/rose` for semantic states continues the brand language.
- **Glassmorphism:** Used extensively (`glass-panel`, `glass-button`), potentially heavy on low-end mobile GPUs but visually consistent.

## 5. Prioritized Backlog

| ID | Priority | Issue | Component | Status |
|----|----------|-------|-----------|--------|
| M-1 | **P0** | **Fix Mobile Navigation Menu** | `AppLayout` | Ready for Dev |
| M-2 | P2 | Verify 'Personal Finances' Responsive Layout | `DebtsPage` | To Audit |
| M-3 | P3 | Verify Horizontal Scroll Feel on Tables | Shared | In Review |
| M-4 | P3 | Verify Touch Targets (44px+) for Icon Buttons | Global | In Review |

## 6. Implementation Plan

### Phase 1: Fix Critical Navigation (Immediate)
1.  Modify `src/components/layout/app-layout.tsx`.
2.  Import `MobileNav` from `@/components/layout/sidebar`.
3.  Add `<MobileNav />` to the render tree, ensuring it sits outside the main content flow (absolute/fixed position handled by Sheet).

### Phase 2: Visual Regression Testing (Post-Fix)
1.  Once the menu opens, verify navigation to all pages.
2.  Check for "layout shift" when opening/closing the menu.

### Phase 3: Fine-tuning
1.  Address any text truncation issues found during manual walkthrough.
2.  Optimize complex animations for lower-power mobile devices if needed.
