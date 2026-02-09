import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { sha256Hex } from "../src/lib/shared/hash.js";

if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

test("sha256Hex matches node crypto", async () => {
  const inputHex = "00".repeat(32);
  const expected = crypto
    .createHash("sha256")
    .update(Buffer.from(inputHex, "hex"))
    .digest("hex");

  const result = await sha256Hex(inputHex);
  assert.equal(result, expected);
});
