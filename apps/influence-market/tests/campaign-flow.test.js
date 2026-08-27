import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canApply,
  canFund,
  canSubmit,
  canAcceptApplication,
  fundCampaign,
  acceptApplication,
  submitContent,
  reviewSubmission,
  markPaid,
  declineApplicationPatch,
  isSettled,
} from "../lib/campaign-flow.js";
import { nextAssignmentPayoutCents } from "../lib/money.js";

function campaign(overrides = {}) {
  return {
    id: "c1",
    status: "open",
    payment_status: "unpaid",
    slots: 2,
    slots_remaining: 2,
    budget_cents: 100000,
    ...overrides,
  };
}

function application(overrides = {}) {
  return { id: "a1", status: "pending", campaign_id: "c1", ...overrides };
}

function assignment(overrides = {}) {
  return {
    id: "as1",
    campaign_id: "c1",
    creator_id: "u1",
    status: "instructions_sent",
    content_url: null,
    submitted_at: null,
    reviewed_at: null,
    paid_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test("open unfunded campaign accepts applications but waits for a full roster", () => {
  const c = campaign();
  assert.equal(canApply(c), true);
  assert.equal(canFund(c), false);
  assert.equal(canFund(campaign({ slots_remaining: 0 })), true);
  assert.equal(
    canFund(
      campaign({
        slots_remaining: 0,
        payment_ref: "pending:campaign:c1:charge",
      }),
    ),
    false,
  );
});

test("cannot apply when no slots remain", () => {
  assert.equal(canApply(campaign({ slots_remaining: 0 })), false);
});

test("accept decrements slots and issues instructions_sent assignment", () => {
  const result = acceptApplication(campaign(), application(), "creator-1");
  assert.equal(result.campaign.slots_remaining, 1);
  assert.equal(result.application.status, "accepted");
  assert.equal(result.assignment.status, "instructions_sent");
  assert.equal(result.assignment.creator_id, "creator-1");
  assert.equal(result.assignment.payout_cents, 41000);
});

test("accept throws for pending application when full", () => {
  assert.equal(
    canAcceptApplication(campaign({ slots_remaining: 0 }), application()),
    false,
  );
  assert.throws(
    () =>
      acceptApplication(campaign({ slots_remaining: 0 }), application(), "c-9"),
    /slots/i,
  );
});

test("accept rejects funded campaigns and assigns deterministic remainder cents", () => {
  assert.equal(
    canAcceptApplication(
      campaign({ payment_status: "held" }),
      application(),
    ),
    false,
  );
  assert.throws(
    () =>
      acceptApplication(
        campaign({ payment_status: "held" }),
        application(),
        "creator-1",
      ),
    /funded/i,
  );

  const result = acceptApplication(
    campaign({ slots: 3, slots_remaining: 3, budget_cents: 100005 }),
    application(),
    "creator-1",
  );
  assert.equal(result.assignment.payout_cents, 27335);
});

test("accept matches the remaining pool after a legacy floor allocation", () => {
  const legacyCampaign = campaign({
    slots: 3,
    slots_remaining: 2,
    budget_cents: 100000,
  });
  const result = acceptApplication(
    legacyCampaign,
    application(),
    "creator-2",
    undefined,
    nextAssignmentPayoutCents(legacyCampaign, 27333),
  );
  assert.equal(result.assignment.payout_cents, 27334);
});

test("fund transitions to funded/held", () => {
  const next = fundCampaign(campaign({ slots_remaining: 0 }));
  assert.equal(next.status, "funded");
  assert.equal(next.payment_status, "held");
});

test("submission requires held funds and instructions_sent state", () => {
  const asg = assignment();
  assert.equal(
    canSubmit({ payment_status: "unpaid" }, asg),
    false,
    "unpaid campaigns block submissions",
  );
  const submitted = submitContent(asg, "https://example.com/post");
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.content_url, "https://example.com/post");
});

test("rejected assignments can resubmit while funds are held", () => {
  let asg = assignment();
  asg = reviewSubmission(submitContent(asg, "https://x.com/p"), "reject");
  assert.equal(asg.status, "rejected");
  assert.equal(
    canSubmit({ payment_status: "held" }, asg),
    true,
    "revision loop must reopen after rejection",
  );
});

test("approve then markPaid reaches terminal paid state", () => {
  let asg = assignment();
  asg = reviewSubmission(submitContent(asg, "https://x.com/p"), "approve");
  assert.equal(asg.status, "approved");
  asg = markPaid(asg);
  assert.equal(asg.status, "paid");
});

test("reject reopens revision loop via rejected status", () => {
  let asg = assignment();
  asg = reviewSubmission(submitContent(asg, "https://x.com/p"), "reject");
  assert.equal(asg.status, "rejected");
  assert.throws(() => markPaid(asg), /approved/);
});

test("decline patch freezes application", () => {
  const patch = declineApplicationPatch();
  assert.equal(patch.status, "declined");
  assert.ok(patch.decided_at);
});

test("campaign settles only when every assignment is terminal", () => {
  const paid = markPaid(reviewSubmission(
    submitContent(assignment(), "https://x.com/a"),
    "approve",
  ));
  assert.equal(isSettled(campaign({ status: "funded", slots: 1 }), [paid]), true);
  assert.equal(
    isSettled(campaign({ status: "funded", slots: 2 }), [paid]),
    false,
    "a partially filled roster cannot strand the remaining creator pool",
  );
  assert.equal(
    isSettled(campaign({ status: "funded", slots: 2 }), [paid, assignment()]),
    false,
  );
  assert.equal(isSettled(campaign({ status: "funded", slots: 1 }), []), false);
  assert.equal(isSettled(campaign({ status: "open", slots: 1 }), [paid]), false);
});
