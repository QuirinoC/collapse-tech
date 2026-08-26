import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signupSchema,
  loginSchema,
  channelSchema,
  profileSchema,
  campaignSchema,
  applicationSchema,
  submissionSchema,
  reviewSchema,
  contactSchema,
} from "../lib/schemas.js";
import { createMemoryStore } from "../lib/memory-store.js";

test("signup requires strong password and valid role", () => {
  assert.throws(() =>
    signupSchema.parse({ email: "x@y.com", password: "short", role: "brand", name: "X" }),
  );
  assert.throws(() =>
    signupSchema.parse({ email: "x@y.com", password: "longenough123", role: "admin", name: "X" }),
  );
  const ok = signupSchema.parse({
    email: "x@y.com",
    password: "longenough123",
    role: "creator",
    name: "Xavier Young",
  });
  assert.equal(ok.role, "creator");
});

test("login schema trims and validates email", () => {
  assert.throws(() => loginSchema.parse({ email: "nope", password: "whatever" }));
});

test("channel schema enforces platform whitelist and follower bounds", () => {
  assert.throws(() => channelSchema.parse({ platform: "myspace", handle: "@a", followers: 10 }));
  assert.doesNotThrow(() =>
    channelSchema.parse({ platform: "tiktok", handle: "@a", followers: 1000, topics: ["food"] }),
  );
});

test("profile schema accepts partial updates only", () => {
  assert.doesNotThrow(() => profileSchema.parse({}));
  assert.throws(() => profileSchema.parse({ minBudgetCents: -5 }));
});

test("campaign schema floors at minimum budget and requires platforms/niches", () => {
  assert.throws(() =>
    campaignSchema.parse({
      title: "Tiny budget test",
      brandName: "Acme",
      brief: "This brief is definitely long enough to pass validation checks.",
      platforms: ["tiktok"],
      niches: ["food"],
      slots: 2,
      budgetCents: 5000,
    }),
  );
  assert.throws(() =>
    campaignSchema.parse({
      title: "No platforms test",
      brandName: "Acme",
      brief: "This brief is definitely long enough to pass validation checks.",
      platforms: [],
      niches: ["food"],
      slots: 2,
      budgetCents: 100000,
    }),
  );
});

test("application pitch has a floor", () => {
  assert.throws(() => applicationSchema.parse({ pitch: "too short" }));
});

test("submission requires URL-shaped content", () => {
  assert.throws(() => submissionSchema.parse({ contentUrl: "not-a-url" }));
  assert.throws(() =>
    submissionSchema.parse({ contentUrl: "javascript:alert(document.cookie)" }),
  );
  assert.throws(() =>
    submissionSchema.parse({ contentUrl: "data:text/html,<h1>not a post</h1>" }),
  );
  assert.doesNotThrow(() =>
    submissionSchema.parse({
      contentUrl: "https://www.tiktok.com/@creator/video/123",
      notes: "First cut with the requested disclosure.",
    }),
  );
});

test("review decision is constrained", () => {
  assert.throws(() => reviewSchema.parse({ decision: "maybe" }));
});

test("contact captures leads", () => {
  const lead = contactSchema.parse({
    name: "Ann Brand",
    email: "ann@brand.com",
    company: "Brand Co",
    message: "We want 8 fitness creators for a spring launch push.",
    kind: "brand",
  });
  assert.equal(lead.email, "ann@brand.com");
  assert.equal(lead.company, "Brand Co");
});

test("memory store seeds six demo creators with channels", async () => {
  const store = createMemoryStore();
  const creators = await store.listCreatorDirectory();
  assert.ok(creators.length >= 6);
  for (const creator of creators) {
    assert.ok(creator.channels.length > 0);
    assert.equal(creator.password_hash, null);
  }
});

test("memory store persists an accepted application as one repository operation", async () => {
  const store = createMemoryStore();
  const brand = await store.createProfile({
    role: "brand",
    email: "brand@example.com",
    password_hash: "hash",
    name: "Brand",
  });
  const creator = (await store.listCreatorDirectory())[0];
  const campaign = await store.insertCampaign({
    brand_id: brand.id,
    brand_name: "Brand",
    title: "Creator campaign",
    brief: "A sufficiently detailed campaign brief for repository testing.",
    platforms: ["tiktok"],
    niches: ["beauty"],
    slots: 1,
    slots_remaining: 1,
    budget_cents: 100000,
    fee_cents: 18000,
    per_creator_cents: 82000,
    status: "open",
    payment_status: "unpaid",
  });
  const application = await store.insertApplication({
    campaign_id: campaign.id,
    creator_id: creator.id,
    pitch: "I make trusted beauty tutorials for this exact audience.",
    status: "pending",
  });

  const acceptance = {
    campaign: { ...campaign, slots_remaining: 0 },
    application: { ...application, status: "accepted", decided_at: new Date().toISOString() },
    assignment: {
      campaign_id: campaign.id,
      creator_id: creator.id,
      status: "instructions_sent",
    },
  };
  const attempts = await Promise.allSettled([
    store.acceptApplication(acceptance),
    store.acceptApplication(acceptance),
  ]);
  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const accepted = fulfilled[0].value;

  assert.equal(accepted.campaign.slots_remaining, 0);
  assert.equal(accepted.application.status, "accepted");
  assert.equal(accepted.assignment.status, "instructions_sent");
  assert.equal(
    (await store.listAssignments({ campaignId: campaign.id })).length,
    1,
  );
});

test("memory ledger deduplicates stable payment operation keys", async () => {
  const store = createMemoryStore();
  const entry = {
    campaign_id: "campaign-1",
    assignment_id: null,
    kind: "charge",
    amount_cents: 500000,
    provider_ref: "sbx_campaign_1_charge",
    operation_key: "campaign:campaign-1:charge",
    memo: "Campaign funding",
  };

  const first = await store.appendLedger(entry);
  const retry = await store.appendLedger(entry);
  assert.equal(retry.id, first.id);
  assert.equal((await store.listLedger()).length, 1);

  await assert.rejects(
    () => store.appendLedger({ ...entry, amount_cents: 499999 }),
    /idempotency key/i,
  );
});

test("conditional application decline cannot overwrite an acceptance", async () => {
  const store = createMemoryStore();
  const application = await store.insertApplication({
    campaign_id: "campaign-race",
    creator_id: "creator-race",
    pitch: "A sufficiently detailed pitch for the decision race test.",
    status: "pending",
  });
  await store.updateApplication(application.id, { status: "accepted" });

  const staleDecline = await store.declineApplication(
    application.id,
    new Date().toISOString(),
  );
  assert.equal(staleDecline, null);
  assert.equal((await store.getApplication(application.id)).status, "accepted");
});

test("approval and rejection claims are mutually exclusive", async () => {
  const store = createMemoryStore();
  const first = await store.insertAssignment({
    campaign_id: "campaign-review-race",
    creator_id: "creator-review-a",
    status: "submitted",
  });
  const approved = await store.claimAssignmentApproval(first.id, {
    reviewedAt: new Date().toISOString(),
    notes: "Approved",
  });
  assert.equal(approved.status, "approved");
  assert.equal(
    await store.rejectAssignment(first.id, {
      reviewedAt: new Date().toISOString(),
      notes: "Rejected",
    }),
    null,
  );

  const second = await store.insertAssignment({
    campaign_id: "campaign-review-race",
    creator_id: "creator-review-b",
    status: "submitted",
  });
  const rejected = await store.rejectAssignment(second.id, {
    reviewedAt: new Date().toISOString(),
    notes: "Rejected",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(
    await store.claimAssignmentApproval(second.id, {
      reviewedAt: new Date().toISOString(),
      notes: "Approved",
    }),
    null,
  );
});
