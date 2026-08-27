// Pure campaign escrow state machine. Every transition used by API routes is
// expressed here so it can be unit-tested without a database or HTTP layer.
import { assignmentPayoutCents } from "./money.js";

export const CAMPAIGN_STATUSES = ["open", "funded", "completed", "cancelled"];
export const PAYMENT_STATUSES = ["unpaid", "held", "settled", "refunded"];

export const APPLICATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
];

export const ASSIGNMENT_STATUSES = [
  "instructions_sent", // creator accepted; awaiting product + content
  "submitted", // content delivered, under brand review
  "approved", // brand verified deliverables
  "paid", // platform released funds from held balance
  "rejected", // brand rejected submission; revision loop reopens instructions_sent
  "declined", // brand removed creator before funding
];

export function canApply(campaign) {
  return (
    campaign.status === "open" &&
    campaign.payment_status === "unpaid" &&
    campaign.slots_remaining > 0
  );
}

export function canFund(campaign) {
  return (
    campaign.status === "open" &&
    campaign.payment_status === "unpaid" &&
    campaign.slots_remaining === 0 &&
    !campaign.payment_ref
  );
}

// Funding starts only after the full roster is committed, so every dollar in the
// creator pool is assigned before the brand is charged.
export function canAcceptApplication(campaign, application) {
  return (
    campaign.status === "open" &&
    campaign.payment_status === "unpaid" &&
    campaign.slots_remaining > 0 &&
    application.status === "pending"
  );
}

function acceptanceBlocker(campaign, application) {
  if (campaign.status !== "open") {
    return "Campaign is no longer open.";
  }
  if (campaign.payment_status !== "unpaid") {
    return "Campaign has already been funded.";
  }
  if (campaign.slots_remaining <= 0) {
    return "No slots remaining in this campaign.";
  }
  if (application.status !== "pending") {
    return "Application has already been decided.";
  }
  return null;
}

export function fundCampaign(campaign, now = new Date().toISOString()) {
  assert(canFund(campaign), "Campaign cannot be funded in its current state.");
  return {
    ...campaign,
    status: "funded",
    payment_status: "held",
    funded_at: now,
  };
}

export function acceptApplication(
  campaign,
  application,
  creatorId,
  now = new Date().toISOString(),
  payoutCents = null,
) {
  const blocker = acceptanceBlocker(campaign, application);
  assert(!blocker, blocker || "Application cannot be accepted.");
  const assignmentIndex = campaign.slots - campaign.slots_remaining;
  return {
    campaign: { ...campaign, slots_remaining: campaign.slots_remaining - 1 },
    application: { ...application, status: "accepted", decided_at: now },
    assignment: {
      campaign_id: campaign.id,
      creator_id: creatorId,
      status: "instructions_sent",
      payout_cents:
        payoutCents ??
        assignmentPayoutCents(
          campaign.budget_cents,
          campaign.slots,
          assignmentIndex,
        ),
      content_url: null,
      submitted_at: null,
      reviewed_at: null,
      paid_at: null,
      created_at: now,
    },
  };
}

export function canSubmit(campaign, assignment) {
  return (
    campaign.payment_status === "held" &&
    (assignment.status === "instructions_sent" ||
      assignment.status === "rejected")
  );
}

// Rejected assignments may be revised and resubmitted while funds are held.
export function submitContent(assignment, contentUrl, now = new Date().toISOString()) {
  return {
    ...assignment,
    status: "submitted",
    content_url: contentUrl,
    submitted_at: now,
  };
}

export function reviewSubmission(assignment, decision, now = new Date().toISOString()) {
  assert(assignment.status === "submitted", "Nothing to review.");
  assert(decision === "approve" || decision === "reject", "Invalid decision.");
  if (decision === "approve") {
    return { ...assignment, status: "approved", reviewed_at: now };
  }
  // Reject sends the assignment back to instructions_sent for one revision pass;
  // repeated rejects move it to declined and free the reserved slot logic to ops.
  return { ...assignment, status: "rejected", reviewed_at: now };
}

export function declineApplicationPatch(now = new Date().toISOString()) {
  return { status: "declined", decided_at: now };
}

export function markPaid(assignment, now = new Date().toISOString()) {
  assert(assignment.status === "approved", "Only approved work gets paid.");
  return { ...assignment, status: "paid", paid_at: now };
}

// A campaign completes when every accepted slot reached a terminal state
// (paid or declined). Rejected/instructions/submitted keep it open.
export function isSettled(campaign, assignments) {
  if (campaign.status !== "funded") return false;
  return (
    assignments.length === campaign.slots &&
    assignments.every(
      (a) => a.status === "paid" || a.status === "declined",
    )
  );
}

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = 409;
    throw error;
  }
}
