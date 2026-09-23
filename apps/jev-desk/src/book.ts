/** Integer L2 reader. One eth_call to getL2Book (0x46fdfbb1). Prices/sizes stay bigint. */

import { abs } from "./money.js";
import { alignTick, type MarketSpec } from "./spec.js";
import type { Lots, Px } from "./money.js";

export type Level = [price: Px, size: Lots];

export interface Book {
  block: number;
  recvMs: number;
  bid: Px;
  ask: Px;
  mid: Px;
  spreadTicks: bigint;
  spreadBps: bigint;
  imbalancePpm: bigint;
  levels: { bids: Level[]; asks: Level[] };
  depthBps: { [band: string]: { bid: Lots; ask: Lots } };
}

const SEL_GET_L2_BOOK = "0x46fdfbb1";

function abiBytesPayload(abiHex: string): string {
  const hex = abiHex.startsWith("0x") ? abiHex.slice(2) : abiHex;
  const offset = Number(BigInt(`0x${hex.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${hex.slice(offset, offset + 64)}`)) * 2;
  return `0x${hex.slice(offset + 64, offset + 64 + length)}`;
}

function decodeL2Book(abiHex: string): { block: number; bids: Level[]; asks: Level[] } {
  const data = abiBytesPayload(abiHex);
  const block = Number(BigInt(`0x${data.slice(2, 66)}`));
  let offset = 66;
  const readSide = (): Level[] => {
    const out: Level[] = [];
    while (offset < data.length) {
      const price = BigInt(`0x${data.slice(offset, offset + 64)}`);
      offset += 64;
      if (price === 0n) break;
      const size = BigInt(`0x${data.slice(offset, offset + 64)}`);
      offset += 64;
      out.push([price, size]);
    }
    return out;
  };
  return { block, bids: readSide(), asks: readSide() };
}

function group(levels: Level[], key: (p: Px) => Px = (p) => p): Level[] {
  const m = new Map<string, Lots>();
  const order: Px[] = [];
  for (const [p, s] of levels) {
    const k = key(p);
    const id = k.toString();
    if (!m.has(id)) order.push(k);
    m.set(id, (m.get(id) ?? 0n) + s);
  }
  return order.map((p) => [p, m.get(p.toString())!] as Level);
}

function formatLevels(l2: { bids: Level[]; asks: Level[] }, spec: MarketSpec) {
  const desc = (a: Level, b: Level) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0);
  const bids = group(l2.bids).sort(desc);
  const asks = group(l2.asks).sort(desc);
  return {
    bids: group(bids, (p) => alignTick(p, spec, "floor")).sort(desc),
    asks: group(asks, (p) => alignTick(p, spec, "ceil")).sort(desc),
  };
}

export async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as T;
}

export async function readBook(url: string, market: string, spec: MarketSpec, recvMs = Date.now()): Promise<Book> {
  const hex = await rpc<string>(url, "eth_call", [{ to: market, data: SEL_GET_L2_BOOK }, "latest"]);
  return bookFromL2(hex, spec, recvMs);
}

export function emptyBook(block: number, recvMs = Date.now()): Book {
  return {
    block,
    recvMs,
    bid: 0n,
    ask: 0n,
    mid: 0n,
    spreadTicks: 0n,
    spreadBps: 0n,
    imbalancePpm: 0n,
    levels: { bids: [], asks: [] },
    depthBps: {},
  };
}

export function bookFromL2(hex: string, spec: MarketSpec, recvMs = Date.now()): Book {
  const l2 = decodeL2Book(hex);
  const { bids, asks } = formatLevels(l2, spec);
  if (!bids.length || !asks.length) {
    return emptyBook(l2.block, recvMs);
  }
  const bid = bids[0]![0];
  const ask = asks[asks.length - 1]![0];
  return assembleBook(l2.block, bid, ask, bids, asks, spec, recvMs);
}

export function assembleBook(
  block: number,
  bid: Px,
  ask: Px,
  bids: Level[],
  asks: Level[],
  spec: MarketSpec,
  recvMs = Date.now(),
): Book {
  if (ask <= bid) throw new Error(`crossed or locked book bid=${bid} ask=${ask}`);
  const mid = (bid + ask) / 2n;
  const near = (levels: Level[]) =>
    levels.filter((l) => mid === 0n || (abs(l[0] - mid) * 100n) / mid < 1n).reduce((s, l) => s + l[1], 0n);
  const within = (levels: Level[], bps: bigint) =>
    levels.filter((l) => mid === 0n || abs(l[0] - mid) * 10_000n <= bps * mid).reduce((s, l) => s + l[1], 0n);
  const bidDepth = near(bids);
  const askDepth = near(asks);
  const depthBps: Book["depthBps"] = {};
  for (const b of [10n, 25n, 50n]) {
    depthBps[String(b)] = { bid: within(bids, b), ask: within(asks, b) };
  }
  const tot = bidDepth + askDepth;
  return {
    block,
    recvMs,
    bid,
    ask,
    mid,
    spreadTicks: (ask - bid) / spec.tickSize,
    spreadBps: mid === 0n ? 0n : ((ask - bid) * 10_000n) / mid,
    imbalancePpm: tot === 0n ? 0n : ((bidDepth - askDepth) * 1_000_000n) / tot,
    levels: { bids: bids.slice(0, 5), asks: asks.slice(-5).reverse() },
    depthBps,
  };
}

/**
 * Intended post-only price. Does not snap to touch.
 * Crossing is a revert at the order machine, not a rewrite here.
 */
export function quotePrice(side: "buy" | "sell", book: Book, spec: MarketSpec, insideTicks: number): Px {
  const step = BigInt(insideTicks) * spec.tickSize;
  return side === "buy" ? book.bid + step : book.ask - step;
}
