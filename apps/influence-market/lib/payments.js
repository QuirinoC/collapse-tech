export class PaymentsUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentsUnavailableError";
    this.statusCode = 503;
  }
}

export function getSandboxProvider() {
  return {
    name: "sandbox",
    async charge({ campaignId, amountCents, idempotencyKey }) {
      assertAmount(amountCents, "charge");
      return {
        ref: sandboxRef(
          "sbx",
          idempotencyKey || `campaign:${campaignId}:charge:${amountCents}`,
        ),
        status: "succeeded",
      };
    },
    async payout({ assignmentId, amountCents, idempotencyKey }) {
      assertAmount(amountCents, "payout");
      return {
        ref: sandboxRef(
          "payout_sbx",
          idempotencyKey || `assignment:${assignmentId}:payout:${amountCents}`,
        ),
      };
    },
    async refund({ amountCents, idempotencyKey }) {
      assertAmount(amountCents, "refund");
      return { ref: sandboxRef("sbx", idempotencyKey) };
    },
  };
}

export function getPaymentsStatus(env = process.env) {
  const explicitMode = env.PAYMENTS_MODE?.trim().toLowerCase();
  if (explicitMode === "sandbox" && env.NODE_ENV !== "production") {
    return {
      ready: true,
      mode: "sandbox",
      message: "Sandbox payments are enabled for testing.",
    };
  }
  if (explicitMode === "sandbox") {
    return {
      ready: false,
      mode: "disabled",
      message:
        "Sandbox payments are blocked in production. Online funding is not enabled yet.",
    };
  }
  if (!explicitMode && env.NODE_ENV !== "production") {
    return {
      ready: true,
      mode: "sandbox",
      message: "Sandbox payments are enabled for local development.",
    };
  }
  return {
    ready: false,
    mode: explicitMode || "disabled",
    message:
      "Online funding is not enabled yet. Contact the Influence.Market team to fund this campaign.",
  };
}

export function getPaymentsProvider(env = process.env) {
  const status = getPaymentsStatus(env);
  if (status.ready && status.mode === "sandbox") {
    return getSandboxProvider();
  }
  throw new PaymentsUnavailableError(status.message);
}

function assertAmount(amountCents, operation) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error(`Invalid ${operation} amount.`);
  }
}

function sandboxRef(prefix, idempotencyKey) {
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new Error("A stable idempotency key is required.");
  }
  return `${prefix}_${idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
