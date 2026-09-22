import { config } from "./config.js";
import type { Judgments, LeanLevel } from "./model.js";

export type SkipReason =
  | "regime_low_conf"
  | "quote_ok"
  | "toxic"
  | "late"
  | "headline"
  | "dead";

export interface QuoteIntent {
  quote: boolean;
  bidInsideTicks: number;
  askInsideTicks: number;
  bidSizeMon: number;
  askSizeMon: number;
  skipReason?: SkipReason;
  leanApplied: boolean;
  leanLevel?: LeanLevel;
}

/** Code-owned tick table. Never `score * k`. */
export const LEAN_TICKS: Record<LeanLevel, { bid: number; ask: number }> = {
  0: { bid: 2, ask: -1 },
  1: { bid: 1, ask: 0 },
  2: { bid: 0, ask: 0 },
  3: { bid: 0, ask: 1 },
  4: { bid: -1, ask: 2 },
};

export function noulUncertain(p: number, band = config.gates.quoteOkUncertainBand): boolean {
  return Math.abs(p - 0.5) < band;
}

export function inventorySkewTicks(inventoryMon: number): { bid: number; ask: number } {
  const max = Math.max(1, config.maxPositionMon);
  const ratio = Math.max(-1, Math.min(1, inventoryMon / max));
  const ticks = Math.round(ratio * config.inventorySkewTicks);
  return { bid: -ticks, ask: ticks };
}

/** Whole MON only. Floor is venue clip (200), never 0.25 * base. */
export function inventorySizes(inventoryMon: number): { bid: number; ask: number } {
  const max = Math.max(1, config.maxPositionMon);
  const ratio = Math.max(-1, Math.min(1, inventoryMon / max));
  const base = Math.max(200, config.tradeSizeMon);
  return {
    bid: Math.max(base, Math.round(base * (1 - 0.5 * ratio))),
    ask: Math.max(base, Math.round(base * (1 + 0.5 * ratio))),
  };
}

function clampTicks(n: number): number {
  return Math.max(0, n);
}

export function gridQuote(): QuoteIntent {
  const t = config.quoteInsideTicks;
  const s = config.tradeSizeMon;
  return { quote: true, bidInsideTicks: t, askInsideTicks: t, bidSizeMon: s, askSizeMon: s, leanApplied: false };
}

export function inventoryQuote(inventoryMon: number): QuoteIntent {
  const base = config.quoteInsideTicks;
  const skew = inventorySkewTicks(inventoryMon);
  const size = inventorySizes(inventoryMon);
  return {
    quote: true,
    bidInsideTicks: clampTicks(base + skew.bid),
    askInsideTicks: clampTicks(base + skew.ask),
    bidSizeMon: size.bid,
    askSizeMon: size.ask,
    leanApplied: false,
  };
}

export function naiveQuote(j: Judgments, late: boolean): QuoteIntent {
  const t = config.quoteInsideTicks;
  const s = config.tradeSizeMon;
  if (late) {
    return { quote: false, bidInsideTicks: 0, askInsideTicks: 0, bidSizeMon: 0, askSizeMon: 0, skipReason: "late", leanApplied: false };
  }
  if (j.naive.action === "buy") {
    return { quote: true, bidInsideTicks: t, askInsideTicks: -1, bidSizeMon: s, askSizeMon: 0, leanApplied: false };
  }
  return { quote: true, bidInsideTicks: -1, askInsideTicks: t, bidSizeMon: 0, askSizeMon: s, leanApplied: false };
}

/**
 * Compose Jev answers into a quote. Confidence is a gate, not a log field.
 * Pulling is cheap (moderate toxic / regime floor). Leaning is expensive (higher lean floor).
 */
export function composeQuotes(j: Judgments, inventoryMon: number, late: boolean): QuoteIntent {
  const pull = (reason: SkipReason): QuoteIntent => ({
    quote: false,
    bidInsideTicks: 0,
    askInsideTicks: 0,
    bidSizeMon: 0,
    askSizeMon: 0,
    skipReason: reason,
    leanApplied: false,
  });

  if (late) return pull("late");
  if (j.regime.confidence < config.gates.regimeMinConfidence) return pull("regime_low_conf");
  if (noulUncertain(j.quoteOk) || j.quoteOk < config.gates.quoteOkMin) return pull("quote_ok");
  if (j.toxic >= config.gates.toxicPull) return pull("toxic");
  if (j.materialHeadline >= config.gates.headlinePull) return pull("headline");
  if (j.regime.choice === "dead" && j.regime.confidence >= config.gates.regimeMinConfidence) return pull("dead");

  const base = config.quoteInsideTicks;
  const inv = inventorySkewTicks(inventoryMon);
  const size = inventorySizes(inventoryMon);
  const applyLean = j.lean.confidence >= config.gates.leanMinConfidence;
  const lean = applyLean ? LEAN_TICKS[j.lean.level] : { bid: 0, ask: 0 };

  return {
    quote: true,
    bidInsideTicks: clampTicks(base + inv.bid + lean.bid),
    askInsideTicks: clampTicks(base + inv.ask + lean.ask),
    bidSizeMon: size.bid,
    askSizeMon: size.ask,
    leanApplied: applyLean,
    leanLevel: applyLean ? j.lean.level : undefined,
  };
}
