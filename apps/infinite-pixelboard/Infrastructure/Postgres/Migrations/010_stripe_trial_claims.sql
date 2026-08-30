CREATE TABLE IF NOT EXISTS pixelboard.stripe_trial_claims (
    firebase_uid text PRIMARY KEY,
    claimed_at timestamptz NOT NULL
);
