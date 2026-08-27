import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPaymentsProvider,
  getPaymentsStatus,
  getSandboxProvider,
  PaymentsUnavailableError,
} from "../lib/payments.js";
import {
  hashPassword,
  verifyPassword,
  hashSessionToken,
} from "../lib/auth.js";

test("sandbox provider charges and returns a ref", async () => {
  const charge = await getSandboxProvider().charge({
    campaignId: "c1",
    amountCents: 590000,
    idempotencyKey: "campaign:c1:charge",
  });
  assert.ok(charge.ref.startsWith("sbx_"));
  assert.equal(charge.status, "succeeded");
  const retry = await getSandboxProvider().charge({
    campaignId: "c1",
    amountCents: 590000,
    idempotencyKey: "campaign:c1:charge",
  });
  assert.equal(retry.ref, charge.ref);
});

test("sandbox provider releases payouts idempotently per assignment", async () => {
  const first = await getSandboxProvider().payout({
    assignmentId: "as-42",
    amountCents: 102500,
    destination: "acct_demo",
    idempotencyKey: "assignment:as-42:payout",
  });
  assert.ok(first.ref.startsWith("payout_sbx_"));
  // A different Worker isolate/provider instance must return the same transfer.
  const again = await getSandboxProvider().payout({
    assignmentId: "as-42",
    amountCents: 102500,
    destination: "acct_demo",
    idempotencyKey: "assignment:as-42:payout",
  });
  assert.equal(again.ref, first.ref);
});

test("production payments fail closed unless sandbox is explicitly enabled", () => {
  const disabled = getPaymentsStatus({ NODE_ENV: "production" });
  assert.equal(disabled.ready, false);
  assert.throws(
    () => getPaymentsProvider({ NODE_ENV: "production" }),
    PaymentsUnavailableError,
  );

  const sandbox = getPaymentsStatus({
    NODE_ENV: "production",
    PAYMENTS_MODE: "sandbox",
  });
  assert.equal(sandbox.ready, false);
  assert.equal(sandbox.mode, "disabled");
});

test("scrypt password round-trips and rejects wrong password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^s1:/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong horse", hash), false);
});

test("session tokens are stored as stable non-replayable hashes", () => {
  const token = "2b3f2a40-d865-4690-a953-db53caf7385c";
  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.notEqual(hashSessionToken(token), token);
  assert.match(hashSessionToken(token), /^[a-f0-9]{64}$/);
});
