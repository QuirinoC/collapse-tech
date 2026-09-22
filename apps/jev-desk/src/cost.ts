import { cashToUsdMicros, notional, tickNotional, type MarketSpec } from "./spec.js";
import { USD_MICROS, type Cash, type Lots, type Px, type Usd } from "./money.js";
import type { Ledger } from "./ledger.js";

export type GasSource = "rpc-measured" | "assumed-unknown-high";

export interface CostConfig {
  adverseTicks: bigint;
  gasUsdPerReplace: Usd;
  gasSource: GasSource;
  /** Kuru py-sdk local heuristic: 210_000 + 150_000 * n. Assumed units, not our receipt. */
  gasUnitsPerReplace: bigint;
}

export interface CostBreakdown {
  spreadUsd: Usd;
  feeUsd: Usd;
  gasUsd: Usd;
  jevUsd: Usd;
  adverseTicksUsd: Usd;
  markoutUsd: Usd;
  costUsd: Usd;
  net1x: Usd;
  net2x: Usd;
  net3x: Usd;
  gasSource: GasSource;
}

export function markLong(lots: Lots, bid: Px, spec: MarketSpec): Cash {
  return lots <= 0n ? 0n : notional(bid, lots, spec);
}

export function markShort(lots: Lots, ask: Px, spec: MarketSpec): Cash {
  return lots >= 0n ? 0n : notional(ask, -lots, spec);
}

/** Bid inventory marked to bid (exit sell). Short marked to ask (exit buy). Not mid. */
export function markInventory(inventory: Lots, bid: Px, ask: Px, spec: MarketSpec): Cash {
  if (inventory > 0n) return markLong(inventory, bid, spec);
  if (inventory < 0n) return -markShort(inventory, ask, spec);
  return 0n;
}

/** Adverse markout vs executable side: buy fill vs later bid, sell fill vs later ask. */
export function adverseMarkout(side: "bid" | "ask", fillPx: Px, size: Lots, laterBid: Px, laterAsk: Px, spec: MarketSpec): Cash {
  if (side === "bid") return notional(fillPx, size, spec) - notional(laterBid, size, spec);
  return notional(laterAsk, size, spec) - notional(fillPx, size, spec);
}

export function adverseTickBuffer(size: Lots, spec: MarketSpec, ticks: bigint): Cash {
  return tickNotional(size, spec) * ticks;
}

export function deskCost(args: {
  spec: MarketSpec;
  ledger: Ledger;
  spreadCash: Cash;
  markoutCash: Cash;
  fillLots: Lots;
  cfg: CostConfig;
}): CostBreakdown {
  const feeUsd = cashToUsdMicros(args.ledger.fees, args.spec);
  const gasUsd = args.ledger.gas;
  const jevUsd = args.ledger.jev;
  const spreadUsd = cashToUsdMicros(args.spreadCash, args.spec);
  const markoutUsd = cashToUsdMicros(args.markoutCash, args.spec);
  const adverseTicksUsd = cashToUsdMicros(adverseTickBuffer(args.fillLots, args.spec, args.cfg.adverseTicks), args.spec);
  const costUsd = feeUsd + gasUsd + jevUsd + adverseTicksUsd + markoutUsd;
  return {
    spreadUsd,
    feeUsd,
    gasUsd,
    jevUsd,
    adverseTicksUsd,
    markoutUsd,
    costUsd,
    net1x: spreadUsd - costUsd,
    net2x: spreadUsd - costUsd * 2n,
    net3x: spreadUsd - costUsd * 3n,
    gasSource: args.cfg.gasSource,
  };
}

/**
 * Gas USD from RPC gasPrice × Kuru local heuristic × this book's MON mid.
 * Heuristic units are assumed (docs), not a measured receipt. Priority-fee spikes are why we stress ×2/×3.
 */
export function measureReplaceGasUsd(args: {
  gasPriceWei: bigint;
  gasUnits: bigint;
  monUsdMicros: Usd;
}): { usd: Usd; source: GasSource } | undefined {
  if (args.gasPriceWei <= 0n || args.gasUnits <= 0n || args.monUsdMicros <= 0n) return undefined;
  const usd = (args.gasUnits * args.gasPriceWei * args.monUsdMicros) / 10n ** 18n;
  if (usd <= 0n) return undefined;
  return { usd, source: "rpc-measured" };
}

export function jevUsdMicros(inputTokens: number, usdPerMTok: number): Usd {
  const per = BigInt(Math.round(usdPerMTok * Number(USD_MICROS)));
  return (BigInt(Math.max(0, Math.round(inputTokens))) * per) / 1_000_000n;
}

export function formatUsd(u: Usd): string {
  const neg = u < 0n;
  const n = neg ? -u : u;
  const whole = n / USD_MICROS;
  const frac = (n % USD_MICROS).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
