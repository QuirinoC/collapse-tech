import assert from "node:assert/strict";
import test from "node:test";
import { evaluateClaim } from "../src/lib/server/claim.js";

const secretHex = "a1".repeat(32);
process.env.SECRET_KEY_HEX = secretHex;

test("evaluateClaim returns won for correct guess", async () => {
  const status = await evaluateClaim({ guessHex: secretHex, alreadyWon: false });
  assert.equal(status, "won");
});

test("evaluateClaim returns nope for wrong guess", async () => {
  const status = await evaluateClaim({ guessHex: "b2".repeat(32), alreadyWon: false });
  assert.equal(status, "nope");
});

test("evaluateClaim returns already_won when challenge ended", async () => {
  const status = await evaluateClaim({ guessHex: secretHex, alreadyWon: true });
  assert.equal(status, "already_won");
});
