import { config } from "./config.js";
import type { Book } from "./book.js";
import { displayLotsMon, displayPx, type MarketSpec } from "./spec.js";
import type { TapeStats } from "./tape.js";

export type Pressure = "bid-heavy" | "balanced" | "ask-heavy";
export type SpreadWord = "tight" | "normal" | "wide";
export type DepthWord = "thin" | "ok" | "thick";
export type InventorySide = "flat" | "long" | "short";
export type SizeWord = "flat" | "small" | "medium" | "large";

export interface SemanticState {
  book_shape: {
    pressure: Pressure;
    spread: SpreadWord;
    bid_within_10bps: DepthWord;
    ask_within_10bps: DepthWord;
    thin_ask_within_10bps: string;
    thin_bid_within_10bps: string;
  };
  tape_summary: {
    flow: TapeStats["flow"];
    last_side: TapeStats["lastSide"];
    cvd_agrees_with_last_move: string;
    activity: string;
  };
  inventory: {
    side: InventorySide;
    size: SizeWord;
  };
  clock: {
    horizon: string;
  };
  headline?: string;
  naive: {
    mid: number;
    spreadBps: number;
    bookImbalance: number;
    returnsBps: { last1: number; last5: number; last20: number; last100: number };
    recentMids: string;
    horizonBlocks: number;
  };
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
  "twenty-three",
  "twenty-four",
  "twenty-five",
  "twenty-six",
  "twenty-seven",
  "twenty-eight",
  "twenty-nine",
  "thirty",
];

export function secondsPhrase(seconds: number): string {
  const n = Math.max(1, Math.round(seconds));
  if (n < ONES.length) return `about ${ONES[n]} seconds`;
  if (n < 60) return `about ${n} seconds`;
  const min = Math.round(n / 60);
  return min <= 1 ? "about one minute" : `about ${min} minutes`;
}

export function pressureWord(imbalance: number): Pressure {
  if (imbalance > 0.25) return "bid-heavy";
  if (imbalance < -0.25) return "ask-heavy";
  return "balanced";
}

export function spreadWord(spreadBps: number): SpreadWord {
  if (spreadBps < 5) return "tight";
  if (spreadBps < 20) return "normal";
  return "wide";
}

export function depthWord(size: number): DepthWord {
  if (size < 200) return "thin";
  if (size < 2000) return "ok";
  return "thick";
}

export function inventoryWords(inventoryMon: number): { side: InventorySide; size: SizeWord } {
  const max = Math.max(1, config.maxPositionMon);
  const ratio = inventoryMon / max;
  const side: InventorySide = Math.abs(ratio) < 0.05 ? "flat" : ratio > 0 ? "long" : "short";
  const mag = Math.abs(ratio);
  const size: SizeWord = side === "flat" ? "flat" : mag < 0.33 ? "small" : mag < 0.66 ? "medium" : "large";
  return { side, size };
}

export function buildState(
  book: Book,
  spec: MarketSpec,
  mids: number[],
  tape: TapeStats,
  inventoryMon: number,
  headline?: string,
): SemanticState {
  const n = mids.length;
  const ret = (k: number) => (n > k ? ((mids[n - 1]! - mids[n - 1 - k]!) / mids[n - 1 - k]!) * 10_000 : 0);
  const H = config.horizonBlocks;
  const sampled = mids.slice(-H).filter((_, i, a) => (a.length - 1 - i) % 5 === 0);
  const bid10 = displayLotsMon(book.depthBps["10"]?.bid ?? 0n, spec);
  const ask10 = displayLotsMon(book.depthBps["10"]?.ask ?? 0n, spec);
  const bidD = depthWord(bid10);
  const askD = depthWord(ask10);
  const inv = inventoryWords(inventoryMon);
  const horizonSec = (config.horizonBlocks * config.blockMs) / 1000;
  const mid = displayPx(book.mid, spec);
  const state: SemanticState = {
    book_shape: {
      pressure: pressureWord(Number(book.imbalancePpm) / 1e6),
      spread: spreadWord(Number(book.spreadBps)),
      bid_within_10bps: bidD,
      ask_within_10bps: askD,
      thin_ask_within_10bps:
        askD === "thin" ? "yes, the ask is thin within ten basis points" : "no, the ask is not thin within ten basis points",
      thin_bid_within_10bps:
        bidD === "thin" ? "yes, the bid is thin within ten basis points" : "no, the bid is not thin within ten basis points",
    },
    tape_summary: {
      flow: tape.flow,
      last_side: tape.lastSide,
      cvd_agrees_with_last_move: tape.cvdAgreesWithLastMove
        ? "yes, cumulative volume agrees with the last mid move"
        : "no, cumulative volume does not agree with the last mid move",
      activity: tape.activity,
    },
    inventory: inv,
    clock: { horizon: secondsPhrase(horizonSec) },
    naive: {
      mid,
      spreadBps: Number(book.spreadBps),
      bookImbalance: round(Number(book.imbalancePpm) / 1e6, 3),
      returnsBps: {
        last1: round(ret(1), 2),
        last5: round(ret(5), 2),
        last20: round(ret(20), 2),
        last100: round(ret(100), 2),
      },
      recentMids: sampled.map((x) => x.toFixed(6)).join(" "),
      horizonBlocks: H,
    },
  };
  if (headline) state.headline = headline;
  return state;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
