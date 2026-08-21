ALTER TABLE pixelboard.moderation_actions
    ADD COLUMN IF NOT EXISTS idempotency_key text,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

UPDATE pixelboard.moderation_actions
SET idempotency_key = moderation_action_id::text
WHERE idempotency_key IS NULL;

ALTER TABLE pixelboard.moderation_actions
    ALTER COLUMN idempotency_key SET NOT NULL,
    ADD CONSTRAINT moderation_actions_status_known
        CHECK (status IN ('pending', 'completed', 'failed')) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_moderation_actions_actor_idempotency
    ON pixelboard.moderation_actions (actor_firebase_uid, idempotency_key);

CREATE TABLE IF NOT EXISTS pixelboard.account_warnings (
    warning_id uuid PRIMARY KEY,
    firebase_uid text NOT NULL,
    reason text NOT NULL,
    report_id uuid NULL REFERENCES pixelboard.reports (report_id),
    created_by text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.hidden_regions (
    hidden_region_id uuid PRIMARY KEY,
    report_id uuid NULL REFERENCES pixelboard.reports (report_id),
    region_top integer NOT NULL,
    region_left integer NOT NULL,
    region_width integer NOT NULL,
    region_height integer NOT NULL,
    reason text NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    restored_at timestamptz NULL,
    CONSTRAINT hidden_regions_bounds CHECK (
        region_width BETWEEN 1 AND 64
        AND region_height BETWEEN 1 AND 64
        AND region_width::bigint * region_height::bigint <= 4096
    )
);

CREATE INDEX IF NOT EXISTS ix_hidden_regions_active
    ON pixelboard.hidden_regions (created_at DESC)
    WHERE restored_at IS NULL;

CREATE TABLE IF NOT EXISTS pixelboard.platform_safety_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    placements_frozen boolean NOT NULL,
    ads_disabled boolean NOT NULL,
    reason text NOT NULL,
    updated_by text NOT NULL,
    updated_at timestamptz NOT NULL
);

INSERT INTO pixelboard.platform_safety_state (
    singleton, placements_frozen, ads_disabled, reason, updated_by, updated_at)
VALUES (true, false, true, 'Advertising remains disabled until explicitly enabled.', 'system', now())
ON CONFLICT (singleton) DO NOTHING;
