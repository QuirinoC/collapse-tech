// All money is handled in integer cents. No floats, ever.
export const TAKE_RATE_BPS = 1800; // 18% platform fee, basis points of gross budget

export const MIN_CAMPAIGN_BUDGET_CENTS = 10000; // $100
export const MAX_CAMPAIGN_BUDGET_CENTS = 100000000; // $1M

export function campaignFeeCents(budgetCents) {
  return Math.round((budgetCents * TAKE_RATE_BPS) / 10000);
}

export function payoutPoolCents(budgetCents) {
  return budgetCents - campaignFeeCents(budgetCents);
}

// Equal split across slots; remainder stays with the platform until final
// settlement reconciles it (prevents losing cents to integer division).
export function perCreatorPayoutCents(budgetCents, slots) {
  assertSlots(slots);
  return Math.floor(payoutPoolCents(budgetCents) / slots);
}

export function assignmentPayoutCents(budgetCents, slots, assignmentIndex) {
  assertSlots(slots);
  if (
    !Number.isInteger(assignmentIndex) ||
    assignmentIndex < 0 ||
    assignmentIndex >= slots
  ) {
    throw new Error("Assignment index must identify a campaign slot.");
  }
  const payoutPool = payoutPoolCents(budgetCents);
  return (
    Math.floor(payoutPool / slots) +
    (assignmentIndex < payoutPool % slots ? 1 : 0)
  );
}

export function nextAssignmentPayoutCents(
  campaign,
  committedPayoutCents,
) {
  assertSlots(campaign.slots_remaining);
  if (!Number.isInteger(committedPayoutCents) || committedPayoutCents < 0) {
    throw new Error("Committed payouts must be a non-negative integer.");
  }
  const remainingPayoutCents =
    payoutPoolCents(campaign.budget_cents) - committedPayoutCents;
  if (remainingPayoutCents <= 0) {
    throw new Error("No payout remains for this campaign.");
  }
  return Math.ceil(remainingPayoutCents / campaign.slots_remaining);
}

export function formatUSD(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function assertSlots(slots) {
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error("Slots must be a positive integer.");
  }
}
