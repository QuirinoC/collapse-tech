import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import type { Book } from "./book.js";
import type { QuoteIntent, SkipReason } from "./compose.js";
import { formatUsd } from "./cost.js";
import type { Health } from "./health.js";
import type { Judgments, Regime } from "./model.js";
import { PaperBook, type PaperOptions } from "./paper.js";
import { displayLotsMon, displayPx, monToLots, usdToCash, type MarketSpec } from "./spec.js";
import { USD_MICROS } from "./money.js";
import type { Print } from "./tape.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const eventsPath = join(dataDir, "events.jsonl");

export type ConfBin = "0-0.50" | "0.50-0.70" | "0.70-0.85" | "0.85-1";

export function confBin(c: number): ConfBin {
  if (c < 0.5) return "0-0.50";
  if (c < 0.7) return "0.50-0.70";
  if (c < 0.85) return "0.70-0.85";
  return "0.85-1";
}

export function wilson(hits: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

interface PendingRegime {
  closeBlock: number;
  openMid: number;
  choice: Regime;
  confidence: number;
}

export interface MakerSnapshot {
  name: string;
  blocks: number;
  decisionSlots: number;
  quotedSlots: number;
  coverage: number;
  skips: Record<SkipReason, number>;
  lateSlots: number;
  replaces: number;
  gasUsd: number;
  jevUsd: number;
  fills: number;
  spreadUsd: number;
  markout1s: number;
  markout6s: number;
  markoutHorizon: number;
  pnlUsd: number;
  net2x: number;
  net3x: number;
  inventoryMon: number;
  openFills: number;
  unknownOrders: number;
  killed: boolean;
}

export function paperOptions(spec: MarketSpec, testFast = false): PaperOptions {
  const gasMicros = BigInt(Math.round(config.gasUsdPerReplace * Number(USD_MICROS)));
  return {
    inclusionDelayBlocks: testFast ? 0 : config.inclusionDelayBlocks,
    pollLagBlocks: testFast ? 0 : config.pollLagBlocks,
    replaceMinMs: testFast ? 0 : config.replaceMinMs,
    replaceMidTicks: BigInt(config.replaceMidTicks),
    propMaintainBps: BigInt(config.propMaintainBps),
    adverseTicks: BigInt(config.adverseTicks),
    gasUsdPerReplace: gasMicros,
    gasSource: config.gasUsdSource,
    gasUnitsPerReplace: BigInt(config.gasUnitsPerReplace),
    maxPosition: monToLots(BigInt(config.maxPositionMon), spec),
    clipLots: monToLots(BigInt(Math.max(200, config.tradeSizeMon)), spec),
    jevUsdPerMTok: config.jevUsdPerMTok,
    bankrollCash: usdToCash(BigInt(Math.round(config.bankrollUsd * Number(USD_MICROS))), spec),
    dailyLossUsd: BigInt(Math.round(config.dailyLossUsd * Number(USD_MICROS))),
  };
}

export const OK_HEALTH: Health = { ok: true, reason: "ok", marketState: "ACTIVE" };

export class MakerBook {
  blocks = 0;
  decisionSlots = 0;
  quotedSlots = 0;
  lateSlots = 0;
  skips: Record<SkipReason, number> = {
    regime_low_conf: 0,
    quote_ok: 0,
    toxic: 0,
    late: 0,
    headline: 0,
    dead: 0,
  };
  health: Health = OK_HEALTH;
  readonly paper: PaperBook;
  readonly resolvedToxic: { toxic: number; markout?: number }[] = [];

  constructor(readonly name: string, readonly spec: MarketSpec, opts?: PaperOptions) {
    this.paper = new PaperBook(name, spec, opts ?? paperOptions(spec));
  }

  get inventoryMon(): number {
    return displayLotsMon(this.paper.ledger.inventory, this.spec);
  }

  get fills(): number {
    return this.paper.fills;
  }

  get markout1s(): number {
    return Number(this.paper.cost().markoutUsd) / 1e6;
  }

  onBook(book: Book, prints: Print[]) {
    this.blocks++;
    this.paper.onBook(book, prints, {
      oneS: config.markout1sBlocks,
      sixS: config.markout6sBlocks,
      horizon: config.horizonBlocks,
    });
    this.resolvedToxic.push(...this.paper.resolvedToxic.splice(0));
  }

  noteLate() {
    this.decisionSlots++;
    this.lateSlots++;
    this.skips.late++;
    this.paper.pull("late");
  }

  applyIntent(book: Book, intent: QuoteIntent, judgments?: Judgments, late = false) {
    this.decisionSlots++;
    if (late) {
      this.lateSlots++;
      this.skips.late++;
      this.paper.pull("late");
      return;
    }
    if (!intent.quote) {
      if (intent.skipReason) this.skips[intent.skipReason]++;
      this.paper.pull(intent.skipReason ?? "skip");
      return;
    }
    this.quotedSlots++;
    this.paper.applyDesired(
      book,
      this.health,
      {
        bidInsideTicks: intent.bidInsideTicks,
        askInsideTicks: intent.askInsideTicks,
        bidLots: monToLots(BigInt(Math.round(intent.bidSizeMon)), this.spec),
        askLots: monToLots(BigInt(Math.round(intent.askSizeMon)), this.spec),
      },
      Date.now(),
      judgments ? Math.ceil(judgments.latencyMs / config.blockMs) : 0,
      judgments
        ? { toxic: judgments.toxic, regimeConf: judgments.regime.confidence, inputTokens: judgments.inputTokens, name: judgments.name }
        : undefined,
    );
  }

  paperKill(reason: string) {
    this.paper.paperKill(reason);
  }

  snapshot(): MakerSnapshot {
    const coverage = this.decisionSlots ? this.quotedSlots / this.decisionSlots : 0;
    const c = this.paper.cost();
    const unreal = this.paper.unrealizedUsd();
    return {
      name: this.name,
      blocks: this.blocks,
      decisionSlots: this.decisionSlots,
      quotedSlots: this.quotedSlots,
      coverage,
      skips: { ...this.skips },
      lateSlots: this.lateSlots,
      replaces: this.paper.replaces,
      gasUsd: Number(c.gasUsd) / 1e6,
      jevUsd: Number(c.jevUsd) / 1e6,
      fills: this.paper.fills,
      spreadUsd: Number(c.spreadUsd) / 1e6,
      markout1s: Number(this.paper.markout1s === 0n ? 0n : c.markoutUsd) / 1e6,
      markout6s: Number(this.paper.markout6s === 0n ? 0n : c.markoutUsd) / 1e6,
      markoutHorizon: Number(c.markoutUsd) / 1e6,
      pnlUsd: Number(c.net1x + unreal) / 1e6,
      net2x: Number(c.net2x) / 1e6,
      net3x: Number(c.net3x) / 1e6,
      inventoryMon: this.inventoryMon,
      openFills: this.paper.serialize().fills.filter((f) => f.markoutHorizon === undefined).length,
      unknownOrders: this.paper.orders.all().filter((o) => o.status === "unknown").length,
      killed: this.paper.kill.killed,
    };
  }
}

export class DirectionBoard {
  hits = 0;
  misses = 0;
  skippedOverlap = 0;
  pending = 0;
  private nextOk = 0;
  private open: { closeBlock: number; openMid: number; side: "buy" | "sell"; path: number[] }[] = [];

  decide(block: number, mid: number, side: "buy" | "sell") {
    if (block < this.nextOk) {
      this.skippedOverlap++;
      return;
    }
    this.open.push({ closeBlock: block + config.horizonBlocks, openMid: mid, side, path: [mid] });
    this.nextOk = block + config.horizonBlocks;
    this.pending = this.open.length;
  }

  onBook(block: number, mid: number) {
    const still = [];
    for (const t of this.open) {
      t.path.push(mid);
      if (block < t.closeBlock) {
        still.push(t);
        continue;
      }
      const moved = mid - t.openMid;
      if (moved === 0) {
        still.push(t);
        continue;
      }
      const hit = t.side === "buy" ? moved > 0 : moved < 0;
      if (hit) this.hits++;
      else this.misses++;
    }
    this.open = still;
    this.pending = still.length;
  }

  judged() {
    return this.hits + this.misses;
  }
}

export class Calibration {
  regime: Record<ConfBin, { n: number; correct: number }> = emptyBins();
  toxic: Record<ConfBin, { n: number; adverse: number; markout: number }> = emptyToxic();
  private pending: PendingRegime[] = [];

  observeRegime(block: number, mid: number, choice: Regime, confidence: number) {
    this.pending.push({ closeBlock: block + config.horizonBlocks, openMid: mid, choice, confidence });
  }

  onBook(block: number, mid: number, lastFillMarkouts: { toxic: number; markout?: number }[] = []) {
    const still: PendingRegime[] = [];
    for (const p of this.pending) {
      if (block < p.closeBlock) {
        still.push(p);
        continue;
      }
      const move = mid - p.openMid;
      const bps = p.openMid ? (Math.abs(move) / p.openMid) * 10_000 : 0;
      let correct = false;
      if (p.choice === "trend_up") correct = move > 0;
      else if (p.choice === "trend_down") correct = move < 0;
      else correct = bps < 8;
      const b = this.regime[confBin(p.confidence)];
      b.n++;
      if (correct) b.correct++;
    }
    this.pending = still;
    for (const f of lastFillMarkouts) {
      if (f.markout === undefined) continue;
      const b = this.toxic[confBin(f.toxic)];
      b.n++;
      b.markout += f.markout;
      if (f.markout > 0) b.adverse++;
    }
  }

  highConfRegime() {
    const slice = this.regime["0.85-1"];
    const n = slice.n;
    const hits = slice.correct;
    const [lo, hi] = wilson(hits, n);
    return { n, hits, acc: n ? hits / n : 0, lo, hi };
  }
}

function emptyBins(): Record<ConfBin, { n: number; correct: number }> {
  return {
    "0-0.50": { n: 0, correct: 0 },
    "0.50-0.70": { n: 0, correct: 0 },
    "0.70-0.85": { n: 0, correct: 0 },
    "0.85-1": { n: 0, correct: 0 },
  };
}

function emptyToxic(): Record<ConfBin, { n: number; adverse: number; markout: number }> {
  return {
    "0-0.50": { n: 0, adverse: 0, markout: 0 },
    "0.50-0.70": { n: 0, adverse: 0, markout: 0 },
    "0.70-0.85": { n: 0, adverse: 0, markout: 0 },
    "0.85-1": { n: 0, adverse: 0, markout: 0 },
  };
}

export function resetEvents() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(eventsPath, "");
}

export function writeEvent(row: unknown) {
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(eventsPath, `${JSON.stringify(row)}\n`);
}

export function formatMaker(s: MakerSnapshot): string {
  const cov = (s.coverage * 100).toFixed(1);
  const skipBits = (Object.entries(s.skips) as [SkipReason, number][])
    .filter(([, n]) => n)
    .map(([k, n]) => `${k}=${n}`)
    .join(",");
  return `${s.name}: quote=${cov}% fills=${s.fills} spread=${s.spreadUsd} moH=${s.markoutHorizon} gas=${s.gasUsd} jevUsd=${s.jevUsd} pnl=${s.pnlUsd} net2x=${s.net2x} net3x=${s.net3x} inv=${s.inventoryMon} skips=${skipBits || "none"}`;
}

export function formatCalib(cal: Calibration): string {
  const lines = ["regime confidence bins (later mid / chop-small-move):"];
  for (const [k, v] of Object.entries(cal.regime)) {
    const acc = v.n ? ((v.correct / v.n) * 100).toFixed(1) : "n/a";
    lines.push(`  ${k}: ${v.correct}/${v.n} (${acc}%)`);
  }
  const hi = cal.highConfRegime();
  const acc = hi.n ? ((hi.acc * 100).toFixed(1) + `% CI [${(hi.lo * 100).toFixed(1)}, ${(hi.hi * 100).toFixed(1)}]`) : "n/a";
  lines.push(`  high-conf slice (>=${config.gates.highConfSlice}): ${hi.hits}/${hi.n} ${acc}`);
  lines.push("toxic vs later adverse markout:");
  for (const [k, v] of Object.entries(cal.toxic)) {
    const adv = v.n ? ((v.adverse / v.n) * 100).toFixed(1) : "n/a";
    lines.push(`  ${k}: adverse=${v.adverse}/${v.n} (${adv}%) markout=${round(v.markout, 4)}`);
  }
  return lines.join("\n");
}

export function formatDirection(name: string, d: DirectionBoard): string {
  const n = d.judged();
  const [lo, hi] = wilson(d.hits, n);
  const pct = n ? ((d.hits / n) * 100).toFixed(1) : "n/a";
  return `${name} direction (non-overlap): ${d.hits}/${n} (${pct}%) CI [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}] overlap-skipped=${d.skippedOverlap}`;
}

export const HOLDOUT_MIN_DECISIONS = 8;

export function holdoutVerdict(composer: MakerSnapshot, grid: MakerSnapshot, cal: Calibration): string {
  const hi = cal.highConfRegime();
  if (composer.decisionSlots < HOLDOUT_MIN_DECISIONS) {
    return `holdout: not enough composer decisions (${composer.decisionSlots}<${HOLDOUT_MIN_DECISIONS}) — expand the locked fixture or run a longer paper tape.`;
  }
  const beat = composer.net2x > grid.net2x && composer.net3x > grid.net3x;
  if (beat) {
    return `keep iterating: ${composer.name} net2x ${composer.net2x} / net3x ${composer.net3x} beat grid ${grid.net2x} / ${grid.net3x}${hi.n ? `; high-conf regime ${hi.hits}/${hi.n}` : ""}.`;
  }
  return `kill tape-Jev: ${composer.name} net2x ${composer.net2x} / net3x ${composer.net3x} did not beat grid ${grid.net2x} / ${grid.net3x} after stressed costs (n=${composer.decisionSlots} decides). This book may have no semantic residue once numbers are in code.`;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function midDisplay(book: Book, spec: MarketSpec): number {
  return displayPx(book.mid, spec);
}

export { formatUsd };
