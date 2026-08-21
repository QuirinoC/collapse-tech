CREATE TABLE IF NOT EXISTS pixelboard.accounts (
    firebase_uid text PRIMARY KEY,
    community_standards_version text NULL,
    community_standards_accepted_at timestamptz NULL,
    updated_at timestamptz NOT NULL
);
