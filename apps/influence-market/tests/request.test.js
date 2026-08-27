import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_JSON_BODY_BYTES,
  RequestBodyError,
  parseJsonBody,
} from "../lib/request.js";
import { publicCreatorProfile } from "../lib/public-profile.js";

test("bounded JSON parser reads valid requests", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ brief: "A valid campaign brief." }),
  });
  assert.deepEqual(await parseJsonBody(request), {
    brief: "A valid campaign brief.",
  });
});

test("bounded JSON parser rejects oversized declared and streamed bodies", async () => {
  const oversizedDeclared = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": String(MAX_JSON_BODY_BYTES + 1) },
    body: "{}",
  });

  await assert.rejects(
    () => parseJsonBody(oversizedDeclared),
    (error) => error instanceof RequestBodyError && error.statusCode === 413,
  );

  const oversizedStream = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ content: "x".repeat(MAX_JSON_BODY_BYTES) }),
  });
  await assert.rejects(
    () => parseJsonBody(oversizedStream),
    (error) => error instanceof RequestBodyError && error.statusCode === 413,
  );
});

test("bounded JSON parser accepts a largest-field multilingual campaign", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({
      title: "文".repeat(120),
      brandName: "文".repeat(80),
      brief: "文".repeat(4000),
      productInfo: "文".repeat(1500),
      demographics: "文".repeat(300),
      platforms: ["tiktok"],
      niches: ["beauty"],
      slots: 1,
      budgetCents: 100000,
    }),
  });
  assert.equal((await parseJsonBody(request)).brief.length, 4000);
});

test("public creator profiles omit credentials and contact email", () => {
  assert.deepEqual(
    publicCreatorProfile({
      id: "creator-1",
      email: "creator@example.com",
      password_hash: "s1:secret",
      name: "Creator",
    }),
    { id: "creator-1", name: "Creator" },
  );
});
