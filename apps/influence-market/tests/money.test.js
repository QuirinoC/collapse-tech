import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignFeeCents,
  payoutPoolCents,
  perCreatorPayoutCents,
  assignmentPayoutCents,
  nextAssignmentPayoutCents,
  formatUSD,
} from "../lib/money.js";

test("fee is 18% of budget", () => {
  assert.equal(campaignFeeCents(500000), 90000);
  assert.equal(campaignFeeCents(10000), 1800);
});

test("payout pool is budget minus fee", () => {
  assert.equal(payoutPoolCents(500000), 410000);
});

test("per-creator payout floor-divides and never exceeds pool", () => {
  // $1000 budget, 3 slots -> pool 82000, per creator 27333 (floor)
  const payout = perCreatorPayoutCents(100000, 3);
  assert.equal(payout, Math.floor(82000 / 3));
  assert.ok(payout * 3 <= payoutPoolCents(100000));
});

test("assignment payouts allocate every payout-pool cent exactly once", () => {
  const budget = 100005;
  const slots = 3;
  const payouts = Array.from({ length: slots }, (_, index) =>
    assignmentPayoutCents(budget, slots, index),
  );
  assert.deepEqual(payouts, [27335, 27335, 27334]);
  assert.equal(payouts.reduce((sum, payout) => sum + payout, 0), payoutPoolCents(budget));
});

test("next assignment payout reconciles prior committed slot payouts", () => {
  const campaign = {
    budget_cents: 100000,
    slots_remaining: 2,
  };
  assert.equal(nextAssignmentPayoutCents(campaign, 27334), 27333);
});

test("minimum budget enforced by schema, math still safe at floor", () => {
  const min = 10000;
  assert.equal(campaignFeeCents(min) + payoutPoolCents(min), min);
});

test("formatUSD renders cents", () => {
  assert.equal(formatUSD(590000), "$5,900.00");
});
