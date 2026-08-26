PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('brand', 'creator')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  company TEXT,
  name TEXT NOT NULL,
  bio TEXT,
  niches TEXT NOT NULL DEFAULT '[]',
  channels TEXT NOT NULL DEFAULT '[]',
  min_budget_cents INTEGER CHECK (min_budget_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions(profile_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  product_info TEXT,
  platforms TEXT NOT NULL,
  niches TEXT NOT NULL,
  demographics TEXT,
  follower_min INTEGER,
  follower_max INTEGER,
  slots INTEGER NOT NULL CHECK (slots BETWEEN 1 AND 50),
  slots_remaining INTEGER NOT NULL,
  budget_cents INTEGER NOT NULL CHECK (budget_cents >= 10000),
  fee_cents INTEGER NOT NULL,
  per_creator_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'funded', 'completed', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'held', 'settled', 'refunded')),
  payment_ref TEXT,
  funded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS campaigns_brand_idx ON campaigns(brand_id);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pitch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, creator_id)
);

CREATE INDEX IF NOT EXISTS applications_campaign_idx ON applications(campaign_id);
CREATE INDEX IF NOT EXISTS applications_creator_idx ON applications(creator_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'instructions_sent'
    CHECK (status IN ('instructions_sent', 'submitted', 'approved', 'paid', 'rejected', 'declined')),
  content_url TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  paid_at TEXT,
  payout_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, creator_id)
);

CREATE INDEX IF NOT EXISTS assignments_campaign_idx ON assignments(campaign_id);
CREATE INDEX IF NOT EXISTS assignments_creator_idx ON assignments(creator_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('charge', 'platform_fee', 'payout', 'refund')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider_ref TEXT,
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ledger_campaign_idx ON ledger_entries(campaign_id);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('brand', 'creator', 'other')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
