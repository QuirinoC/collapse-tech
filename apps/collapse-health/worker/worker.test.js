import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.js";

const origin = "https://health.collapsetechnologies.com";

function createEnv() {
  const values = new Map();
  return {
    ALLOWED_ORIGIN: origin,
    LEADS: {
      get(key) {
        return values.get(key) ?? null;
      },
      put(key, value) {
        values.set(key, value);
      },
    },
    values,
  };
}

function post(body, requestOrigin = origin) {
  return new Request("https://collapse-health-leads.example.test", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
    },
    body: JSON.stringify(body),
  });
}

test("stores every documented lead field and deduplicates by email", async () => {
  const env = createEnv();
  const payload = {
    name: "Jamie Example",
    email: " JAMIE@EXAMPLE.COM ",
    phone: "+1 555 0100",
    procedure: "Dental implants",
    notes: "Please send launch updates.",
  };

  const first = await worker.fetch(post(payload), env);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  const stored = JSON.parse(env.values.get(`lead:${firstBody.id}`));
  assert.deepEqual(
    {
      name: stored.name,
      email: stored.email,
      phone: stored.phone,
      procedure: stored.procedure,
      notes: stored.notes,
    },
    {
      name: "Jamie Example",
      email: "jamie@example.com",
      phone: "+1 555 0100",
      procedure: "Dental implants",
      notes: "Please send launch updates.",
    },
  );

  const second = await worker.fetch(post(payload), env);
  assert.deepEqual(await second.json(), {
    ok: true,
    id: firstBody.id,
    duplicate: true,
  });
  assert.equal(
    [...env.values.keys()].filter((key) => key.startsWith("lead:")).length,
    1,
  );
});

test("rejects invalid email without writing to KV", async () => {
  const env = createEnv();
  const response = await worker.fetch(post({ email: "not-an-email" }), env);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_email" });
  assert.equal(env.values.size, 0);
});

test("honeypot submissions succeed without storing data", async () => {
  const env = createEnv();
  const response = await worker.fetch(
    post({ email: "bot@example.com", website: "https://spam.test" }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(env.values.size, 0);
});

test("requests allow only the configured production origin", async () => {
  const env = createEnv();
  const allowed = await worker.fetch(
    new Request("https://collapse-health-leads.example.test", {
      method: "OPTIONS",
      headers: { origin },
    }),
    env,
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), origin);

  const denied = await worker.fetch(
    new Request("https://collapse-health-leads.example.test", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    }),
    env,
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);

  const deniedPost = await worker.fetch(
    post({ email: "attacker@example.com" }, "https://evil.example"),
    env,
  );
  assert.equal(deniedPost.status, 403);
  assert.deepEqual(await deniedPost.json(), { error: "origin_not_allowed" });
  assert.equal(env.values.size, 0);
});
