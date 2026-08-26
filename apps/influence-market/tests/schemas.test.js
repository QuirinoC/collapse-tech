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
