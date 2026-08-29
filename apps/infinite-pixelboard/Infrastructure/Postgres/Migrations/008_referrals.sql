CREATE TABLE IF NOT EXISTS pixelboard.referral_codes (
    firebase_uid text PRIMARY KEY
        REFERENCES pixelboard.accounts (firebase_uid) ON DELETE CASCADE,
    code text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT referral_codes_format
        CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$')
);

CREATE TABLE IF NOT EXISTS pixelboard.referral_attributions (
    referee_firebase_uid text PRIMARY KEY,
    referrer_firebase_uid text NOT NULL,
    code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT referral_attributions_not_self
        CHECK (referee_firebase_uid <> referrer_firebase_uid)
);

CREATE INDEX IF NOT EXISTS referral_attributions_referrer_created_idx
    ON pixelboard.referral_attributions (referrer_firebase_uid, created_at);

CREATE TABLE IF NOT EXISTS pixelboard.paint_boosts (
    firebase_uid text PRIMARY KEY,
    cooldown_seconds integer NOT NULL
        CHECK (cooldown_seconds >= 1 AND cooldown_seconds <= 10),
    expires_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
