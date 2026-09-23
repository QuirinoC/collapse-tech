import type { Book } from "./book.js";
import type { MarketSpec } from "./spec.js";

export type MarketState = "ACTIVE" | "SOFT_PAUSED" | "HARD_PAUSED" | "UNKNOWN";

export type HealthReason = "ok" | "empty_book" | "stale_book" | "SOFT_PAUSED" | "HARD_PAUSED" | "UNKNOWN" | "rpc_error" | "dead_man";

export interface Health {
  ok: boolean;
  reason: HealthReason;
  marketState: MarketState;
  bookBlock?: number;
  chainHead?: number;
  recvMs?: number;
  detail?: string;
}

export interface HealthLimits {
  staleBookMs: number;
  staleBookBlocks: number;
}

export function assessHealth(args: {
  spec: MarketSpec;
  book?: Book | null;
  chainHead?: number;
  nowMs: number;
  marketState: MarketState;
  rpcError?: string;
  limits: HealthLimits;
}): Health {
  if (args.rpcError) {
    return { ok: false, reason: "rpc_error", marketState: args.marketState, detail: args.rpcError };
  }
  if (args.marketState === "SOFT_PAUSED") {
    return { ok: false, reason: "SOFT_PAUSED", marketState: args.marketState };
  }
  if (args.marketState === "HARD_PAUSED") {
    return { ok: false, reason: "HARD_PAUSED", marketState: args.marketState };
  }
  if (args.marketState === "UNKNOWN") {
    return { ok: false, reason: "UNKNOWN", marketState: args.marketState, detail: "market state unread; fail-closed" };
  }
  const book = args.book;
  if (!book || !book.levels.bids.length || !book.levels.asks.length) {
    return { ok: false, reason: "empty_book", marketState: args.marketState, bookBlock: book?.block };
  }
  if (args.nowMs - book.recvMs > args.limits.staleBookMs) {
    return {
      ok: false,
      reason: "stale_book",
      marketState: args.marketState,
      bookBlock: book.block,
      recvMs: book.recvMs,
      detail: `recv age ${args.nowMs - book.recvMs}ms`,
    };
  }
  if (args.chainHead !== undefined && args.chainHead - book.block > args.limits.staleBookBlocks) {
    return {
      ok: false,
      reason: "stale_book",
      marketState: args.marketState,
      bookBlock: book.block,
      chainHead: args.chainHead,
      detail: `book ${book.block} vs head ${args.chainHead}`,
    };
  }
  return { ok: true, reason: "ok", marketState: args.marketState, bookBlock: book.block, chainHead: args.chainHead, recvMs: book.recvMs };
}

const STATE_TOPIC = "MarketStateUpdated(uint8,uint8)";

/**
 * Kuru JS OrderBook ABI (0.0.95) has `toggleMarkets(bool)` and `MarketStateError`.
 * There is no `marketState` / pause view. Do not assume ACTIVE.
 */
export function liveAbiMarketState(): MarketState {
  return "UNKNOWN";
}

/** Docs: ACTIVE / SOFT_PAUSED / HARD_PAUSED. Unknown integers stay UNKNOWN. */
export function decodeMarketState(n: number): MarketState {
  if (n === 0) return "ACTIVE";
  if (n === 1) return "SOFT_PAUSED";
  if (n === 2) return "HARD_PAUSED";
  return "UNKNOWN";
}

export function marketStateFromLogs(
  logs: { topics: string[]; data: string }[],
  topicHash: string,
): MarketState | undefined {
  let last: MarketState | undefined;
  for (const log of logs) {
    if ((log.topics[0] ?? "").toLowerCase() !== topicHash.toLowerCase()) continue;
    const hex = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    if (hex.length < 128) continue;
    const next = Number(BigInt("0x" + hex.slice(64, 128)));
    last = decodeMarketState(next);
  }
  return last;
}

export { STATE_TOPIC };
