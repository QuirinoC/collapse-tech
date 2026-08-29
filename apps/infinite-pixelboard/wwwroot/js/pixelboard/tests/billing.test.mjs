import assert from "node:assert/strict";
import test from "node:test";
import {
  billingStatusMessage,
  parseBillingReturn,
  stripBillingParam,
} from "../billing.mjs";

test("billing return values are read from the query string", () => {
  assert.equal(parseBillingReturn("?billing=success"), "success");
  assert.equal(parseBillingReturn("?row=1&billing=cancel"), "cancel");
  assert.equal(parseBillingReturn("?billing=manage"), "manage");
  assert.equal(parseBillingReturn("?billing=nope"), null);
  assert.equal(parseBillingReturn(""), null);
});

test("billing query parameter is stripped without dropping board coordinates", () => {
  assert.equal(
    stripBillingParam("/?row=-4&col=12&billing=success"),
    "/?row=-4&col=12",
  );
  assert.equal(stripBillingParam("/?billing=cancel"), "/");
});

test("return copy does not claim the cooldown is gone", () => {
  assert.match(
    billingStatusMessage("success", { isPro: true }),
    /1 second/,
  );
  assert.doesNotMatch(
    billingStatusMessage("success", { isPro: true }),
    /unlimited|no limits|draw freely/i,
  );
  assert.equal(
    billingStatusMessage("cancel"),
    "Checkout was canceled. You were not charged.",
  );
});
