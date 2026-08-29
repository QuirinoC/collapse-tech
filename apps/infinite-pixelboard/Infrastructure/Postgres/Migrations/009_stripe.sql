CREATE TABLE IF NOT EXISTS pixelboard.stripe_customers (
    firebase_uid text PRIMARY KEY,
    stripe_customer_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.stripe_subscriptions (
    stripe_subscription_id text PRIMARY KEY,
    firebase_uid text NOT NULL,
    stripe_customer_id text NOT NULL
        REFERENCES pixelboard.stripe_customers (stripe_customer_id),
    status text NOT NULL,
    price_id text NULL,
    current_period_end timestamptz NOT NULL,
    event_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_stripe_subscriptions_uid
    ON pixelboard.stripe_subscriptions (firebase_uid);
