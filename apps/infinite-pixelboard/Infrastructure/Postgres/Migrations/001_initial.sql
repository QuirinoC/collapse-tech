CREATE SCHEMA IF NOT EXISTS pixelboard;

CREATE TABLE IF NOT EXISTS pixelboard.placements (
    placement_id uuid PRIMARY KEY,
    firebase_uid text NOT NULL,
    board_row integer NOT NULL,
    board_column integer NOT NULL,
    color varchar(7) NOT NULL,
    placed_at timestamptz NOT NULL,
    client_platform text NOT NULL,
    client_version text NOT NULL,
    idempotency_key text NOT NULL,
    prior_placement_id uuid NULL REFERENCES pixelboard.placements (placement_id),
    prior_color varchar(7) NOT NULL,
    ip_hash bytea NULL,
    device_hash bytea NULL,
    redis_stream_id text NOT NULL UNIQUE,
    stream_timestamp_ms bigint NOT NULL,
    stream_sequence bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_placements_position_time
    ON pixelboard.placements (board_row, board_column, placed_at DESC);

CREATE INDEX IF NOT EXISTS ix_placements_account_time
    ON pixelboard.placements (firebase_uid, placed_at DESC);

CREATE TABLE IF NOT EXISTS pixelboard.current_pixels (
    board_row integer NOT NULL,
    board_column integer NOT NULL,
    placement_id uuid NOT NULL REFERENCES pixelboard.placements (placement_id),
    stream_timestamp_ms bigint NOT NULL,
    stream_sequence bigint NOT NULL,
    PRIMARY KEY (board_row, board_column)
);

CREATE TABLE IF NOT EXISTS pixelboard.reports (
    report_id uuid PRIMARY KEY,
    reporter_firebase_uid text NOT NULL,
    region_top integer NOT NULL,
    region_left integer NOT NULL,
    region_width integer NOT NULL,
    region_height integer NOT NULL,
    reason text NOT NULL,
    note text NULL,
    status text NOT NULL,
    snapshot jsonb NOT NULL,
    evidence_hash bytea NOT NULL,
    submitted_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_reports_status_submitted
    ON pixelboard.reports (status, submitted_at);

CREATE TABLE IF NOT EXISTS pixelboard.account_bans (
    ban_id uuid PRIMARY KEY,
    firebase_uid text NOT NULL,
    reason text NOT NULL,
    starts_at timestamptz NOT NULL,
    expires_at timestamptz NULL,
    revoked_at timestamptz NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_account_bans_account
    ON pixelboard.account_bans (firebase_uid, starts_at DESC);

CREATE TABLE IF NOT EXISTS pixelboard.moderation_actions (
    moderation_action_id uuid PRIMARY KEY,
    report_id uuid NULL REFERENCES pixelboard.reports (report_id),
    actor_firebase_uid text NOT NULL,
    action_type text NOT NULL,
    reason text NOT NULL,
    details jsonb NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.entitlements (
    firebase_uid text PRIMARY KEY,
    tier text NOT NULL,
    source text NOT NULL,
    source_transaction_id text NULL,
    expires_at timestamptz NULL,
    revoked_at timestamptz NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS pixelboard.audit_events (
    audit_event_id uuid PRIMARY KEY,
    actor_firebase_uid text NULL,
    event_type text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    details jsonb NOT NULL,
    occurred_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_events_subject
    ON pixelboard.audit_events (subject_type, subject_id, occurred_at DESC);
