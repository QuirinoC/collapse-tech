import assert from "node:assert/strict";
import test from "node:test";
import {
  capturePendingReferral,
  clearPendingReferral,
  inviteUrl,
  normalizeReferralCode,
  parseBoardPosition,
  positionUrl,
} from "../invite.mjs";

test("invite codes normalize separators and reject lookalikes", () => {
  assert.equal(normalizeReferralCode("ab-cd 23-45"), "ABCD2345");
  assert.equal(normalizeReferralCode("IIIIIIII"), null);
});

test("pending referral is captured from the query string once", () => {
  const storage = memoryStorage();
  assert.equal(capturePendingReferral("?ref=ab-cd2345", storage), "ABCD2345");
  assert.equal(capturePendingReferral("?ref=nope", storage), "ABCD2345");
  clearPendingReferral(storage);
  assert.equal(storage.getItem("pixelboard.pendingReferralCode"), null);
});

test("pending referral survives storage that throws", () => {
  assert.equal(
    capturePendingReferral("?ref=ABCD2345", {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    }),
    "ABCD2345",
  );
});

test("share links encode invite codes and board coordinates", () => {
  assert.equal(
    inviteUrl("ABCD2345"),
    "https://pixelboard.collapsetechnologies.com/?ref=ABCD2345",
  );
  assert.equal(
    positionUrl(-4, 12),
    "https://pixelboard.collapsetechnologies.com/?row=-4&col=12",
  );
  assert.deepEqual(parseBoardPosition("?row=-4&col=12"), { row: -4, column: 12 });
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
