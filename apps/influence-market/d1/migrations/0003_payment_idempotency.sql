ALTER TABLE ledger_entries ADD COLUMN operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_operation_key_idx
ON ledger_entries(operation_key);
