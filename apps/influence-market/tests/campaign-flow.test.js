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

function campaign(overrides = {}) {
  return {
    id: "c1",
    status: "open",
    payment_status: "unpaid",
    slots: 2,
    slots_remaining: 2,
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

test("open unfunded campaign accepts applications and funding", () => {
  const c = campaign();
  assert.equal(canApply(c), true);
  assert.equal(canFund(c), true);
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

test("fund transitions to funded/held", () => {
  const next = fundCampaign(campaign());
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
  assert.equal(isSettled("funded", [paid]), true);
  assert.equal(isSettled("funded", [paid, assignment()]), false);
  assert.equal(isSettled("funded", []), false);
  assert.equal(isSettled("open", [paid]), false);
});
