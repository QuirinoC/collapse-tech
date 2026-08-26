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
  if (!Number.isInteger(slots) || slots < 1) {
    throw new Error("Slots must be a positive integer.");
  }
  return Math.floor(payoutPoolCents(budgetCents) / slots);
}

export function formatUSD(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
