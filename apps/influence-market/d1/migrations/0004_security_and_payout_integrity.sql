-- Store only hashes of browser session tokens. Existing plaintext sessions are
-- invalidated so a database read cannot replay an authenticated browser session.
DELETE FROM sessions;

ALTER TABLE assignments ADD COLUMN payout_cents INTEGER;

-- Existing assignments retain the originally quoted payout. New assignments
-- are validated against a deterministic share of any remainder in the trigger.
UPDATE assignments
SET payout_cents = (
  SELECT per_creator_cents
  FROM campaigns
  WHERE campaigns.id = assignments.campaign_id
)
WHERE payout_cents IS NULL;

CREATE TRIGGER IF NOT EXISTS assignments_require_payout_cents_on_insert
BEFORE INSERT ON assignments
FOR EACH ROW
WHEN NEW.payout_cents IS NULL OR NEW.payout_cents <= 0
BEGIN
  SELECT RAISE(ABORT, 'assignment payout must be a positive integer');
END;

CREATE TRIGGER IF NOT EXISTS assignments_require_payout_cents_on_update
BEFORE UPDATE OF payout_cents ON assignments
FOR EACH ROW
WHEN NEW.payout_cents IS NULL OR NEW.payout_cents <= 0
BEGIN
  SELECT RAISE(ABORT, 'assignment payout must be a positive integer');
END;

-- The original acceptance trigger correctly claimed a slot but trusted a
-- payout calculated before that claim. Recreate it to validate the next
-- payout against the transactional roster state, including legacy assignments.
DROP TRIGGER accept_pending_application;

CREATE TRIGGER accept_pending_application
BEFORE INSERT ON assignments
FOR EACH ROW
WHEN NEW.status = 'instructions_sent'
BEGIN
  SELECT RAISE(ABORT, 'application cannot be accepted')
  WHERE NOT EXISTS (
    SELECT 1
    FROM campaigns AS campaign
    JOIN applications AS application
      ON application.campaign_id = campaign.id
    WHERE campaign.id = NEW.campaign_id
      AND application.creator_id = NEW.creator_id
      AND campaign.status = 'open'
      AND campaign.payment_status = 'unpaid'
      AND campaign.slots_remaining > 0
      AND application.status = 'pending'
  );

  SELECT RAISE(ABORT, 'assignment payout does not match the remaining campaign pool')
  WHERE NEW.payout_cents <> (
    SELECT (
      campaign.budget_cents - campaign.fee_cents -
      COALESCE((
        SELECT SUM(assignment.payout_cents)
        FROM assignments AS assignment
        WHERE assignment.campaign_id = campaign.id
      ), 0) +
      campaign.slots_remaining - 1
    ) / campaign.slots_remaining
    FROM campaigns AS campaign
    WHERE campaign.id = NEW.campaign_id
  );

  UPDATE applications
  SET status = 'accepted', decided_at = datetime('now')
  WHERE campaign_id = NEW.campaign_id
    AND creator_id = NEW.creator_id
    AND status = 'pending';

  UPDATE campaigns
  SET slots_remaining = slots_remaining - 1
  WHERE id = NEW.campaign_id;
END;
