# Audit y Plan de Integración: Finanzas Express en Argfolio

**Fecha:** 2026-02-11
**Autor:** Antigravity (Assistant)
**Objetivo:** Integrar módulo externo "Presupuesto personal Express" dentro de Argfolio con impacto mínimo y soporte mobile + sync cross-device.

---

## 1. Hallazgos de Auditoría

### A. Argfolio (Host)
*   **Tech Stack:** React, Vite, React Router, Tailwind, Shadcn/ui.
*   **Routing:** Definido centralmente (probablemente `src/routes.tsx` o `App.tsx`) usando `react-router-dom`.
*   **Layout & Navegación:**
    *   **Desktop:** `src/components/layout/sidebar.tsx` define `Sidebar` y la lista `navItems`.
    *   **Mobile:** `src/components/layout/sidebar.tsx` exporta `MobileNav` (Sheet) que reutiliza `navItems`.
    *   **Estructure:** `AppLayout` (`src/components/layout/app-layout.tsx`) maneja el layout responsive (Sidebar fija en desktop, Sheet en mobile) y el área de contenido (`main`).
    *   **Safe Areas:** `MobileNav` ya maneja `safe-area-inset-*`. El contenido principal está en un `main` con padding responsive (`p-4 md:p-6 lg:p-8`).
*   **Persistencia y Sync:**
    *   **Local:** Dexie (`pfStore`, `movements`, etc.) y LocalStorage (preferencias).
    *   **Sync:** `src/domain/sync/local-backup.ts` exporta un JSON masivo (`exportLocalBackup`) que se envía a `functions/api/sync/push.ts`.
    *   **Backend:** Cloudflare Pages Functions + D1 (tablas: `accounts`, `movements`, `instruments`, `snapshots`).

### B. Presupuesto Personal Express (Módulo a integrar)
*   **Tipo:** Aplicación web estática (HTML/JS/CSS).
*   **Estructura:** Archivo principal `calculitos.html` (ubicado en `prototypes/` o raíz).
*   **Persistencia:**
    *   Usa **LocalStorage** directamente.
    *   **Key Principal:** `et_fintech` (contiene el JSON con datos o estado).
    *   **Key UI:** `theme` (para modo oscuro/claro).
*   **Assets:** (Asumido) Autocontenido o rutas relativas simples.
*   **Compatibilidad:** Al ser HTML estático, puede servirse desde `/public` de Argfolio y ejecutarse en un `iframe`.
    *   **Ventaja Crítica:** Si se sirve desde el mismo origen (`domain/apps/...`), comparte `localStorage` con la app React. Esto simplifica enormemente el sync.

---

## 2. Estrategia de Integración por Fases

### Fase A: Integración UI (Rápida y Segura)
**Objetivo:** Que el usuario pueda acceder a la herramienta desde Argfolio (Desktop/Mobile) sin romper nada.

**Plan de Cambios:**

1.  **Migración de Archivos:**
    *   Crear directorio: `d:\Git\Argfolio\public\apps\finanzas-express\`
    *   Copiar todo el contenido de `Presupuesto personal express` (o el build final) a esa carpeta.
    *   Renombrar el entry point a `index.html` para acceso limpio.

2.  **Nueva Ruta en Argfolio:**
    *   Crear componente Page wrapper: `src/pages/finanzas-express.tsx`.
    *   Implementar un `iframe` que cargue `/apps/finanzas-express/index.html`.
    *   **Desktop:** Iframe ocupa el 100% del área de contenido disponible.
    *   **Mobile:** Ajustar altura con `height: calc(100dvh - header_height)` para evitar doble scroll.
    *   Registrar ruta `/personal-finances` (o similar) en `src/routes.tsx` apuntando a este componente.

3.  **Integración en Menú:**
    *   Modificar `src/components/layout/sidebar.tsx`:
    *   Agregar item a `navItems`:
        ```typescript
        { path: '/finanzas-express', label: 'Finanzas', icon: Calculator /* o similar */ }
        ```
    *   Esto actualiza automáticamente Sidebar Desktop y MobileNav.

**Criterios de Aceptación Fase A:**
*   [ ] Existe carpeta `public/apps/finanzas-express` con `index.html`.
*   [ ] Icono "Finanzas" aparece en Sidebar y Mobile Menu.
*   [ ] Al clicar, carga la app antigua dentro del área principal de Argfolio.
*   [ ] En Mobile, se ve correctamente y no hay conflictos de scroll graves.
*   [ ] Los datos se guardan (persisten en navegador) porque usa su propio LocalStorage (compartido con el dominio padre).

---

### Fase B: Sincronización Cross-Device
**Objetivo:** Que los datos de `et_fintech` viajen a la nube (D1) y se sincronicen entre PC y Celular.

**Estrategia:** Aprovechar que `iframe` same-origin comparte `localStorage`.

**Plan de Cambios:**

1.  **Schema de Base de Datos (D1):**
    *   Crear migration SQL en `drizzle/` o `migrations/`:
        ```sql
        CREATE TABLE finance_express_data (
            key TEXT PRIMARY KEY, -- 'et_fintech'
            payload_json TEXT,
            updated_at TEXT
        );
        ```

2.  **Schema de Sync (Push API):**
    *   Modificar `functions/api/sync/push.ts`:
        *   Aceptar nuevo campo `financeExpress` en el payload JSON.
        *   Implementar lógica para upsert en tabla `finance_express_data`.

3.  **Cliente de Sync (Argfolio React):**
    *   Modificar `src/domain/sync/local-backup.ts`:
    *   `exportLocalBackup()`: Leer `localStorage.getItem('et_fintech')` e incluirlo en el payload de backup.
    *   `importLocalBackup()`: Recibir datos y hacer `localStorage.setItem('et_fintech', data)`.
    *   **Nota:** Esto sobrescribirá los datos locales con los de la nube al importar.

**Criterios de Aceptación Fase B:**
*   [ ] Al hacer backup manual o auto-sync en Argfolio, el contenido de `et_fintech` viaja al servidor.
*   [ ] Al abrir Argfolio en otro dispositivo y sincronizar, `et_fintech` se escribe en LocalStorage.
*   [ ] Al entrar a "Finanzas Express", la app lee los datos actualizados.

---

### Fase C: Unificación Estética (Futuro)
*   Reemplazar CSS de Finanzas Express por tokens de Tailwind de Argfolio.
*   Eventualmente reescribir `calculitos.html` como componente React nativo (`.tsx`) para eliminar el iframe y mejorar performance/integración.

---

## 3. Riesgos y Mitigaciones

| Riesgo | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Conflicto de CSS en Iframe** | Bajo | El iframe aísla los estilos. El riesgo es nulo salvo que queramos estilos compartidos. |
| **Scroll en Móvil (Doble barra)** | Medio | Ajustar CSS del iframe container (`overflow-hidden` en container, `h-full` en iframe). |
| **Datos "pisados" en Sync** | Alto | La estrategia actual de Sync es "último gana" (backup completo). Si se usa intensivamente en 2 dispositivos offline, habrá conflicto. (Aceptable por ahora). |
| **Rutas relativas rotas** | Medio | Si `Calculitos.html` referencia `../assets`, se romperá al moverlo. **Acción:** Verificar y corregir rutas en el HTML antes de copiar. |

---

## 4. Pasos de Validación

1.  **Visual:** Navegar a `/finanzas-express` en Desktop y Mobile (Simulador).
2.  **Funcional:** Crear una entrada en la app embebida. Recargar página (F5). Verificar que el dato sigue ahí.
3.  **Sync (Simulada Fase B):**
    *   Abrir consola devtools.
    *   Verificar valor de `localStorage.getItem('et_fintech')`.
    *   Ejecutar `exportLocalBackup()` en consola y ver si incluye la key.

---

## 5. Lista de Tecnologías y Archivos Afectados

*   **Argfolio:**
    *   `src/components/layout/sidebar.tsx` (Menu)
    *   `src/routes.tsx` (Ruta - verificar dónde está)
    *   `public/apps/` (Nuevo directorio)
    *   `functions/api/sync/push.ts` (Fase B)
    *   `src/domain/sync/local-backup.ts` (Fase B)
*   **External:**
    *   `index.html` (copia de `calculitos.html`)

**Estado:** LISTO PARA IMPLEMENTACIÓN (Fase A).
