CREATE TABLE IF NOT EXISTS pixelboard.push_devices (
    installation_id uuid PRIMARY KEY,
    firebase_uid text NOT NULL,
    apns_token text NOT NULL,
    environment text NOT NULL,
    bundle_id text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL,
    invalidated_at timestamptz NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT ck_push_devices_environment
        CHECK (environment IN ('production', 'sandbox'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_push_devices_uid_token
    ON pixelboard.push_devices (firebase_uid, apns_token);

CREATE INDEX IF NOT EXISTS ix_push_devices_uid
    ON pixelboard.push_devices (firebase_uid)
    WHERE enabled;

CREATE TABLE IF NOT EXISTS pixelboard.notification_preferences (
    firebase_uid text PRIMARY KEY,
    board_activity_enabled boolean NOT NULL DEFAULT true,
    broadcast_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.notification_campaigns (
    campaign_id uuid PRIMARY KEY,
    created_by text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    expires_at timestamptz NULL,
    recipient_count integer NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.notification_outbox (
    notification_id uuid PRIMARY KEY,
    recipient_firebase_uid text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    payload jsonb NOT NULL,
    campaign_id uuid NULL,
    expires_at timestamptz NULL,
    dedupe_key text NULL,
    available_at timestamptz NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0,
    claimed_at timestamptz NULL,
    claimed_by text NULL,
    sent_at timestamptz NULL,
    last_error text NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT ck_notification_outbox_category
        CHECK (category IN ('board_activity', 'broadcast'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_outbox_dedupe
    ON pixelboard.notification_outbox (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_notification_outbox_pending
    ON pixelboard.notification_outbox (available_at, claimed_at)
    WHERE sent_at IS NULL;
