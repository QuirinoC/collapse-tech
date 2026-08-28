-- SQLite port of the former Supabase Postgres schema:
-- singleton telemetry counters + a single winner slot.

CREATE TABLE IF NOT EXISTS winners (
  id TEXT PRIMARY KEY,
  claim_token TEXT NOT NULL UNIQUE,
  winner_slot INTEGER NOT NULL DEFAULT 1 CHECK (winner_slot = 1),
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (winner_slot)
);

CREATE TABLE IF NOT EXISTS telemetry_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  attempts_total INTEGER NOT NULL DEFAULT 0 CHECK (attempts_total >= 0),
  attempts_auto INTEGER NOT NULL DEFAULT 0 CHECK (attempts_auto >= 0),
  attempts_manual INTEGER NOT NULL DEFAULT 0 CHECK (attempts_manual >= 0),
  CHECK (attempts_total = attempts_auto + attempts_manual)
);

INSERT OR IGNORE INTO telemetry_totals (
  id,
  attempts_total,
  attempts_auto,
  attempts_manual
) VALUES (1, 0, 0, 0);
