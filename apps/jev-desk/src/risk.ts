import type { Health } from "./health.js";
import type { Lots, Usd } from "./money.js";
import type { MarketSpec } from "./spec.js";

export type RiskReject = "killed" | "writer_busy" | "min_size" | "max_size" | "position_cap" | "unhealthy" | "zero_size";

export interface RiskDecision {
  ok: boolean;
  reject?: RiskReject;
  bidLots: Lots;
  askLots: Lots;
}

export class KillSwitch {
  killed = false;
  reason?: string;

  kill(reason: string) {
    this.killed = true;
    this.reason = reason;
  }

  assertLive(): RiskReject | undefined {
    return this.killed ? "killed" : undefined;
  }
}

/** One writer in front of strategy. Overlapping apply is a reject, not a second send. */
export class SingleWriter {
  private busy = false;

  run<T>(fn: () => T): T {
    if (this.busy) throw new Error("single-writer: rejected");
    this.busy = true;
    try {
      return fn();
    } finally {
      this.busy = false;
    }
  }

  get locked(): boolean {
    return this.busy;
  }
}

export function preTrade(args: {
  spec: MarketSpec;
  health: Health;
  kill: KillSwitch;
  inventory: Lots;
  maxPosition: Lots;
  bidLots: Lots;
  askLots: Lots;
}): RiskDecision {
  if (args.kill.killed) return { ok: false, reject: "killed", bidLots: 0n, askLots: 0n };
  if (!args.health.ok) return { ok: false, reject: "unhealthy", bidLots: 0n, askLots: 0n };

  let bid = args.bidLots;
  let ask = args.askLots;
  if (bid < 0n || ask < 0n) return { ok: false, reject: "zero_size", bidLots: 0n, askLots: 0n };

  const checkSize = (lots: Lots): RiskReject | undefined => {
    if (lots === 0n) return undefined;
    if (lots < args.spec.minSize) return "min_size";
    if (lots > args.spec.maxSize) return "max_size";
    return undefined;
  };
  const bidBad = checkSize(bid);
  if (bidBad) return { ok: false, reject: bidBad, bidLots: 0n, askLots: 0n };
  const askBad = checkSize(ask);
  if (askBad) return { ok: false, reject: askBad, bidLots: 0n, askLots: 0n };

  if (bid > 0n && args.inventory + bid > args.maxPosition) bid = 0n;
  if (ask > 0n && args.inventory - ask < -args.maxPosition) ask = 0n;
  if (bid === 0n && ask === 0n) {
    const anyRequested = args.bidLots > 0n || args.askLots > 0n;
    return { ok: false, reject: anyRequested ? "position_cap" : "zero_size", bidLots: 0n, askLots: 0n };
  }
  return { ok: true, bidLots: bid, askLots: ask };
}

export function paperKill(kill: KillSwitch, reason: string): string {
  kill.kill(reason);
  return reason;
}

/** Paper session loss vs mark-to-market PnL. limitUsd <= 0 disables. */
export function dailyLossBreached(pnlUsd: Usd, limitUsd: Usd): boolean {
  if (limitUsd <= 0n) return false;
  return pnlUsd <= -limitUsd;
}

/** Kill if no successful beat within timeout. Armed at construction. */
export class DeadMan {
  lastBeatMs: number;

  constructor(
    readonly timeoutMs: number,
    nowMs = Date.now(),
  ) {
    this.lastBeatMs = nowMs;
  }

  beat(nowMs: number) {
    this.lastBeatMs = nowMs;
  }

  expired(nowMs: number): boolean {
    return nowMs - this.lastBeatMs > this.timeoutMs;
  }
}
