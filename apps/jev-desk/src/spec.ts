import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { displayNumber, formatUnits, parseDecimal, type Cash, type Lots, type Px, type Usd, USD_MICROS } from "./money.js";

/** Full Kuru getMarketParams. Persist this; do not cast down to tick-only. */
export interface MarketSpec {
  market: string;
  chainId: number;
  baseSymbol: string;
  quoteSymbol: string;
  pricePrecision: bigint;
  sizePrecision: bigint;
  tickSize: bigint;
  minSize: bigint;
  maxSize: bigint;
  makerFeeBps: bigint;
  takerFeeBps: bigint;
  baseAssetAddress: string;
  quoteAssetAddress: string;
  baseAssetDecimals: number;
  quoteAssetDecimals: number;
  priceDecimals: number;
  sizeDecimals: number;
}

export interface SerializedSpec {
  market: string;
  chainId: number;
  baseSymbol: string;
  quoteSymbol: string;
  pricePrecision: string;
  sizePrecision: string;
  tickSize: string;
  minSize: string;
  maxSize: string;
  makerFeeBps: string;
  takerFeeBps: string;
  baseAssetAddress: string;
  quoteAssetAddress: string;
  baseAssetDecimals: number;
  quoteAssetDecimals: number;
  priceDecimals: number;
  sizeDecimals: number;
}

export type KuruParamsLike = {
  pricePrecision: { toString(): string };
  sizePrecision: { toString(): string };
  tickSize: { toString(): string };
  minSize?: { toString(): string };
  maxSize?: { toString(): string };
  makerFeeBps?: { toString(): string };
  takerFeeBps?: { toString(): string };
  baseAssetAddress?: string;
  quoteAssetAddress?: string;
  baseAssetDecimals?: { toString(): string } | number;
  quoteAssetDecimals?: { toString(): string } | number;
};

const log10Int = (x: bigint): number => x.toString().length - 1;

export const MON_USDC_MARKET = "0x065C9d28E428A0db40191a54d33d5b7c71a9C394";

/**
 * Observed 2026-09-17 via ParamFetcher.getMarketParams on Monad (chain 143).
 * Fees are 0/0 on this book — do not use the 30/10 deploy examples.
 */
export const VENUE_MON_USDC: MarketSpec = {
  market: MON_USDC_MARKET,
  chainId: 143,
  baseSymbol: "MON",
  quoteSymbol: "USDC",
  pricePrecision: 100_000_000n,
  sizePrecision: 10_000_000_000n,
  tickSize: 100n,
  minSize: 2_000_000_000_000n,
  maxSize: 2_000_000_000_000_000_000n,
  makerFeeBps: 0n,
  takerFeeBps: 0n,
  baseAssetAddress: "0x0000000000000000000000000000000000000000",
  quoteAssetAddress: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  baseAssetDecimals: 18,
  quoteAssetDecimals: 6,
  priceDecimals: 8,
  sizeDecimals: 10,
};

/** Mock tape uses the same instrument as the live book. */
export const MOCK_SPEC: MarketSpec = { ...VENUE_MON_USDC };

export function specFromKuru(params: KuruParamsLike, market: string, chainId: number): MarketSpec {
  const pricePrecision = BigInt(params.pricePrecision.toString());
  const sizePrecision = BigInt(params.sizePrecision.toString());
  const tickSize = BigInt(params.tickSize.toString());
  const minSize = BigInt((params.minSize ?? { toString: () => "0" }).toString());
  const maxSize = BigInt((params.maxSize ?? { toString: () => "0" }).toString());
  const makerFeeBps = BigInt((params.makerFeeBps ?? { toString: () => "0" }).toString());
  const takerFeeBps = BigInt((params.takerFeeBps ?? { toString: () => "0" }).toString());
  const baseDec = params.baseAssetDecimals;
  const quoteDec = params.quoteAssetDecimals;
  return {
    market,
    chainId,
    baseSymbol: "MON",
    quoteSymbol: "USDC",
    pricePrecision,
    sizePrecision,
    tickSize,
    minSize,
    maxSize,
    makerFeeBps,
    takerFeeBps,
    baseAssetAddress: params.baseAssetAddress ?? "0x0000000000000000000000000000000000000000",
    quoteAssetAddress: params.quoteAssetAddress ?? "",
    baseAssetDecimals: typeof baseDec === "number" ? baseDec : Number((baseDec ?? { toString: () => "18" }).toString()),
    quoteAssetDecimals: typeof quoteDec === "number" ? quoteDec : Number((quoteDec ?? { toString: () => "6" }).toString()),
    priceDecimals: log10Int(pricePrecision),
    sizeDecimals: log10Int(sizePrecision),
  };
}

export function serializeSpec(spec: MarketSpec): SerializedSpec {
  return {
    market: spec.market,
    chainId: spec.chainId,
    baseSymbol: spec.baseSymbol,
    quoteSymbol: spec.quoteSymbol,
    pricePrecision: spec.pricePrecision.toString(),
    sizePrecision: spec.sizePrecision.toString(),
    tickSize: spec.tickSize.toString(),
    minSize: spec.minSize.toString(),
    maxSize: spec.maxSize.toString(),
    makerFeeBps: spec.makerFeeBps.toString(),
    takerFeeBps: spec.takerFeeBps.toString(),
    baseAssetAddress: spec.baseAssetAddress,
    quoteAssetAddress: spec.quoteAssetAddress,
    baseAssetDecimals: spec.baseAssetDecimals,
    quoteAssetDecimals: spec.quoteAssetDecimals,
    priceDecimals: spec.priceDecimals,
    sizeDecimals: spec.sizeDecimals,
  };
}

export function deserializeSpec(row: SerializedSpec): MarketSpec {
  return {
    ...row,
    pricePrecision: BigInt(row.pricePrecision),
    sizePrecision: BigInt(row.sizePrecision),
    tickSize: BigInt(row.tickSize),
    minSize: BigInt(row.minSize),
    maxSize: BigInt(row.maxSize),
    makerFeeBps: BigInt(row.makerFeeBps),
    takerFeeBps: BigInt(row.takerFeeBps),
  };
}

export function persistSpec(spec: MarketSpec, dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data")): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "market-spec.json");
  writeFileSync(path, `${JSON.stringify(serializeSpec(spec), null, 2)}\n`);
  return path;
}

export function monToLots(mon: bigint, spec: MarketSpec): Lots {
  return mon * spec.sizePrecision;
}

export function lotsToMon(lots: Lots, spec: MarketSpec): bigint {
  return lots / spec.sizePrecision;
}

export function pxToTicks(px: Px, spec: MarketSpec): bigint {
  return px / spec.tickSize;
}

export function ticksToPx(ticks: bigint, spec: MarketSpec): Px {
  return ticks * spec.tickSize;
}

export function alignTick(px: Px, spec: MarketSpec, dir: "floor" | "ceil"): Px {
  const t = spec.tickSize;
  if (t === 0n) throw new Error("tickSize is 0");
  if (dir === "floor") return (px / t) * t;
  const r = px % t;
  return r === 0n ? px : px + (t - r);
}

export function notional(px: Px, lots: Lots, spec: MarketSpec): Cash {
  return (px * lots) / spec.sizePrecision;
}

export function feeOn(cash: Cash, bps: bigint): Cash {
  return (cash * bps) / 10_000n;
}

export function tickNotional(lots: Lots, spec: MarketSpec): Cash {
  return notional(spec.tickSize, lots, spec);
}

export function cashToUsdMicros(cash: Cash, spec: MarketSpec): Usd {
  return (cash * USD_MICROS) / spec.pricePrecision;
}

export function usdToCash(usd: Usd, spec: MarketSpec): Cash {
  return (usd * spec.pricePrecision) / USD_MICROS;
}

export function monUsdMicros(mid: Px, spec: MarketSpec): Usd {
  return (mid * USD_MICROS) / spec.pricePrecision;
}

export function formatPx(px: Px, spec: MarketSpec): string {
  return formatUnits(px, spec.priceDecimals);
}

export function formatLots(lots: Lots, spec: MarketSpec): string {
  return formatUnits(lots, spec.sizeDecimals);
}

export function formatCash(cash: Cash, spec: MarketSpec): string {
  return formatUnits(cash, spec.priceDecimals);
}

export function displayPx(px: Px, spec: MarketSpec): number {
  return displayNumber(px, spec.priceDecimals);
}

export function displayLotsMon(lots: Lots, spec: MarketSpec): number {
  return displayNumber(lots, spec.sizeDecimals);
}

export function parseMon(s: string, spec: MarketSpec): Lots {
  return parseDecimal(s, spec.sizeDecimals);
}

export function parsePx(s: string, spec: MarketSpec): Px {
  return parseDecimal(s, spec.priceDecimals);
}

export function minQuoteLots(spec: MarketSpec, clipLots: Lots): Lots {
  return spec.minSize > clipLots ? spec.minSize : clipLots;
}

export function wouldCross(side: "bid" | "ask", price: Px, bookBid: Px, bookAsk: Px): boolean {
  return side === "bid" ? price >= bookAsk : price <= bookBid;
}

export function venueNotes(spec: MarketSpec): string[] {
  return [
    `${spec.baseSymbol}-${spec.quoteSymbol} ${spec.market} chain ${spec.chainId}`,
    `tick ${formatPx(spec.tickSize, spec)} ${spec.quoteSymbol} / ${spec.baseSymbol}`,
    `minSize ${formatLots(spec.minSize, spec)} ${spec.baseSymbol} maxSize ${formatLots(spec.maxSize, spec)} ${spec.baseSymbol}`,
    `makerFeeBps ${spec.makerFeeBps} takerFeeBps ${spec.takerFeeBps}`,
    "backup: go flat and stop",
  ];
}
