CREATE TABLE IF NOT EXISTS pixelboard.storekit_account_tokens (
    firebase_uid text PRIMARY KEY,
    app_account_token uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    UNIQUE (firebase_uid, app_account_token)
);

CREATE TABLE IF NOT EXISTS pixelboard.storekit_subscription_owners (
    original_transaction_id text PRIMARY KEY,
    firebase_uid text NOT NULL,
    app_account_token uuid NOT NULL,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (firebase_uid, app_account_token)
        REFERENCES pixelboard.storekit_account_tokens (firebase_uid, app_account_token)
);

CREATE TABLE IF NOT EXISTS pixelboard.storekit_transactions (
    transaction_id text PRIMARY KEY,
    original_transaction_id text NOT NULL
        REFERENCES pixelboard.storekit_subscription_owners (original_transaction_id),
    firebase_uid text NOT NULL,
    product_id text NOT NULL,
    environment text NOT NULL,
    signed_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    received_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_storekit_transactions_subscription_signed
    ON pixelboard.storekit_transactions (original_transaction_id, signed_at DESC);

ALTER TABLE pixelboard.entitlements
    ADD COLUMN IF NOT EXISTS source_signed_at timestamptz NULL;
