import { test } from "node:test";
import assert from "node:assert/strict";
import { getSandboxProvider } from "../lib/payments.js";
import {
  hashPassword,
  verifyPassword,
} from "../lib/auth.js";

test("sandbox provider charges and returns a ref", async () => {
  const provider = getSandboxProvider();
  const charge = await provider.charge({ campaignId: "c1", amountCents: 590000 });
  assert.ok(charge.ref.startsWith("sbx_"));
  assert.equal(charge.status, "succeeded");
});

test("sandbox provider releases payouts idempotently per assignment", async () => {
  const provider = getSandboxProvider();
  const first = await provider.payout({
    assignmentId: "as-42",
    amountCents: 102500,
    destination: "acct_demo",
  });
  assert.ok(first.ref.startsWith("payout_sbx_"));
  // Same inputs must not mint a new transfer id (idempotency guard).
  const again = await provider.payout({
    assignmentId: "as-42",
    amountCents: 102500,
    destination: "acct_demo",
  });
  assert.equal(again.ref, first.ref);
});

test("scrypt password round-trips and rejects wrong password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^s1:/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong horse", hash), false);
});
