import assert from "node:assert/strict";
import test from "node:test";
import {
  billingStatusMessage,
  parseBillingReturn,
  stripBillingParam,
} from "../billing.mjs";
import { canPurchaseStripe, subscriptionMessage } from "../subscription.mjs";

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

test("subscription copy is state-aware", () => {
  assert.equal(
    subscriptionMessage({ authenticated: false }),
    "Log in to get Pro for increased limits.",
  );
  assert.match(
    subscriptionMessage({ isPro: true, trialAvailable: true, currentInterval: "month" }),
    /Pro is active/,
  );
  assert.doesNotMatch(
    subscriptionMessage({ isPro: true, trialAvailable: true }),
    /7 days/i,
  );
  assert.match(
    subscriptionMessage({ isPro: false, trialAvailable: false }),
    /monthly or annual billing/i,
  );
  assert.doesNotMatch(
    subscriptionMessage({ isPro: false, trialAvailable: false }),
    /7 days/i,
  );
  assert.match(
    subscriptionMessage({ isPro: false, trialAvailable: true }),
    /7 days/i,
  );
  assert.match(
    subscriptionMessage({ isPro: true, entitlementSource: "storekit" }),
    /active through Apple/i,
  );
  assert.match(
    subscriptionMessage({ isPro: true, entitlementSource: "stripe" }),
    /active through Stripe/i,
  );
});

test("Stripe purchases are suppressed for Apple-managed Pro accounts", () => {
  assert.equal(canPurchaseStripe({
    stripeEnabled: true,
    authenticated: true,
    communityStandardsAccepted: true,
    isPro: true,
    entitlementSource: "storekit",
  }), false);
  assert.equal(canPurchaseStripe({
    stripeEnabled: true,
    authenticated: true,
    communityStandardsAccepted: true,
    isPro: false,
    entitlementSource: "storekit",
  }), false);
  assert.equal(canPurchaseStripe({
    stripeEnabled: true,
    authenticated: true,
    communityStandardsAccepted: true,
    isPro: false,
    entitlementSource: null,
  }), true);
});
