CREATE TABLE IF NOT EXISTS trust.phone_sends (
    send_id bigserial PRIMARY KEY,
    account_id uuid NOT NULL,
    sent_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_phone_sends_sent_at
    ON trust.phone_sends (sent_at);

CREATE INDEX IF NOT EXISTS ix_phone_sends_account_sent
    ON trust.phone_sends (account_id, sent_at);
