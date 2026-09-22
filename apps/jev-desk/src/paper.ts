import { adverseMarkout, deskCost, jevUsdMicros, type CostBreakdown, type CostConfig } from "./cost.js";
import { Ledger, type SerializedLedger } from "./ledger.js";
import { OrderMachine, type Intent, type SerializedOrders, type Side } from "./orders.js";
import { dailyLossBreached, KillSwitch, preTrade, SingleWriter, type RiskReject } from "./risk.js";
import { cashToUsdMicros, notional, wouldCross, type MarketSpec } from "./spec.js";
import { fillKey, type Print } from "./tape.js";
import type { Book } from "./book.js";
import type { Health } from "./health.js";
import type { Cash, Lots, Px, Usd } from "./money.js";

export interface Resting {
  bid?: { price: Px; size: Lots; intentId: string };
  ask?: { price: Px; size: Lots; intentId: string };
}

export interface PaperOptions {
  inclusionDelayBlocks: number;
  pollLagBlocks: number;
  replaceMinMs: number;
  replaceMidTicks: bigint;
  propMaintainBps: bigint;
  adverseTicks: bigint;
  gasUsdPerReplace: Usd;
  gasSource: CostConfig["gasSource"];
  gasUnitsPerReplace: bigint;
  maxPosition: Lots;
  clipLots: Lots;
  jevUsdPerMTok: number;
  bankrollCash: Cash;
  dailyLossUsd: Usd;
}

export interface DesiredQuote {
  bidInsideTicks: number;
  askInsideTicks: number;
  bidLots: Lots;
  askLots: Lots;
}

export interface OpenFill {
  fillKey: string;
  side: Side;
  price: Px;
  size: Lots;
  block: number;
  bidAtFill: Px;
  askAtFill: Px;
  toxic: number;
  regimeConf: number;
  markout1s?: Cash;
  markout6s?: Cash;
  markoutHorizon?: Cash;
}

export interface SerializedPaper {
  ledger: SerializedLedger;
  orders: SerializedOrders;
  venueSeq: number;
  fills: OpenFill[];
  lastReplaceMs: number;
  lastReplaceMid: string;
  killed: boolean;
  killReason?: string;
}

export interface PaperApply {
  replaced: boolean;
  rejected?: RiskReject;
  postOnlyReverts: number;
  intents: Intent[];
}

/** Fill only if the tape trades through the rest by ≥ 1 tick. Touch is not a fill. No FIFO queue. */
export function tradesThrough(side: Side, rest: Px, print: Print, spec: MarketSpec): boolean {
  if (side === "bid") return !print.takerBuy && print.price <= rest - spec.tickSize;
  return print.takerBuy && print.price >= rest + spec.tickSize;
}

export class PaperBook {
  readonly ledger: Ledger;
  readonly orders: OrderMachine;
  readonly writer = new SingleWriter();
  readonly kill = new KillSwitch();
  resting: Resting = {};
  fills = 0;
  replaces = 0;
  private venueSeq = 0;
  private lastReplaceMs = 0;
  private lastReplaceMid = 0n;
  private open: OpenFill[] = [];
  private lastBid = 0n;
  private lastAsk = 0n;
  private lastToxic = 0;
  private lastRegimeConf = 0;
  readonly resolvedToxic: { toxic: number; markout?: number }[] = [];
  spreadCash = 0n;
  markout1s = 0n;
  markout6s = 0n;
  markoutHorizon = 0n;
  filledLotsAbs = 0n;

  constructor(
    readonly name: string,
    readonly spec: MarketSpec,
    readonly opts: PaperOptions,
  ) {
    this.ledger = new Ledger(spec);
    this.orders = new OrderMachine(spec);
    this.ledger.open(opts.bankrollCash);
  }

  serialize(): SerializedPaper {
    return {
      ledger: this.ledger.serialize(),
      orders: this.orders.serialize(),
      venueSeq: this.venueSeq,
      fills: this.open.map((f) => ({ ...f })),
      lastReplaceMs: this.lastReplaceMs,
      lastReplaceMid: this.lastReplaceMid.toString(),
      killed: this.kill.killed,
      killReason: this.kill.reason,
    };
  }

  static recover(name: string, spec: MarketSpec, opts: PaperOptions, snap: SerializedPaper): PaperBook {
    const book = new PaperBook(name, spec, opts);
    (book as { ledger: Ledger }).ledger = Ledger.restore(spec, snap.ledger);
    (book as { orders: OrderMachine }).orders = OrderMachine.restore(spec, snap.orders);
    book.venueSeq = snap.venueSeq;
    book.open = snap.fills.map((f) => ({ ...f }));
    book.fills = book.open.length;
    book.filledLotsAbs = book.open.reduce((s, f) => s + f.size, 0n);
    book.lastReplaceMs = snap.lastReplaceMs;
    book.lastReplaceMid = BigInt(snap.lastReplaceMid);
    if (snap.killed) book.kill.kill(snap.killReason ?? "recovered-kill");
    book.orders.pullConfirmed("restart-pull");
    book.resting = {};
    book.spreadCash = 0n;
    for (const f of book.open) {
      const exit = f.side === "bid" ? f.askAtFill : f.bidAtFill;
      book.spreadCash += f.side === "bid" ? notional(exit, f.size, spec) - notional(f.price, f.size, spec) : notional(f.price, f.size, spec) - notional(exit, f.size, spec);
    }
    book.markout1s = book.open.reduce((s, f) => s + (f.markout1s ?? 0n), 0n);
    book.markout6s = book.open.reduce((s, f) => s + (f.markout6s ?? 0n), 0n);
    book.markoutHorizon = book.open.reduce((s, f) => s + (f.markoutHorizon ?? 0n), 0n);
    return book;
  }

  paperKill(reason: string) {
    this.kill.kill(reason);
    this.pull("kill");
  }

  onBook(book: Book, prints: Print[], markoutBlocks: { oneS: number; sixS: number; horizon: number }) {
    this.lastBid = book.bid;
    this.lastAsk = book.ask;
    this.match(book, prints);
    this.resolveMarkouts(book, markoutBlocks);
    this.checkDailyLoss();
  }

  applyDesired(
    book: Book,
    health: Health,
    desired: DesiredQuote,
    nowMs: number,
    decideLagBlocks: number,
    judgments?: { toxic: number; regimeConf: number; inputTokens: number; name: string },
  ): PaperApply {
    return this.writer.run(() => this.applyDesiredLocked(book, health, desired, nowMs, decideLagBlocks, judgments));
  }

  pull(reason = "pull", charge = true) {
    if (this.resting.bid || this.resting.ask) {
      if (charge) {
        this.replaces += 1;
        this.ledger.chargeGas(this.opts.gasUsdPerReplace, reason);
      }
    }
    if (this.resting.bid) this.orders.cancel(this.resting.bid.intentId, reason);
    if (this.resting.ask) this.orders.cancel(this.resting.ask.intentId, reason);
    this.resting = {};
  }

  cost(): CostBreakdown {
    return deskCost({
      spec: this.spec,
      ledger: this.ledger,
      spreadCash: this.spreadCash,
      markoutCash: this.markoutHorizon,
      fillLots: this.filledLotsAbs,
      cfg: {
        adverseTicks: this.opts.adverseTicks,
        gasUsdPerReplace: this.opts.gasUsdPerReplace,
        gasSource: this.opts.gasSource,
        gasUnitsPerReplace: this.opts.gasUnitsPerReplace,
      },
    });
  }

  markCash(): Cash {
    return this.ledger.inventory > 0n
      ? notional(this.lastBid, this.ledger.inventory, this.spec)
      : this.ledger.inventory < 0n
        ? -notional(this.lastAsk, -this.ledger.inventory, this.spec)
        : 0n;
  }

  unrealizedUsd(): Usd {
    return cashToUsdMicros(this.markCash() - this.cashBasis(), this.spec);
  }

  private cashBasis(): Cash {
    let basis = 0n;
    for (const e of this.ledger.entries()) {
      if (e.kind !== "fill") continue;
      const cash = e.postings.find((p) => p.account === "cash");
      if (cash) basis -= cash.amount;
    }
    return basis;
  }

  private applyDesiredLocked(
    book: Book,
    health: Health,
    desired: DesiredQuote,
    nowMs: number,
    decideLagBlocks: number,
    judgments?: { toxic: number; regimeConf: number; inputTokens: number; name: string },
  ): PaperApply {
    if (judgments) {
      this.lastToxic = judgments.toxic;
      this.lastRegimeConf = judgments.regimeConf;
      if (judgments.name !== "mock") {
        this.ledger.chargeJev(jevUsdMicros(judgments.inputTokens, this.opts.jevUsdPerMTok));
      }
    }

    const risk = preTrade({
      spec: this.spec,
      health,
      kill: this.kill,
      inventory: this.ledger.inventory,
      maxPosition: this.opts.maxPosition,
      bidLots: desired.bidLots,
      askLots: desired.askLots,
    });
    if (!risk.ok) {
      this.pull(risk.reject ?? "risk");
      return { replaced: false, rejected: risk.reject, postOnlyReverts: 0, intents: [] };
    }
    this.checkDailyLoss();
    if (this.kill.killed) {
      this.pull("daily_loss");
      return { replaced: false, rejected: "killed", postOnlyReverts: 0, intents: [] };
    }

    const nextBidPx = desired.bidInsideTicks >= 0 && risk.bidLots > 0n ? book.bid + BigInt(desired.bidInsideTicks) * this.spec.tickSize : undefined;
    const nextAskPx = desired.askInsideTicks >= 0 && risk.askLots > 0n ? book.ask - BigInt(desired.askInsideTicks) * this.spec.tickSize : undefined;

    const next: Resting = {};
    let postOnlyReverts = 0;
    const intents: Intent[] = [];
    const liveFrom = book.block + decideLagBlocks + this.opts.pollLagBlocks + this.opts.inclusionDelayBlocks;

    const wantBid = nextBidPx !== undefined && risk.bidLots > 0n;
    const wantAsk = nextAskPx !== undefined && risk.askLots > 0n;

    if (!wantBid && !wantAsk) {
      this.pull("flat");
      return { replaced: false, postOnlyReverts: 0, intents };
    }

    if (!this.shouldReplace(book, nowMs, nextBidPx, nextAskPx, risk.bidLots, risk.askLots, desired)) {
      return { replaced: false, postOnlyReverts: 0, intents };
    }

    this.pull("replace", false);
    this.replaces += 1;
    this.ledger.chargeGas(this.opts.gasUsdPerReplace, "replace");
    this.lastReplaceMs = nowMs;
    this.lastReplaceMid = book.mid;

    if (wantBid && nextBidPx !== undefined) {
      const r = this.placeSide("bid", nextBidPx, risk.bidLots, book, liveFrom);
      intents.push(r.intent);
      if (r.intent.status === "failed") postOnlyReverts += 1;
      else if (r.intent.status === "confirmed") next.bid = { price: nextBidPx, size: risk.bidLots, intentId: r.intent.intentId };
    }
    if (wantAsk && nextAskPx !== undefined) {
      const r = this.placeSide("ask", nextAskPx, risk.askLots, book, liveFrom);
      intents.push(r.intent);
      if (r.intent.status === "failed") postOnlyReverts += 1;
      else if (r.intent.status === "confirmed") next.ask = { price: nextAskPx, size: risk.askLots, intentId: r.intent.intentId };
    }
    this.resting = next;
    this.checkDailyLoss();
    return { replaced: true, postOnlyReverts, intents };
  }

  private checkDailyLoss() {
    if (this.kill.killed) return;
    const pnl = this.unrealizedUsd() + this.cost().net1x;
    if (dailyLossBreached(pnl, this.opts.dailyLossUsd)) this.paperKill("daily_loss");
  }

  private placeSide(side: Side, price: Px, size: Lots, book: Book, liveFrom: number) {
    const intent = this.orders.persist(side, price, size, book.block);
    if (wouldCross(side, price, book.bid, book.ask)) {
      return this.orders.submitPaper(intent.intentId, book.bid, book.ask, liveFrom, "");
    }
    this.venueSeq += 1;
    return this.orders.submitPaper(intent.intentId, book.bid, book.ask, liveFrom, `paper-${this.venueSeq}`);
  }

  private shouldReplace(
    book: Book,
    nowMs: number,
    nextBid?: Px,
    nextAsk?: Px,
    nextBidLots = 0n,
    nextAskLots = 0n,
    desired?: DesiredQuote,
  ): boolean {
    const changed =
      nextBid !== this.resting.bid?.price ||
      nextAsk !== this.resting.ask?.price ||
      nextBidLots !== (this.resting.bid?.size ?? 0n) ||
      nextAskLots !== (this.resting.ask?.size ?? 0n);
    const elapsed = this.lastReplaceMs === 0 || nowMs - this.lastReplaceMs >= this.opts.replaceMinMs;
    const midMove = this.lastReplaceMid === 0n || this.absPx(book.mid - this.lastReplaceMid) >= this.opts.replaceMidTicks * this.spec.tickSize;
    const prop = desired ? this.propMaintainBreach(book, desired) : false;
    if (!this.resting.bid && !this.resting.ask) return true;
    if (!changed && !prop) return false;
    return elapsed || midMove;
  }

  private propMaintainBreach(book: Book, desired: DesiredQuote): boolean {
    const keepBps = 10_000n - this.opts.propMaintainBps;
    if (this.resting.bid && desired.bidInsideTicks > 0) {
      const target = BigInt(desired.bidInsideTicks);
      const edge = (this.resting.bid.price - book.bid) / this.spec.tickSize;
      if (edge * 10_000n < target * keepBps) return true;
    }
    if (this.resting.ask && desired.askInsideTicks > 0) {
      const target = BigInt(desired.askInsideTicks);
      const edge = (book.ask - this.resting.ask.price) / this.spec.tickSize;
      if (edge * 10_000n < target * keepBps) return true;
    }
    return false;
  }

  private match(book: Book, prints: Print[]) {
    for (const p of prints) {
      this.tryFill("bid", book, p);
      this.tryFill("ask", book, p);
    }
  }

  private tryFill(side: Side, book: Book, p: Print) {
    const rest = this.resting[side];
    if (!rest) return;
    const intent = this.orders.get(rest.intentId);
    if (!intent || intent.status !== "confirmed") return;
    if (intent.liveFromBlock !== undefined && p.block < intent.liveFromBlock) return;
    if (!tradesThrough(side, rest.price, p, this.spec)) return;
    const key = `${fillKey(p)}:${intent.venueOrderId ?? intent.intentId}`;
    if (this.ledger.hasFill(key)) return;
    const size = p.size < rest.size ? p.size : rest.size;
    if (size < this.spec.minSize && size !== rest.size) return;
    if (size <= 0n) return;
    const applied = this.ledger.fill({
      fillKey: key,
      side,
      price: rest.price,
      lots: size,
      feeBps: this.spec.makerFeeBps,
    });
    if (!applied) return;
    this.orders.applyFill(intent.intentId, size, rest.price);
    const exit = side === "bid" ? book.ask : book.bid;
    this.spreadCash += side === "bid" ? notional(exit, size, this.spec) - notional(rest.price, size, this.spec) : notional(rest.price, size, this.spec) - notional(exit, size, this.spec);
    this.fills += 1;
    this.filledLotsAbs += size;
    this.open.push({
      fillKey: key,
      side,
      price: rest.price,
      size,
      block: book.block,
      bidAtFill: book.bid,
      askAtFill: book.ask,
      toxic: this.lastToxic,
      regimeConf: this.lastRegimeConf,
    });
    rest.size -= size;
    if (rest.size === 0n) delete this.resting[side];
  }

  private resolveMarkouts(book: Book, blocks: { oneS: number; sixS: number; horizon: number }) {
    for (const f of this.open) {
      const age = book.block - f.block;
      if (f.markout1s === undefined && age >= blocks.oneS) {
        f.markout1s = adverseMarkout(f.side, f.price, f.size, book.bid, book.ask, this.spec);
        this.markout1s += f.markout1s;
      }
      if (f.markout6s === undefined && age >= blocks.sixS) {
        f.markout6s = adverseMarkout(f.side, f.price, f.size, book.bid, book.ask, this.spec);
        this.markout6s += f.markout6s;
      }
      if (f.markoutHorizon === undefined && age >= blocks.horizon) {
        f.markoutHorizon = adverseMarkout(f.side, f.price, f.size, book.bid, book.ask, this.spec);
        this.markoutHorizon += f.markoutHorizon;
        this.resolvedToxic.push({
          toxic: f.toxic,
          markout: Number(cashToUsdMicros(f.markoutHorizon, this.spec)) / 1e6,
        });
      }
    }
  }

  private absPx(n: Px): Px {
    return n < 0n ? -n : n;
  }
}
