import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBook, type Book } from "./book.js";
import { MOCK_SPEC } from "./spec.js";
import type { Print } from "./tape.js";

export type UglyHead = {
  type: "head";
  block: number;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  prints: { price: string; size: string; takerBuy: boolean; txhash: string; logIndex: number; orderId: string }[];
};

export type UglyHole = {
  type: "hole";
  fromBlock: number;
  toBlock: number;
  reason: "rpc_gap";
};

export type UglyEvent = UglyHead | UglyHole;

export interface UglyDayFile {
  name: string;
  note: string;
  market: string;
  events: UglyEvent[];
}

export type ReplayEvent =
  | { type: "head"; book: Book; prints: Print[] }
  | { type: "hole"; fromBlock: number; toBlock: number; reason: "rpc_gap"; chainHead: number };

const START_BLOCK = 2_000_000;
const PHASE = 32;
const HOLE = 12;

/** Locked decide cadence for the holdout. Independent of .env DECISION_EVERY_BLOCKS. */
export const UGLY_DECISION_EVERY = 8;

type Phase = "chop" | "trend_up" | "trend_down" | "dead";

/**
 * Deterministic mixed tape: chop / trend / hole / dead.
 * Prints are explicit Trade rows. Dead and hole invent none.
 */
export function buildUglyDayFile(): UglyDayFile {
  const spec = MOCK_SPEC;
  const clip = spec.minSize.toString();
  const events: UglyEvent[] = [];
  let mid = 5_000_000n;
  let block = START_BLOCK;

  const emit = (phase: Phase, n: number) => {
    for (let i = 0; i < n; i++) {
      if (phase === "trend_up") mid += 4n * spec.tickSize;
      else if (phase === "trend_down") mid -= 4n * spec.tickSize;
      else if (phase === "chop") mid += BigInt((i % 5) - 2) * spec.tickSize;
      if (mid < 1_000_000n) mid = 1_000_000n;
      const half = phase === "dead" ? 40n * spec.tickSize : 8n * spec.tickSize;
      const bid = mid - half;
      const ask = mid + half;
      const bidSize = phase === "trend_up" ? (spec.minSize * 4n).toString() : clip;
      const askSize = phase === "trend_down" ? (spec.minSize * 4n).toString() : clip;
      const prints: UglyHead["prints"] = [];
      if (phase !== "dead") {
        const takerBuy = phase === "trend_up" ? true : phase === "trend_down" ? false : i % 2 === 0;
        prints.push({
          price: (takerBuy ? ask + spec.tickSize : bid - spec.tickSize).toString(),
          size: clip,
          takerBuy,
          txhash: `0xugly${block.toString(16)}`,
          logIndex: 0,
          orderId: String(block),
        });
      }
      events.push({
        type: "head",
        block,
        bid: bid.toString(),
        ask: ask.toString(),
        bidSize,
        askSize,
        prints,
      });
      block += 1;
    }
  };

  emit("chop", PHASE);
  emit("trend_up", PHASE);
  emit("chop", PHASE);
  events.push({ type: "hole", fromBlock: block, toBlock: block + HOLE - 1, reason: "rpc_gap" });
  block += HOLE;
  emit("trend_down", PHASE);
  emit("chop", PHASE);
  emit("dead", PHASE);
  emit("chop", PHASE);

  return {
    name: "ugly-day-locked-holdout",
    note: "Synthetic locked holdout. Not Kuru L2 parquet. Prints are explicit Trade rows. Hole and dead invent none. Multiple composer decisions.",
    market: spec.market,
    events,
  };
}

export function fixturePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "ugly-day.json");
}

export function writeUglyDayFile(path = fixturePath()): string {
  writeFileSync(path, `${JSON.stringify(buildUglyDayFile(), null, 2)}\n`);
  return path;
}

export function loadUglyDayFile(path = fixturePath()): UglyDayFile {
  return JSON.parse(readFileSync(path, "utf8")) as UglyDayFile;
}

export function kuruFixturePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "kuru-mon-usdc-2026-09-16.json");
}

export function materializeUglyDay(file: UglyDayFile, recvMs = Date.now()): ReplayEvent[] {
  const spec = MOCK_SPEC;
  const out: ReplayEvent[] = [];
  for (const e of file.events) {
    if (e.type === "hole") {
      out.push({ type: "hole", fromBlock: e.fromBlock, toBlock: e.toBlock, reason: e.reason, chainHead: e.toBlock });
      continue;
    }
    const bid = BigInt(e.bid);
    const ask = BigInt(e.ask);
    const book = assembleBook(e.block, bid, ask, [[bid, BigInt(e.bidSize)]], [[ask, BigInt(e.askSize)]], spec, recvMs);
    const prints: Print[] = e.prints.map((p) => ({
      block: e.block,
      price: BigInt(p.price),
      size: BigInt(p.size),
      takerBuy: p.takerBuy,
      txhash: p.txhash,
      logIndex: p.logIndex,
      orderId: p.orderId,
    }));
    out.push({ type: "head", book, prints });
  }
  return out;
}

export function uglyDayReplay(recvMs = Date.now()): ReplayEvent[] {
  return materializeUglyDay(loadUglyDayFile(), recvMs);
}

export function uglyDayStats(file: UglyDayFile) {
  const heads = file.events.filter((e): e is UglyHead => e.type === "head");
  const holes = file.events.filter((e): e is UglyHole => e.type === "hole");
  const prints = heads.reduce((n, h) => n + h.prints.length, 0);
  return { heads: heads.length, holes: holes.length, prints, holeBlocks: holes.reduce((n, h) => n + (h.toBlock - h.fromBlock + 1), 0) };
}
