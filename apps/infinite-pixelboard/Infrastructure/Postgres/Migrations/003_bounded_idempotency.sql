ALTER TABLE pixelboard.placements
    DROP CONSTRAINT IF EXISTS placements_firebase_uid_idempotency_key_key;

CREATE INDEX IF NOT EXISTS ix_placements_account_idempotency
    ON pixelboard.placements (firebase_uid, idempotency_key);
