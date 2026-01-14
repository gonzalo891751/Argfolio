# Argfolio - Investment Portfolio Tracker

A premium fintech web application for tracking Argentine investments including Cedears, cryptocurrencies, stablecoins, FCIs, plazos fijos, virtual wallets, and debts.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📋 Phase 1 Features (Current)

### ✅ Implemented

- **Premium UI Shell**
  - Responsive layout (mobile + desktop)
  - Collapsible sidebar navigation
  - Dark/Light/System theme toggle (persisted)
  - CSS variable-based design tokens

- **Dashboard**
  - KPI cards (Total Portfolio, Liquidity, PnL)
  - Portfolio value chart with time range tabs (Day/Month/Year)
  - Composition donut chart
  - Top positions bar chart
  - Category cards with auto-hide when empty

- **FX Rates**
  - Top bar FX strip (Oficial, Blue, MEP, CCL, Cripto)
  - Last updated timestamp

- **Mercado Mode**
  - Ticker tape carousel with smooth CSS animation
  - Watchlist with prices and daily changes

- **Data Layer**
  - TanStack Query integration
  - 5-minute auto-refresh polling
  - Manual refresh with loading states
  - Mock data provider for all data types

- **Pages**
  - `/dashboard` - Main dashboard
  - `/assets` - Holdings table with category filter and search
  - `/movements` - Placeholder
  - `/history` - Placeholder
  - `/debts` - Debt tracking with due dates
  - `/settings` - Theme, FX preference, auto-refresh toggle

### 🔲 Not Implemented (Phase 2+)

- Real API integration (dolarapi.com, CoinGecko, etc.)
- Authentication system
- Movements CRUD engine
- Full transaction history
- Notifications for debt due dates
- Import/Export functionality
- PWA support

## 🏗️ Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 3 with CSS variables
- **Components**: Custom shadcn/ui-style components
- **Routing**: React Router DOM 7
- **Data Fetching**: TanStack Query 5
- **Charts**: Recharts
- **Icons**: Lucide React

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/              # Base UI components (Button, Card, etc.)
│   ├── layout/          # Sidebar, Topbar, AppLayout
│   └── dashboard/       # Dashboard-specific components
├── data/
│   ├── mock/            # Mock data
│   └── providers/       # Data provider interfaces
├── hooks/               # React Query hooks
├── lib/                 # Utilities and theme provider
├── pages/               # Route page components
└── types/               # TypeScript interfaces
```

## 🎨 Design System

The app uses a CSS variable-based theming system compatible with shadcn/ui patterns:

- Colors are defined as HSL values in `:root` and `.dark` selectors
- Tailwind is configured to use these CSS variables
- Theme toggle persists to localStorage

## 🔄 Data Refresh

- Auto-refresh every 5 minutes (configurable in Settings)
- Manual refresh button in top bar
- "Updated X min ago" indicator
- Can be paused from Settings page

## 📱 Responsive Design

- Mobile: Hamburger drawer navigation
- Desktop: Collapsible sidebar (state persisted)
- Tables are horizontally scrollable on mobile
- Minimum supported width: 375px

## 🔜 Phase 2 Roadmap

1. Real API integration for FX rates and crypto prices
2. Movements engine (buy/sell/transfer/dividends)
3. Full transaction history with filters
4. Debt notifications and reminders
5. CSV/Excel import functionality
6. Authentication with multiple profiles
