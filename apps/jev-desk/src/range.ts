import { config } from "./config.js";
import type { Book } from "./book.js";
import { jevUsdMicros } from "./cost.js";
import { Ledger } from "./ledger.js";
import { abs } from "./money.js";
import type { Cash, Lots, Px, Usd } from "./money.js";
import type { PaperOptions } from "./paper.js";
import type { RangeJudgment } from "./rangeModel.js";
import { dailyLossBreached, KillSwitch, SingleWriter } from "./risk.js";
import {
  alignTick,
  cashToUsdMicros,
  displayLotsMon,
  minQuoteLots,
  monToLots,
  notional,
  type MarketSpec,
} from "./spec.js";
import type { Print, TapeStats } from "./tape.js";

export type RangeSkipReason =
  | "sit"
  | "warmup"
  | "dead"
  | "expanded"
  | "horizon"
  | "open"
  | "no_room"
  | "low_conf"
  | "range_breaker"
  | "late"
  | "killed"
  | "unhealthy";

export type BandStatus = "warmup" | "ok" | "dead" | "expanded";
export type FadeSide = "buy" | "sell";
export type RangeBookMode = "sit" | "fade" | "jev";

export interface RangeParams {
  lookback: number;
  shortLookback: number;
  minWidthTicks: bigint;
  expandNumer: bigint;
  expandDenom: bigint;
  widthAtrNumer: bigint;
  widthAtrDenom: bigint;
  edgeNumer: bigint;
  edgeDenom: bigint;
  tpNumer: bigint;
  tpDenom: bigint;
  stopNumer: bigint;
  stopDenom: bigint;
  horizonBlocks: number;
  clipLots: Lots;
  actMinConfidence: number;
}

/** Statistical habit of recent mids. Not a guaranteed range. */
export interface StatisticalBand {
  low: Px;
  high: Px;
  width: Px;
  atr: Px;
  shortAtr: Px;
  last: Px;
  samples: number;
}

export interface RangeIntent {
  act: boolean;
  skipReason: RangeSkipReason;
  side?: FadeSide;
  entry?: Px;
  tp?: Px;
  stop?: Px;
}

export interface OpenRangePos {
  side: FadeSide;
  entry: Px;
  lots: Lots;
  tp: Px;
  stop: Px;
  entryBlock: number;
}

export interface RangeSnapshot {
  name: string;
  decisionSlots: number;
  entries: number;
  exits: number;
  stops: number;
  takes: number;
  jevCalls: number;
  skips: Record<RangeSkipReason, number>;
  inventoryMon: number;
  realizedUsd: number;
  unrealizedUsd: number;
  pnlUsd: number;
  net2x: number;
  net3x: number;
  gasUsd: number;
  jevUsd: number;
  open: boolean;
  killed: boolean;
}

function maxPx(a: Px, b: Px): Px {
  return a > b ? a : b;
}

function meanAbsDiff(xs: readonly Px[]): Px {
  if (xs.length < 2) return 0n;
  let s = 0n;
  for (let i = 1; i < xs.length; i++) s += abs(xs[i]! - xs[i - 1]!);
  return s / BigInt(xs.length - 1);
}

export function emptyRangeSkips(): Record<RangeSkipReason, number> {
  return {
    sit: 0,
    warmup: 0,
    dead: 0,
    expanded: 0,
    horizon: 0,
    open: 0,
    no_room: 0,
    low_conf: 0,
    range_breaker: 0,
    late: 0,
    killed: 0,
    unhealthy: 0,
  };
}

export function rangeParams(spec: MarketSpec, over: Partial<RangeParams> = {}): RangeParams {
  const r = config.range;
  const clip = minQuoteLots(spec, monToLots(BigInt(Math.max(200, config.tradeSizeMon)), spec));
  const denom = (n: number, fallback: number) => BigInt(n > 0 ? n : fallback);
  return {
    lookback: Math.max(8, r.lookback),
    shortLookback: Math.max(3, r.shortLookback),
    minWidthTicks: BigInt(Math.max(1, r.minWidthTicks)),
    expandNumer: denom(r.expandNumer, 5),
    expandDenom: denom(r.expandDenom, 2),
    widthAtrNumer: denom(r.widthAtrNumer, 16),
    widthAtrDenom: denom(r.widthAtrDenom, 1),
    edgeNumer: denom(r.edgeNumer, 1),
    edgeDenom: denom(r.edgeDenom, 5),
    tpNumer: denom(r.tpNumer, 2),
    tpDenom: denom(r.tpDenom, 5),
    stopNumer: denom(r.stopNumer, 1),
    stopDenom: denom(r.stopDenom, 4),
    horizonBlocks: Math.max(1, config.horizonBlocks),
    clipLots: clip,
    actMinConfidence: r.actMinConfidence,
    ...over,
  };
}

export function computeBand(mids: readonly Px[], params: RangeParams): StatisticalBand | undefined {
  if (mids.length < 3) return undefined;
  const window = mids.slice(-params.lookback);
  let low = window[0]!;
  let high = window[0]!;
  for (const m of window) {
    if (m < low) low = m;
    if (m > high) high = m;
  }
  const short = window.slice(-Math.min(params.shortLookback, window.length));
  return {
    low,
    high,
    width: high - low,
    atr: meanAbsDiff(window),
    shortAtr: meanAbsDiff(short),
    last: window[window.length - 1]!,
    samples: window.length,
  };
}

export function bandStatus(
  band: StatisticalBand | undefined,
  spec: MarketSpec,
  params: RangeParams,
  tape?: TapeStats,
): BandStatus {
  const need = Math.min(8, params.lookback);
  if (!band || band.samples < need) return "warmup";
  if (tape && (tape.flow === "dead" || tape.activity === "no recent prints")) return "dead";
  if (band.width < params.minWidthTicks * spec.tickSize || band.width === 0n) return "dead";
  if (band.atr > 0n && band.shortAtr * params.expandDenom > band.atr * params.expandNumer) return "expanded";
  if (band.atr > 0n && band.width * params.widthAtrDenom > band.atr * params.widthAtrNumer) return "expanded";
  return "ok";
}

export function fadeSide(band: StatisticalBand, spec: MarketSpec, params: RangeParams): FadeSide | undefined {
  const edge = maxPx(spec.tickSize, (band.width * params.edgeNumer) / params.edgeDenom);
  const nearLow = band.last <= band.low + edge;
  const nearHigh = band.last >= band.high - edge;
  if (nearLow && !nearHigh) return "buy";
  if (nearHigh && !nearLow) return "sell";
  return undefined;
}

export function planLevels(
  side: FadeSide,
  band: StatisticalBand,
  book: Book,
  spec: MarketSpec,
  params: RangeParams,
): { entry: Px; tp: Px; stop: Px } | undefined {
  const inner = (band.width * params.tpNumer) / params.tpDenom;
  const beyond = maxPx(spec.tickSize, (band.width * params.stopNumer) / params.stopDenom);
  if (side === "buy") {
    const entry = book.ask;
    const tp = alignTick(band.low + inner, spec, "floor");
    let stop = alignTick(band.low - beyond, spec, "floor");
    if (stop <= 0n) stop = spec.tickSize;
    if (tp <= band.low || tp >= band.high) return undefined;
    if (tp <= entry || stop >= entry || stop >= band.low) return undefined;
    return { entry, tp, stop };
  }
  const entry = book.bid;
  const tp = alignTick(band.high - inner, spec, "ceil");
  const stop = alignTick(band.high + beyond, spec, "ceil");
  if (tp <= band.low || tp >= band.high) return undefined;
  if (tp >= entry || stop <= entry || stop <= band.high) return undefined;
  return { entry, tp, stop };
}

export function exitHit(pos: OpenRangePos, book: Book, prints: Print[]): "stop" | "tp" | undefined {
  const stopHit =
    pos.side === "buy"
      ? book.bid <= pos.stop || prints.some((p) => p.price <= pos.stop)
      : book.ask >= pos.stop || prints.some((p) => p.price >= pos.stop);
  if (stopHit) return "stop";
  const tpHit = pos.side === "buy" ? book.bid >= pos.tp : book.ask <= pos.tp;
  return tpHit ? "tp" : undefined;
}

/**
 * Code owns band, edge, size, TP, and stop. Jev only gates a candidate fade.
 * Low confidence is sit. High confidence + nothing_burger is the only ACT path.
 */
export function composeRange(input: {
  mode: RangeBookMode;
  status: BandStatus;
  band?: StatisticalBand;
  book: Book;
  spec: MarketSpec;
  params: RangeParams;
  open: boolean;
  block: number;
  nextOkBlock: number;
  late: boolean;
  killed?: boolean;
  healthy?: boolean;
  judgment?: RangeJudgment;
}): RangeIntent {
  const sit = (reason: RangeSkipReason): RangeIntent => ({ act: false, skipReason: reason });
  if (input.killed) return sit("killed");
  if (input.healthy === false) return sit("unhealthy");
  if (input.mode === "sit") return sit("sit");
  if (input.open) return sit("open");
  if (input.block < input.nextOkBlock) return sit("horizon");
  if (input.late) return sit("late");
  if (input.status === "warmup") return sit("warmup");
  if (input.status === "dead") return sit("dead");
  if (input.status === "expanded") return sit("expanded");
  if (!input.band) return sit("warmup");
  const side = fadeSide(input.band, input.spec, input.params);
  if (!side) return sit("sit");
  const plan = planLevels(side, input.band, input.book, input.spec, input.params);
  if (!plan) return sit("no_room");
  if (input.mode === "jev") {
    const j = input.judgment;
    if (!j) return sit("sit");
    if (j.read.confidence < input.params.actMinConfidence) return sit("low_conf");
    if (j.read.choice !== "nothing_burger") return sit("range_breaker");
  }
  return { act: true, skipReason: "sit", side, entry: plan.entry, tp: plan.tp, stop: plan.stop };
}

export class RangeBook {
  readonly ledger: Ledger;
  readonly writer = new SingleWriter();
  readonly kill = new KillSwitch();
  readonly skips = emptyRangeSkips();
  open?: OpenRangePos;
  nextOkBlock = 0;
  decisionSlots = 0;
  entries = 0;
  exits = 0;
  stops = 0;
  takes = 0;
  jevCalls = 0;
  seq = 0;
  private startCash: Cash;
  private lastBid = 0n;
  private lastAsk = 0n;
  private lastBook?: Book;
  private filledLotsAbs = 0n;
  private realizedCash = 0n;

  constructor(
    readonly name: string,
    readonly spec: MarketSpec,
    readonly params: RangeParams,
    readonly opts: PaperOptions,
    readonly mode: RangeBookMode,
  ) {
    this.ledger = new Ledger(spec);
    this.ledger.open(opts.bankrollCash);
    this.startCash = opts.bankrollCash;
  }

  get inventoryMon(): number {
    return displayLotsMon(this.ledger.inventory, this.spec);
  }

  onHead(book: Book, prints: Print[]) {
    this.lastBook = book;
    this.lastBid = book.bid;
    this.lastAsk = book.ask;
    this.maybeExit(book, prints);
    this.checkDailyLoss();
  }

  applyDecision(book: Book, intent: RangeIntent, judgment?: RangeJudgment) {
    this.decisionSlots += 1;
    if (judgment) {
      this.jevCalls += 1;
      if (judgment.name !== "mock") {
        this.ledger.chargeJev(jevUsdMicros(judgment.inputTokens, this.opts.jevUsdPerMTok));
      }
    }
    if (!intent.act || !intent.side || intent.entry === undefined || intent.tp === undefined || intent.stop === undefined) {
      this.skips[intent.skipReason] += 1;
      return;
    }
    this.writer.run(() => this.enterLocked(book, intent.side!, intent.entry!, intent.tp!, intent.stop!));
  }

  paperKill(reason: string, book?: Book) {
    this.kill.kill(reason);
    const flatAt = book ?? this.lastBook;
    if (this.open && flatAt) this.flatten(flatAt, "kill");
  }

  snapshot(): RangeSnapshot {
    const unreal = this.unrealizedCash();
    const grossUsd = cashToUsdMicros(this.ledger.cash - this.startCash + this.markCash(), this.spec);
    const costUnit = this.ledger.gas + this.ledger.jev + this.adverseUsd();
    return {
      name: this.name,
      decisionSlots: this.decisionSlots,
      entries: this.entries,
      exits: this.exits,
      stops: this.stops,
      takes: this.takes,
      jevCalls: this.jevCalls,
      skips: { ...this.skips },
      inventoryMon: this.inventoryMon,
      realizedUsd: Number(cashToUsdMicros(this.realizedCash, this.spec)) / 1e6,
      unrealizedUsd: Number(cashToUsdMicros(unreal, this.spec)) / 1e6,
      pnlUsd: Number(grossUsd - this.ledger.gas - this.ledger.jev) / 1e6,
      net2x: Number(grossUsd - costUnit * 2n) / 1e6,
      net3x: Number(grossUsd - costUnit * 3n) / 1e6,
      gasUsd: Number(this.ledger.gas) / 1e6,
      jevUsd: Number(this.ledger.jev) / 1e6,
      open: Boolean(this.open),
      killed: this.kill.killed,
    };
  }

  private adverseUsd(): Usd {
    if (this.filledLotsAbs === 0n) return 0n;
    const cash = notional(this.spec.tickSize, this.filledLotsAbs, this.spec) * this.opts.adverseTicks;
    return cashToUsdMicros(cash, this.spec);
  }

  private markCash(): Cash {
    if (this.ledger.inventory > 0n) return notional(this.lastBid, this.ledger.inventory, this.spec);
    if (this.ledger.inventory < 0n) return -notional(this.lastAsk, -this.ledger.inventory, this.spec);
    return 0n;
  }

  private unrealizedCash(): Cash {
    if (!this.open) return 0n;
    const mark = this.open.side === "buy" ? this.lastBid : this.lastAsk;
    const entryNotional = notional(this.open.entry, this.open.lots, this.spec);
    const markNotional = notional(mark, this.open.lots, this.spec);
    return this.open.side === "buy" ? markNotional - entryNotional : entryNotional - markNotional;
  }

  private enterLocked(book: Book, side: FadeSide, entry: Px, tp: Px, stop: Px) {
    if (this.open || this.kill.killed) {
      this.skips[this.open ? "open" : "killed"] += 1;
      return;
    }
    if (this.params.clipLots < this.spec.minSize) {
      this.skips.no_room += 1;
      return;
    }
    this.seq += 1;
    const key = `range-entry:${this.name}:${book.block}:${this.seq}`;
    const applied = this.ledger.fill({
      fillKey: key,
      side: side === "buy" ? "bid" : "ask",
      price: entry,
      lots: this.params.clipLots,
      feeBps: this.spec.takerFeeBps,
    });
    if (!applied) {
      this.skips.no_room += 1;
      return;
    }
    this.ledger.chargeGas(this.opts.gasUsdPerReplace, "range-entry");
    this.open = { side, entry, lots: this.params.clipLots, tp, stop, entryBlock: book.block };
    this.nextOkBlock = book.block + this.params.horizonBlocks;
    this.entries += 1;
    this.filledLotsAbs += this.params.clipLots;
    this.checkDailyLoss();
  }

  private maybeExit(book: Book, prints: Print[]) {
    if (!this.open) return;
    const hit = exitHit(this.open, book, prints);
    if (!hit) return;
    this.flatten(book, hit);
  }

  private flatten(book: Book, reason: "stop" | "tp" | "kill") {
    const pos = this.open;
    if (!pos) return;
    this.seq += 1;
    const exitPx = pos.side === "buy" ? book.bid : book.ask;
    const key = `range-exit:${this.name}:${book.block}:${this.seq}:${reason}`;
    const applied = this.ledger.fill({
      fillKey: key,
      side: pos.side === "buy" ? "ask" : "bid",
      price: exitPx,
      lots: pos.lots,
      feeBps: this.spec.takerFeeBps,
    });
    if (!applied) return;
    this.ledger.chargeGas(this.opts.gasUsdPerReplace, `range-exit-${reason}`);
    const entryN = notional(pos.entry, pos.lots, this.spec);
    const exitN = notional(exitPx, pos.lots, this.spec);
    this.realizedCash += pos.side === "buy" ? exitN - entryN : entryN - exitN;
    this.filledLotsAbs += pos.lots;
    this.exits += 1;
    if (reason === "stop") this.stops += 1;
    if (reason === "tp") this.takes += 1;
    this.open = undefined;
  }

  private checkDailyLoss() {
    if (this.kill.killed) return;
    const grossUsd = cashToUsdMicros(this.ledger.cash - this.startCash + this.markCash(), this.spec);
    const pnl = grossUsd - this.ledger.gas - this.ledger.jev;
    if (dailyLossBreached(pnl, this.opts.dailyLossUsd)) this.paperKill("daily_loss");
  }
}

export function formatRange(s: RangeSnapshot): string {
  const skipBits = (Object.entries(s.skips) as [RangeSkipReason, number][])
    .filter(([, n]) => n)
    .map(([k, n]) => `${k}=${n}`)
    .join(",");
  return `${s.name}: entries=${s.entries} exits=${s.exits} stop=${s.stops} tp=${s.takes} pnl=${s.pnlUsd} net2x=${s.net2x} net3x=${s.net3x} gas=${s.gasUsd} jevUsd=${s.jevUsd} inv=${s.inventoryMon} skips=${skipBits || "none"}`;
}

export function rangeCompareLine(sit: RangeSnapshot, fade: RangeSnapshot, jev: RangeSnapshot): string {
  return `compare: ${jev.name} pnl ${jev.pnlUsd} vs sit ${sit.pnlUsd} vs fade ${fade.pnlUsd} (net2x ${jev.net2x} / sit ${sit.net2x} / fade ${fade.net2x}). Band is statistical, not guaranteed. Do not size.`;
}
