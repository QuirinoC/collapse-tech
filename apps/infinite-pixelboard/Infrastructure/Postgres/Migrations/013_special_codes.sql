ALTER TABLE pixelboard.paint_boosts
    DROP CONSTRAINT IF EXISTS paint_boosts_cooldown_seconds_check;

ALTER TABLE pixelboard.paint_boosts
    ADD CONSTRAINT paint_boosts_cooldown_seconds_check
        CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 10);

CREATE TABLE IF NOT EXISTS pixelboard.special_codes (
    code text PRIMARY KEY,
    cooldown_seconds integer NOT NULL
        CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 10),
    code_expires_at timestamptz NULL,
    benefit_duration_seconds integer NULL
        CHECK (benefit_duration_seconds IS NULL OR benefit_duration_seconds >= 1),
    benefit_expires_at timestamptz NULL,
    created_by_firebase_uid text NULL,
    note text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT special_codes_format
        CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4,16}$'),
    CONSTRAINT special_codes_benefit_present
        CHECK (
            benefit_duration_seconds IS NOT NULL
            OR benefit_expires_at IS NOT NULL
        )
);

CREATE TABLE IF NOT EXISTS pixelboard.special_code_redemptions (
    code text NOT NULL
        REFERENCES pixelboard.special_codes (code) ON DELETE CASCADE,
    firebase_uid text NOT NULL
        REFERENCES pixelboard.accounts (firebase_uid) ON DELETE CASCADE,
    redeemed_at timestamptz NOT NULL DEFAULT now(),
    benefit_expires_at timestamptz NOT NULL,
    PRIMARY KEY (code, firebase_uid)
);

CREATE INDEX IF NOT EXISTS special_code_redemptions_uid_idx
    ON pixelboard.special_code_redemptions (firebase_uid);
