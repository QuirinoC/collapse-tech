import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_JSON_BODY_BYTES,
  RequestBodyTooLargeError,
  parseClaimPayload,
  parseTelemetryPayload,
  readJsonBody,
} from "../src/lib/server/request.js";
import { getDatabaseErrorMetadata } from "../src/lib/server/store.js";

test("readJsonBody parses a bounded request", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    body: JSON.stringify({ value: "ok" }),
    headers: { "Content-Type": "application/json" },
  });

  assert.deepEqual(await readJsonBody(request), { value: "ok" });
});

test("readJsonBody rejects oversized streamed requests", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_JSON_BODY_BYTES + 1));
      controller.close();
    },
  });
  const request = new Request("https://example.test/api", {
    method: "POST",
    body,
    duplex: "half",
  });

  await assert.rejects(readJsonBody(request), RequestBodyTooLargeError);
});

test("parseClaimPayload accepts only normalized 256-bit hex guesses", () => {
  assert.deepEqual(parseClaimPayload({ guessHex: ` ${"A1".repeat(32)} ` }), {
    guessHex: "a1".repeat(32),
  });
  assert.equal(parseClaimPayload({ guessHex: "not-a-key" }), null);
  assert.equal(parseClaimPayload(null), null);
});

test("parseTelemetryPayload requires bounded, internally consistent counts", () => {
  assert.deepEqual(
    parseTelemetryPayload({
      attemptsTotal: 10,
      attemptsAuto: 7,
      attemptsManual: 3,
    }),
    { attemptsTotal: 10, attemptsAuto: 7, attemptsManual: 3 }
  );
  assert.equal(
    parseTelemetryPayload({
      attemptsTotal: 10,
      attemptsAuto: 8,
      attemptsManual: 3,
    }),
    null
  );
  assert.equal(
    parseTelemetryPayload({
      attemptsTotal: 100_001,
      attemptsAuto: 100_001,
      attemptsManual: 0,
    }),
    null
  );
});

test("getDatabaseErrorMetadata exposes only a provider and error code", () => {
  assert.deepEqual(
    getDatabaseErrorMetadata({
      provider: "d1",
      message: "error code: SQLITE_CONSTRAINT",
    }),
    { provider: "d1", code: "SQLITE_CONSTRAINT" }
  );
});
