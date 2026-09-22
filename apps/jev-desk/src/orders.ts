import { wouldCross, type MarketSpec } from "./spec.js";
import type { Lots, Px } from "./money.js";

/**
 * Kuru JS `@kuru-labs/kuru-sdk` GTC.placeLimit has no clientOrderId.
 * Durable key is our intentId + paper nonce (and later txhash). Python SDK has `cloid`; JS does not.
 */
export type OrderStatus = "pending" | "confirmed" | "failed" | "unknown" | "canceled";

export type Side = "bid" | "ask";

export interface Intent {
  intentId: string;
  nonce: number;
  side: Side;
  price: Px;
  size: Lots;
  postOnly: true;
  createdBlock: number;
  status: OrderStatus;
  venueOrderId?: string;
  remaining: Lots;
  filled: Lots;
  notionalFilled: bigint;
  failReason?: string;
  liveFromBlock?: number;
}

export interface SerializedOrders {
  seq: number;
  nonce: number;
  intents: Intent[];
}

export interface SubmitResult {
  intent: Intent;
  /** Same intentId. Never minted on unknown-resolve. */
  intentId: string;
}

export class OrderMachine {
  private seq = 0;
  private nonce = 0;
  private readonly byId = new Map<string, Intent>();

  constructor(readonly spec: MarketSpec) {}

  serialize(): SerializedOrders {
    return { seq: this.seq, nonce: this.nonce, intents: [...this.byId.values()].map((i) => ({ ...i })) };
  }

  static restore(spec: MarketSpec, snap: SerializedOrders): OrderMachine {
    const sm = new OrderMachine(spec);
    sm.seq = snap.seq;
    sm.nonce = snap.nonce;
    for (const i of snap.intents) sm.byId.set(i.intentId, { ...i });
    return sm;
  }

  /** Persist intent before any future send. */
  persist(side: Side, price: Px, size: Lots, createdBlock: number): Intent {
    this.nonce += 1;
    this.seq += 1;
    const intent: Intent = {
      intentId: `int-${this.seq}`,
      nonce: this.nonce,
      side,
      price,
      size,
      postOnly: true,
      createdBlock,
      status: "pending",
      remaining: size,
      filled: 0n,
      notionalFilled: 0n,
    };
    this.byId.set(intent.intentId, intent);
    return intent;
  }

  get(intentId: string): Intent | undefined {
    return this.byId.get(intentId);
  }

  all(): Intent[] {
    return [...this.byId.values()];
  }

  /**
   * Paper send. Post-only that would match reverts — no rest, status failed.
   * Crossing is a revert, not snap-to-touch.
   */
  submitPaper(
    intentId: string,
    bookBid: Px,
    bookAsk: Px,
    liveFromBlock: number,
    venueOrderId: string,
  ): SubmitResult {
    const intent = this.require(intentId);
    if (intent.status !== "pending" && intent.status !== "unknown") {
      return { intent, intentId };
    }
    if (wouldCross(intent.side, intent.price, bookBid, bookAsk)) {
      intent.status = "failed";
      intent.failReason = "post_only_revert";
      return { intent, intentId };
    }
    intent.status = "confirmed";
    intent.venueOrderId = venueOrderId;
    intent.liveFromBlock = liveFromBlock;
    return { intent, intentId };
  }

  /** Timeout / lost ack. Same intent id. Never invent a replacement id. */
  markUnknown(intentId: string): Intent {
    const intent = this.require(intentId);
    if (intent.status === "confirmed" || intent.status === "failed" || intent.status === "canceled") return intent;
    intent.status = "unknown";
    return intent;
  }

  /**
   * Unknown is only resolved by query, never by opening a new intent.
   * Paper query reads the persisted send attempt for this id.
   */
  query(intentId: string): Intent {
    return this.require(intentId);
  }

  resolveUnknown(intentId: string, into: "confirmed" | "failed", opts?: { venueOrderId?: string; reason?: string }): Intent {
    const intent = this.require(intentId);
    if (intent.status !== "unknown") return intent;
    intent.status = into;
    if (into === "confirmed") {
      if (opts?.venueOrderId) intent.venueOrderId = opts.venueOrderId;
      if (!intent.venueOrderId) throw new Error("cannot confirm unknown without venueOrderId from query");
    } else {
      intent.failReason = opts?.reason ?? "query_failed";
    }
    return intent;
  }

  cancel(intentId: string, reason = "cancel"): Intent {
    const intent = this.require(intentId);
    if (intent.status === "failed") return intent;
    intent.status = "canceled";
    intent.failReason = reason;
    intent.remaining = 0n;
    return intent;
  }

  /** Pull leftovers on crash-restart. Fills stay; quotes do not. */
  pullConfirmed(reason = "restart-pull"): Intent[] {
    const out: Intent[] = [];
    for (const intent of this.byId.values()) {
      if (intent.status === "confirmed" && intent.remaining > 0n) {
        this.cancel(intent.intentId, reason);
        out.push(intent);
      }
    }
    return out;
  }

  applyFill(intentId: string, lots: Lots, px: Px): Intent {
    const intent = this.require(intentId);
    if (intent.status !== "confirmed") throw new Error(`fill on ${intent.status} ${intentId}`);
    if (lots > intent.remaining) throw new Error("fill larger than remaining");
    intent.filled += lots;
    intent.remaining -= lots;
    intent.notionalFilled += px * lots;
    if (intent.remaining === 0n) intent.status = "canceled";
    return intent;
  }

  avgPx(intent: Intent): Px | undefined {
    if (intent.filled === 0n) return undefined;
    return intent.notionalFilled / intent.filled;
  }

  durableKey(intent: Intent): string {
    return `${intent.intentId}:${intent.nonce}`;
  }

  private require(intentId: string): Intent {
    const intent = this.byId.get(intentId);
    if (!intent) throw new Error(`unknown intent ${intentId} — query does not create ids`);
    return intent;
  }
}
