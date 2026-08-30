CREATE TABLE IF NOT EXISTS pixelboard.notification_digest_counters (
    firebase_uid text NOT NULL,
    event_day date NOT NULL,
    event_count integer NOT NULL DEFAULT 0,
    digest_sent_at timestamptz NULL,
    PRIMARY KEY (firebase_uid, event_day)
);
