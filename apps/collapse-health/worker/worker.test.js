import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.js";

const origin = "https://health.collapsetechnologies.com";

function createEnv() {
  return { ALLOWED_ORIGIN: origin };
}

function post(requestOrigin = origin) {
  return new Request("https://collapse-health-leads.example.test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    },
    body: JSON.stringify({
      email: "person@example.com",
      consent: true,
      notes: "Sensitive information must never be retained.",
    }),
  });
}

test("does not accept or process public registrations", async () => {
  const response = await worker.fetch(post(), createEnv());

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "not_available" });
});

test("requires the configured browser origin before responding to registration requests", async () => {
  const missingOrigin = await worker.fetch(post(null), createEnv());
  assert.equal(missingOrigin.status, 403);

  const denied = await worker.fetch(post("https://evil.example"), createEnv());
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("answers CORS preflight only for the configured origin", async () => {
  const allowed = await worker.fetch(
    new Request("https://collapse-health-leads.example.test", {
      method: "OPTIONS",
      headers: { origin },
    }),
    createEnv(),
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
  assert.equal(allowed.headers.get("access-control-allow-methods"), "POST, OPTIONS");

  const denied = await worker.fetch(
    new Request("https://collapse-health-leads.example.test", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    }),
    createEnv(),
  );
  assert.equal(denied.status, 403);
});

test("rejects unsupported methods", async () => {
  const response = await worker.fetch(
    new Request("https://collapse-health-leads.example.test", { headers: { origin } }),
    createEnv(),
  );

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "method_not_allowed" });
});
