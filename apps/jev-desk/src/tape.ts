import { ethers } from "ethers";
import { rpc } from "./book.js";
import type { MarketSpec } from "./spec.js";
import type { Lots, Px } from "./money.js";

/** On-chain Trade print. Logs/RPC are truth. inferPrints is gone. */
export interface Print {
  block: number;
  price: Px;
  size: Lots;
  /** True when the taker lifted the ask. */
  takerBuy: boolean;
  txhash: string;
  logIndex: number;
  orderId: string;
}

export type TapeFlow = "one-way selling" | "one-way buying" | "mixed" | "dead";
export type LastSide = "buy" | "sell" | "none";

export interface TapeStats {
  flow: TapeFlow;
  lastSide: LastSide;
  cvdAgreesWithLastMove: boolean;
  activity: string;
}

export function fillKey(p: Print): string {
  return `${p.txhash}:${p.logIndex}:${p.orderId}`;
}

/** Live MON-USDC emits uint256 price (1e18). Docs still show uint32; that topic is empty on this book. */
export const TRADE_TOPIC = ethers.utils.id("Trade(uint40,address,bool,uint256,uint96,address,address,uint96)");
const GETLOGS_MAX_BLOCKS = 100;
const PRICE_1E18_TO_1E8 = 10_000_000_000n;

const WINDOW = 80;

export class Tape {
  private recent: Print[] = [];
  private cvd = 0n;
  private lastMoveUp = false;
  private lastSide: LastSide = "none";

  ingest(prints: Print[], prevMid: Px, nextMid: Px) {
    if (nextMid !== prevMid) this.lastMoveUp = nextMid > prevMid;
    for (const p of prints) {
      if (p.size <= 0n) continue;
      this.recent.push(p);
      this.cvd += p.takerBuy ? p.size : -p.size;
      this.lastSide = p.takerBuy ? "buy" : "sell";
    }
    if (this.recent.length > WINDOW) this.recent.splice(0, this.recent.length - WINDOW);
  }

  stats(): TapeStats {
    const buys = this.recent.filter((p) => p.takerBuy).reduce((s, p) => s + p.size, 0n);
    const sells = this.recent.filter((p) => !p.takerBuy).reduce((s, p) => s + p.size, 0n);
    const n = this.recent.length;
    const tot = buys + sells;
    let flow: TapeFlow = "dead";
    if (n === 0 || tot === 0n) flow = "dead";
    else if (buys * 10n >= tot * 7n) flow = "one-way buying";
    else if (sells * 10n >= tot * 7n) flow = "one-way selling";
    else flow = "mixed";

    const cvdSign = this.cvd === 0n ? 0 : this.cvd > 0n ? 1 : -1;
    const moveSign = this.lastMoveUp ? 1 : -1;
    const cvdAgreesWithLastMove = n > 0 && cvdSign !== 0 && cvdSign === moveSign;
    const activity = n === 0 ? "no recent prints" : n < 4 ? "sparse prints" : "active prints";
    return { flow, lastSide: this.lastSide, cvdAgreesWithLastMove, activity };
  }
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash?: string;
  logIndex?: string;
}

export type ReadPrintsResult = { ok: true; prints: Print[] } | { ok: false; error: string };

export async function readPrints(
  url: string,
  market: string,
  fromBlock: number,
  toBlock: number,
  _spec: MarketSpec,
): Promise<ReadPrintsResult> {
  if (fromBlock > toBlock || fromBlock < 0) return { ok: true, prints: [] };
  try {
    const out: Print[] = [];
    for (let start = fromBlock; start <= toBlock; start += GETLOGS_MAX_BLOCKS) {
      const end = Math.min(toBlock, start + GETLOGS_MAX_BLOCKS - 1);
      const logs = await rpc<RpcLog[]>(url, "eth_getLogs", [
        {
          address: market,
          fromBlock: "0x" + start.toString(16),
          toBlock: "0x" + end.toString(16),
          topics: [TRADE_TOPIC],
        },
      ]);
      for (const log of logs ?? []) {
        const decoded = decodeTradeData(log.data);
        if (!decoded) continue;
        out.push({
          block: parseInt(log.blockNumber, 16),
          price: decoded.price,
          size: decoded.filledSize,
          takerBuy: !decoded.isBuy,
          txhash: log.transactionHash ?? `missing-tx:${log.blockNumber}:${log.logIndex ?? "0"}`,
          logIndex: log.logIndex ? parseInt(log.logIndex, 16) : 0,
          orderId: decoded.orderId.toString(),
        });
      }
    }
    return { ok: true, prints: out };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Venue prices are 1e18 on Trade/REST/parquet; the desk book is 1e8. */
export function deskPxFromRaw(raw: bigint): Px {
  return raw >= 1_000_000_000_000n ? raw / PRICE_1E18_TO_1E8 : raw;
}

export function decodeTradeData(data: string): { orderId: bigint; isBuy: boolean; price: bigint; filledSize: bigint } | null {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const word = (i: number) => BigInt("0x" + hex.slice(i * 64, i * 64 + 64));
  try {
    if (hex.length >= 512) {
      return {
        orderId: word(0),
        isBuy: word(2) !== 0n,
        price: deskPxFromRaw(word(3)),
        filledSize: word(7),
      };
    }
    if (hex.length < 320) return null;
    return {
      orderId: word(0),
      isBuy: word(1) !== 0n,
      price: deskPxFromRaw(word(2)),
      filledSize: word(4),
    };
  } catch {
    return null;
  }
}
