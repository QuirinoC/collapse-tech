CREATE TABLE IF NOT EXISTS pixelboard.deleted_accounts (
    account_hash bytea PRIMARY KEY,
    anonymized_id text NOT NULL UNIQUE,
    deleted_at timestamptz NOT NULL
);
