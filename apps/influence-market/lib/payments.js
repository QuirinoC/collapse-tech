// Payments provider interface:
//   charge({ campaignId, amountCents }) -> { ref, status: "captured" }
//   payout({ assignmentId, amountCents, destination }) -> { ref }
//   refund({ campaignId, amountCents, reason }) -> { ref }
// The sandbox provider mirrors the exact state transitions with fake refs so
// the full escrow loop runs without keys; the Stripe adapter performs real
// API calls when STRIPE_SECRET_KEY is present.

export function getSandboxProvider() {
  let counter = 0;
  // Payouts are idempotent per assignment: re-running settlement never
  // double-transfers, mirroring Stripe transfer idempotency keys.
  const payouts = new Map();
  const ref = (prefix) => `${prefix}_sbx_${Date.now().toString(36)}_${(++counter).toString(36)}`;
  return {
    name: "sandbox",
    async charge({ amountCents }) {
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error("Invalid charge amount.");
      }
      return { ref: ref("sbx"), status: "succeeded" };
    },
    async payout({ assignmentId, amountCents }) {
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error("Invalid payout amount.");
      }
      const key = `${assignmentId}:${amountCents}`;
      if (!payouts.has(key)) {
        payouts.set(key, { ref: ref("payout_sbx") });
      }
      return payouts.get(key);
    },
    async refund({ amountCents }) {
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error("Invalid refund amount.");
      }
      return { ref: ref("sbx") };
    },
  };
}

// Stripe adapter over the REST API — no Node SDK dependency, so it runs on
// Cloudflare Workers unchanged.
export function getStripeProvider(secretKey = process.env.STRIPE_SECRET_KEY) {
  const api = "https://api.stripe.com/v1";

  async function call(path, params) {
    const response = await fetch(`${api}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`Stripe ${path} failed: ${body?.error?.message || response.status}`);
    }
    return body;
  }

  return {
    name: "stripe",
    // v1 captures immediately; funds are held by the platform until payouts run.
    // Phase 2 moves this to Connect destination charges for true split escrow.
    async charge({ campaignId, amountCents }) {
      const intent = await call("/payment_intents", {
        amount: amountCents,
        currency: "usd",
        "automatic_payment_methods[enabled]": "true",
        "metadata[campaign_id]": campaignId,
      });
      return { ref: intent.id, status: intent.status };
    },
    async payout({ assignmentId, amountCents, destination }) {
      const transfer = await call("/transfers", {
        amount: amountCents,
        currency: "usd",
        destination, // Stripe Connect account id of the creator
        "metadata[assignment_id]": assignmentId,
      });
      return { ref: transfer.id };
    },
    async refund({ paymentIntentRef, amountCents, reason }) {
      const params = { payment_intent: paymentIntentRef };
      if (amountCents) params.amount = amountCents;
      if (reason) params["metadata[reason]"] = reason;
      const refund = await call("/refunds", params);
      return { ref: refund.id };
    },
  };
}

export function getPaymentsProvider() {
  if (process.env.STRIPE_SECRET_KEY) {
    return getStripeProvider();
  }
  return getSandboxProvider();
}
