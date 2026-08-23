import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAdmin,
  assertProviderConfiguration,
  requestFingerprint,
} from "../src/lib/request.js";

test("request fingerprints are stable without retaining an address", () => {
  process.env.REQUEST_HASH_SALT = "test-salt";
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
  });
  const fingerprint = requestFingerprint(request);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes("203.0.113.10"), false);
});

test("provider configuration reports missing variables", () => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_API_KEY",
    "SEARCHAPI_API_KEY",
    "REQUEST_HASH_SALT",
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  assert.throws(assertProviderConfiguration, /Import service is not configured/);
  for (const name of names) {
    if (previous[name] !== undefined) process.env[name] = previous[name];
  }
});

test("admin authorization requires the exact bearer token", () => {
  process.env.ADMIN_API_TOKEN = "correct-token";
  assert.doesNotThrow(() =>
    assertAdmin(
      new Request("https://example.test", {
        headers: { authorization: "Bearer correct-token" },
      }),
    ),
  );
  assert.throws(
    () =>
      assertAdmin(
        new Request("https://example.test", {
          headers: { authorization: "Bearer wrong-token" },
        }),
      ),
    /Unauthorized/,
  );
});
