ALTER TABLE pixelboard.reports
    ADD COLUMN IF NOT EXISTS client_platform text NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS client_version text NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS deduplication_hash bytea NULL;

ALTER TABLE pixelboard.reports
    ALTER COLUMN client_platform DROP DEFAULT,
    ALTER COLUMN client_version DROP DEFAULT;

ALTER TABLE pixelboard.reports
    ADD CONSTRAINT reports_region_bounds
        CHECK (
            region_width BETWEEN 1 AND 64
            AND region_height BETWEEN 1 AND 64
            AND region_width::bigint * region_height::bigint <= 4096
            AND region_top BETWEEN -1000000000 AND 1000000000
            AND region_left BETWEEN -1000000000 AND 1000000000
            AND region_top::bigint + region_height - 1 <= 1000000000
            AND region_left::bigint + region_width - 1 <= 1000000000
        ) NOT VALID,
    ADD CONSTRAINT reports_reason_known
        CHECK (reason IN (
            'explicit_sexual_content',
            'graphic_violence',
            'hate_or_harassment',
            'threat',
            'illegal_content',
            'copyright',
            'other'
        )) NOT VALID,
    ADD CONSTRAINT reports_status_known
        CHECK (status IN ('received', 'under_review', 'actioned', 'closed')) NOT VALID,
    ADD CONSTRAINT reports_note_length
        CHECK (note IS NULL OR char_length(note) <= 500) NOT VALID;

CREATE INDEX IF NOT EXISTS ix_reports_reporter_submitted
    ON pixelboard.reports (reporter_firebase_uid, submitted_at DESC);
