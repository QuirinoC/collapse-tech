ALTER TABLE campaigns ADD COLUMN brand_name TEXT;
ALTER TABLE assignments ADD COLUMN notes TEXT;
ALTER TABLE leads ADD COLUMN company TEXT;

CREATE TRIGGER IF NOT EXISTS accept_pending_application
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

  UPDATE applications
  SET status = 'accepted', decided_at = datetime('now')
  WHERE campaign_id = NEW.campaign_id
    AND creator_id = NEW.creator_id
    AND status = 'pending';

  UPDATE campaigns
  SET slots_remaining = slots_remaining - 1
  WHERE id = NEW.campaign_id;
END;
