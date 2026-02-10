-- Argfolio sync snapshots schema (D1)
-- Snapshot payload v2, one row per date (YYYY-MM-DD)

CREATE TABLE IF NOT EXISTS snapshots (
  date TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at INTEGER
);
