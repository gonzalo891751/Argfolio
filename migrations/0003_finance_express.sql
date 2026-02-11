-- Finance Express data (singleton per deployment)
-- Stores the budget_fintech localStorage JSON for cross-device sync

CREATE TABLE IF NOT EXISTS finance_express_data (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
