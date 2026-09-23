import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleBook, emptyBook } from "./book.js";
import { buildState, inventoryWords, pressureWord, secondsPhrase, spreadWord } from "./buckets.js";
import { composeQuotes, gridQuote, inventorySizes, LEAN_TICKS, noulUncertain } from "./compose.js";
import { config } from "./config.js";
import { adverseMarkout, deskCost, markInventory } from "./cost.js";
import { DirectionBoard, HOLDOUT_MIN_DECISIONS, MakerBook, paperOptions, wilson, OK_HEALTH } from "./desk.js";
import { assessHealth, liveAbiMarketState } from "./health.js";
import { Ledger } from "./ledger.js";
import { mockTape, MOCK_SPEC } from "./mockTape.js";
import { MockModel, nearestLeanLevel, type Judgments } from "./model.js";
import { USD_MICROS } from "./money.js";
import { OrderMachine } from "./orders.js";
import { PaperBook, tradesThrough } from "./paper.js";
import { DeadMan, dailyLossBreached, SingleWriter } from "./risk.js";
import { Tape, decodeTradeData, deskPxFromRaw } from "./tape.js";
import { createRun, stepHead } from "./runner.js";
import { replayUglyDay } from "./replay.js";
import {
  bandStatus,
  composeRange,
  computeBand,
  exitHit,
  fadeSide,
  planLevels,
  rangeParams,
  RangeBook,
  type StatisticalBand,
} from "./range.js";
import { MockRangeModel } from "./rangeModel.js";
import { replayRangeUglyDay } from "./rangeRunner.js";
import { ShadowBook } from "./shadow.js";
import { lotsToMon, notional, persistSpec, VENUE_MON_USDC } from "./spec.js";
import { buildUglyDayFile, loadUglyDayFile, UGLY_DECISION_EVERY, uglyDayStats } from "./uglyDay.js";
import type { Book } from "./book.js";
import type { Print } from "./tape.js";

function baseJudgments(over: Partial<Judgments> = {}): Judgments {
  return {
    name: "mock",
    regime: {
      choice: "chop",
      confidence: 0.9,
      probabilities: { trend_up: 0.05, trend_down: 0.05, chop: 0.85, dead: 0.05 },
    },
    quoteOk: 0.85,
    toxic: 0.1,
    lean: { level: 2, score: 2, confidence: 0.4 },
    materialHeadline: 0,
    naive: { action: "buy", confidence: 0.55, probabilities: { buy: 0.55, sell: 0.45 } },
    latencyMs: 10,
    inputTokens: 0,
    ...over,
  };
}

function bookAt(mid: bigint, block: number, recvMs = Date.now()): Book {
  const half = 8n * MOCK_SPEC.tickSize;
  return assembleBook(block, mid - half, mid + half, [[mid - half, MOCK_SPEC.minSize]], [[mid + half, MOCK_SPEC.minSize]], MOCK_SPEC, recvMs);
}

function throughPrint(book: Book, side: "bid" | "ask", size = MOCK_SPEC.minSize): Print {
  return {
    block: book.block,
    price: side === "bid" ? book.bid - MOCK_SPEC.tickSize : book.ask + MOCK_SPEC.tickSize,
    size,
    takerBuy: side === "ask",
    txhash: `0xtest${book.block}`,
    logIndex: 0,
    orderId: "1",
  };
}

function checkTradeDecode() {
  const data =
    "0x" +
    "0000000000000000000000000000000000000000000000000000000006047603" +
    "0000000000000000000000008cf67893c236963233023b56ac56a185b042866f" +
    "0000000000000000000000000000000000000000000000000000000000000001" +
    "00000000000000000000000000000000000000000000000000512df4351e2000" +
    "0000000000000000000000000000000000000000000000000000000000000000" +
    "00000000000000000000000034ae4d081c0d46b23ebf5292c1be4e45f8a73fc5" +
    "000000000000000000000000c88db3f7ea78f2dde27297e2934de3cfe4d42e5a" +
    "0000000000000000000000000000000000000000000000000000c645148fa000";
  const d = decodeTradeData(data);
  assert.ok(d);
  assert.equal(d.orderId, 0x6047603n);
  assert.equal(d.isBuy, true);
  assert.equal(d.price, 2_285_000n);
  assert.equal(d.filledSize, 218000000000000n);
  assert.equal(deskPxFromRaw(22850000000000000n), 2_285_000n);
}

function checkBuckets() {
  assert.equal(pressureWord(0.4), "bid-heavy");
  assert.equal(pressureWord(-0.4), "ask-heavy");
  assert.equal(spreadWord(2), "tight");
  assert.equal(secondsPhrase(30), "about thirty seconds");
  assert.equal(inventoryWords(0).side, "flat");
  assert.equal(inventoryWords(900).side, "long");
  const st = buildState(
    bookAt(5_000_000n, 1),
    MOCK_SPEC,
    [0.05],
    { flow: "mixed", lastSide: "buy", cvdAgreesWithLastMove: true, activity: "active prints" },
    0,
  );
  assert.equal(st.book_shape.pressure, "balanced");
  assert.ok(st.clock.horizon.includes("seconds"));
  assert.equal(typeof st.naive.mid, "number");
}

function checkCompose() {
  assert.equal(noulUncertain(0.5), true);
  assert.equal(noulUncertain(0.9), false);

  const lowRegime = composeQuotes(baseJudgments({ regime: { ...baseJudgments().regime, confidence: 0.2 } }), 0, false);
  assert.equal(lowRegime.quote, false);
  assert.equal(lowRegime.skipReason, "regime_low_conf");

  const toxic = composeQuotes(baseJudgments({ toxic: 0.9 }), 0, false);
  assert.equal(toxic.quote, false);
  assert.equal(toxic.skipReason, "toxic");

  const qok = composeQuotes(baseJudgments({ quoteOk: 0.5 }), 0, false);
  assert.equal(qok.quote, false);
  assert.equal(qok.skipReason, "quote_ok");

  const late = composeQuotes(baseJudgments(), 0, true);
  assert.equal(late.skipReason, "late");

  const noLean = composeQuotes(baseJudgments({ lean: { level: 0, score: 0.4, confidence: 0.4 } }), 0, false);
  assert.equal(noLean.quote, true);
  assert.equal(noLean.leanApplied, false);
  assert.equal(noLean.bidInsideTicks, config.quoteInsideTicks);

  const leaned = composeQuotes(baseJudgments({ lean: { level: 0, score: 0.4, confidence: 0.95 } }), 0, false);
  assert.equal(leaned.leanApplied, true);
  assert.equal(leaned.bidInsideTicks, config.quoteInsideTicks + LEAN_TICKS[0].bid);
  assert.notEqual(leaned.bidInsideTicks, Math.round(0.4 * 10));

  const interp = nearestLeanLevel(2.7);
  assert.equal(interp, 3);
  const fromTable = composeQuotes(baseJudgments({ lean: { level: interp, score: 2.7, confidence: 0.95 } }), 0, false);
  assert.equal(fromTable.askInsideTicks, config.quoteInsideTicks + LEAN_TICKS[3].ask);
  assert.ok(gridQuote().quote);
}

function checkMinSize() {
  for (const inv of [-1000, -200, 0, 200, 900, 1000]) {
    const s = inventorySizes(inv);
    assert.ok(s.bid >= 200, `bid ${s.bid} < 200 at inv ${inv}`);
    assert.ok(s.ask >= 200, `ask ${s.ask} < 200 at inv ${inv}`);
  }
  assert.notEqual(inventorySizes(1000).bid, 50);
}

function checkLedger() {
  const led = new Ledger(MOCK_SPEC);
  led.open(1_000_000_000n);
  const start = led.cash;
  const px = 5_000_000n;
  const lots = MOCK_SPEC.minSize;
  const key = "0xabc:0:1";
  assert.equal(led.fill({ fillKey: key, side: "bid", price: px, lots, feeBps: 10n }), true);
  assert.equal(led.inventory, lots);
  assert.ok(led.fees > 0n);
  assert.equal(led.cash, start - (px * lots) / MOCK_SPEC.sizePrecision - led.fees);
  assert.equal(led.inventoryFromFills(), lots);
  assert.equal(led.fill({ fillKey: key, side: "bid", price: px, lots, feeBps: 10n }), false);
  assert.equal(led.inventory, lots);
  led.chargeGas(20_000n);
  led.chargeJev(1_000n);
  assert.equal(led.gas, 20_000n);
  assert.equal(led.jev, 1_000n);
  const inv = led.quoteInvariant(start);
  assert.ok(inv.ok, `quote ${inv.actual} != ${inv.expected}`);
}

function checkUnknownOrder() {
  const sm = new OrderMachine(MOCK_SPEC);
  const a = sm.persist("bid", 5_000_000n, MOCK_SPEC.minSize, 1);
  sm.markUnknown(a.intentId);
  assert.equal(sm.query(a.intentId).status, "unknown");
  assert.equal(sm.query(a.intentId).intentId, a.intentId);
  const b = sm.persist("ask", 5_000_100n, MOCK_SPEC.minSize, 1);
  assert.notEqual(b.intentId, a.intentId);
  assert.equal(sm.query(a.intentId).intentId, a.intentId);
  assert.throws(() => sm.query("no-such-id"));
  sm.resolveUnknown(a.intentId, "failed", { reason: "query_failed" });
  assert.equal(sm.get(a.intentId)?.status, "failed");
}

function checkPostOnlyRevert() {
  const book = bookAt(5_000_000n, 10);
  const paper = new PaperBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  const cross = paper.applyDesired(
    book,
    OK_HEALTH,
    { bidInsideTicks: 20, askInsideTicks: 20, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  assert.ok(cross.postOnlyReverts >= 1);
  assert.ok(!paper.resting.bid && !paper.resting.ask);
  const sm = new OrderMachine(MOCK_SPEC);
  const intent = sm.persist("bid", book.ask, MOCK_SPEC.minSize, book.block);
  const r = sm.submitPaper(intent.intentId, book.bid, book.ask, book.block, "v1");
  assert.equal(r.intent.status, "failed");
  assert.equal(r.intent.failReason, "post_only_revert");
  assert.equal(r.intentId, intent.intentId);
}

function checkIdempotentFills() {
  const book = bookAt(5_000_000n, 20);
  const paper = new PaperBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  paper.applyDesired(
    book,
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  assert.ok(paper.resting.bid);
  const p = throughPrint(book, "bid");
  assert.ok(tradesThrough("bid", paper.resting.bid!.price, p, MOCK_SPEC));
  paper.onBook(book, [p, p], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 1);
  assert.equal(paper.ledger.inventory, MOCK_SPEC.minSize);
  paper.onBook(book, [p], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 1);
}

function checkRestart() {
  const book = bookAt(5_000_000n, 30);
  const opts = paperOptions(MOCK_SPEC, true);
  const paper = new PaperBook("t", MOCK_SPEC, opts);
  paper.applyDesired(
    book,
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  const p = throughPrint(book, "bid");
  paper.onBook(book, [p], { oneS: 1, sixS: 2, horizon: 3 });
  const inv = paper.ledger.inventory;
  const snap = paper.serialize();
  const recovered = PaperBook.recover("t", MOCK_SPEC, opts, snap);
  assert.ok(!recovered.resting.bid && !recovered.resting.ask);
  recovered.onBook(book, [p], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(recovered.ledger.inventory, inv);
}

function checkJevLateDoesNotPullGrid() {
  const book = bookAt(5_000_000n, 40);
  const grid = new MakerBook("grid", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  const composer = new MakerBook("mock", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  grid.applyIntent(book, gridQuote(), undefined, false);
  composer.applyIntent(book, composeQuotes(baseJudgments(), 0, false), baseJudgments(), false);
  assert.ok(grid.paper.resting.bid || grid.paper.resting.ask);
  composer.noteLate();
  assert.ok(grid.paper.resting.bid || grid.paper.resting.ask);
  assert.ok(!composer.paper.resting.bid && !composer.paper.resting.ask);
}

function checkFailClosedAndKill() {
  const empty = assessHealth({
    spec: MOCK_SPEC,
    book: { ...bookAt(5_000_000n, 1), levels: { bids: [], asks: [] } },
    nowMs: Date.now(),
    marketState: "ACTIVE",
    limits: { staleBookMs: 2000, staleBookBlocks: 8 },
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "empty_book");

  const stale = assessHealth({
    spec: MOCK_SPEC,
    book: bookAt(5_000_000n, 1, Date.now() - 10_000),
    nowMs: Date.now(),
    marketState: "ACTIVE",
    limits: { staleBookMs: 2000, staleBookBlocks: 8 },
  });
  assert.equal(stale.reason, "stale_book");

  const paused = assessHealth({
    spec: MOCK_SPEC,
    book: bookAt(5_000_000n, 1),
    nowMs: Date.now(),
    marketState: "SOFT_PAUSED",
    limits: { staleBookMs: 2000, staleBookBlocks: 8 },
  });
  assert.equal(paused.reason, "SOFT_PAUSED");

  const unread = assessHealth({
    spec: MOCK_SPEC,
    book: bookAt(5_000_000n, 1),
    nowMs: Date.now(),
    marketState: "UNKNOWN",
    limits: { staleBookMs: 2000, staleBookBlocks: 8 },
  });
  assert.equal(unread.ok, false);
  assert.equal(unread.reason, "UNKNOWN");
  assert.equal(liveAbiMarketState(), "UNKNOWN");
  assert.equal(emptyBook(1).levels.bids.length, 0);

  const mk = new MakerBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  mk.applyIntent(bookAt(5_000_000n, 50), gridQuote());
  mk.paperKill("test");
  assert.equal(mk.paper.kill.killed, true);
  assert.ok(!mk.paper.resting.bid && !mk.paper.resting.ask);
  mk.applyIntent(bookAt(5_000_000n, 51), gridQuote());
  assert.ok(!mk.paper.resting.bid && !mk.paper.resting.ask);
}

async function checkRunnerLateIsolation() {
  const model = new MockModel();
  const run = createRun(model.name, [], MOCK_SPEC, true);
  const tape = new Tape();
  const mids: number[] = [];
  const inFlight = { current: null as Promise<void> | null, deciding: false };
  const first = mockTape(4).next().value!;
  await stepHead(run, first, tape, mids, { composer: model }, { decide: true, awaitDecide: true, inFlight, marketState: "ACTIVE" });
  assert.ok(run.grid.paper.resting.bid || run.grid.paper.resting.ask, "grid should rest");
  const gridBid = run.grid.paper.resting.bid?.price;
  inFlight.deciding = true;
  const second = mockTape(1, first.book.block + 1).next().value!;
  await stepHead(run, second, tape, mids, { composer: model }, { decide: true, awaitDecide: false, inFlight, marketState: "ACTIVE" });
  assert.equal(run.grid.paper.resting.bid?.price, gridBid);
  assert.ok(run.books[1]!.paper.resting.bid || run.books[1]!.paper.resting.ask, "inventory must stay up when Jev is late");
  assert.ok(run.composer.skips.late >= 1);
}

async function checkRunner() {
  const model = new MockModel();
  const run = createRun(model.name, [], MOCK_SPEC, true);
  const tape = new Tape();
  const mids: number[] = [];
  const inFlight = { current: null as Promise<void> | null, deciding: false };
  let i = 0;
  for (const snap of mockTape(48)) {
    const decide = i % config.decisionEveryBlocks === 0;
    i++;
    await stepHead(run, snap, tape, mids, { composer: model }, { decide, awaitDecide: true, inFlight, marketState: "ACTIVE" });
  }
  const grid = run.grid.snapshot();
  const composer = run.composer.snapshot();
  assert.ok(grid.decisionSlots > 0);
  assert.ok(composer.skips.regime_low_conf + composer.skips.quote_ok + composer.skips.toxic + composer.quotedSlots > 0);
  console.log(run.report());
}

function checkDirection() {
  const dir = new DirectionBoard();
  dir.decide(1, 0.05, "buy");
  dir.decide(2, 0.05, "sell");
  assert.equal(dir.skippedOverlap, 1);
  const [lo, hi] = wilson(8, 20);
  assert.ok(lo < hi);
}

function checkShadowBook() {
  const book = bookAt(5_000_000n, 80);
  const paper = new MakerBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  const shadow = new ShadowBook("grid");
  paper.applyIntent(book, gridQuote());
  const inv0 = paper.paper.ledger.inventory;
  shadow.lockFromRest(book, paper.paper.resting.bid, paper.paper.resting.ask);
  assert.ok(shadow.quotes.length >= 1);
  const later = bookAt(5_000_000n, 81);
  const touch: Print = {
    block: 81,
    price: paper.paper.resting.bid!.price,
    size: MOCK_SPEC.minSize,
    takerBuy: false,
    txhash: "0xtouch",
    logIndex: 0,
    orderId: "9",
  };
  shadow.onPrints([touch], MOCK_SPEC);
  assert.equal(shadow.hits.length, 0, "touch is not a shadow fill");
  const thru = throughPrint(later, "bid");
  shadow.onPrints([thru], MOCK_SPEC);
  assert.equal(shadow.hits.length, 1);
  assert.equal(paper.paper.ledger.inventory, inv0, "shadow must not write the ledger");
  shadow.onPrints([thru], MOCK_SPEC);
  assert.equal(shadow.hits.length, 1);
}

async function checkUglyReplay() {
  const built = buildUglyDayFile();
  const filed = loadUglyDayFile();
  const st = uglyDayStats(filed);
  assert.equal(filed.name, built.name);
  assert.equal(filed.events.length, built.events.length);
  assert.ok(st.holes >= 1);
  assert.ok(st.heads >= 200, `heads ${st.heads} — 24-head 1-decide is not a holdout`);
  assert.ok(st.prints > 0 && st.prints <= st.heads, "prints are explicit on heads; dead/hole invent none");
  assert.ok(Math.floor(st.heads / UGLY_DECISION_EVERY) >= HOLDOUT_MIN_DECISIONS);
  const hole = filed.events.find((e) => e.type === "hole");
  assert.ok(hole && hole.type === "hole");
  assert.equal("prints" in hole, false);

  const result = await replayUglyDay(new MockModel());
  assert.equal(result.holes, 1);
  assert.equal(result.heads, st.heads);
  assert.ok(result.elapsedMs < st.heads * config.blockMs, "faster than live block time");
  const grid = result.run.grid.snapshot();
  const composer = result.run.composer.snapshot();
  assert.ok(Number.isFinite(grid.net2x) && Number.isFinite(grid.net3x));
  assert.ok(composer.decisionSlots >= HOLDOUT_MIN_DECISIONS, `decides ${composer.decisionSlots}`);
  assert.ok(result.run.health.reason !== "stale_book", "replay must not fail-closed as stale from wall-clock Jev latency");
  assert.ok(result.report.includes("net2x="));
  assert.ok(result.report.includes("net3x="));
  assert.ok(result.report.includes("shadow grid:"));
  assert.ok(result.report.includes("kill tape-Jev") || result.report.includes("keep iterating"));
  assert.ok(result.run.shadowGrid.quotes.length >= 1);
  assert.ok(result.run.shadowGrid.hits.length >= 1);
}

function checkSpecAndMinSizeLots() {
  assert.equal(lotsToMon(VENUE_MON_USDC.minSize, VENUE_MON_USDC), 200n);
  assert.equal(VENUE_MON_USDC.makerFeeBps, 0n);
  assert.equal(VENUE_MON_USDC.takerFeeBps, 0n);
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  persistSpec(VENUE_MON_USDC, dir);
  const row = JSON.parse(readFileSync(join(dir, "market-spec.json"), "utf8"));
  assert.equal(row.minSize, VENUE_MON_USDC.minSize.toString());
  assert.equal(row.tickSize, VENUE_MON_USDC.tickSize.toString());
  assert.equal(row.pricePrecision, VENUE_MON_USDC.pricePrecision.toString());
}

function checkPartials() {
  const book = bookAt(5_000_000n, 60);
  const paper = new PaperBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  const two = MOCK_SPEC.minSize * 2n;
  paper.applyDesired(
    book,
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: two, askLots: two },
    Date.now(),
    0,
  );
  const half: Print = { ...throughPrint(book, "bid", MOCK_SPEC.minSize), txhash: "0xpart1", logIndex: 0, orderId: "1" };
  paper.onBook(book, [half], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 1);
  assert.equal(paper.resting.bid?.size, MOCK_SPEC.minSize);
  const rest = paper.orders.get(paper.resting.bid!.intentId)!;
  assert.equal(rest.filled, MOCK_SPEC.minSize);
  assert.equal(rest.remaining, MOCK_SPEC.minSize);
  const rest2: Print = { ...throughPrint(book, "bid", MOCK_SPEC.minSize), txhash: "0xpart2", logIndex: 1, orderId: "2" };
  paper.onBook(book, [rest2], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 2);
  assert.ok(!paper.resting.bid);
}

function checkInclusionDelay() {
  const book = bookAt(5_000_000n, 70);
  const opts = { ...paperOptions(MOCK_SPEC, true), inclusionDelayBlocks: 2 };
  const paper = new PaperBook("t", MOCK_SPEC, opts);
  paper.applyDesired(
    book,
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  const early = { ...throughPrint(book, "bid"), block: book.block };
  paper.onBook(book, [early], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 0);
  const laterBook = bookAt(5_000_000n, 72);
  const late = { ...throughPrint(laterBook, "bid"), block: 72, txhash: "0xdelay" };
  paper.onBook(laterBook, [late], { oneS: 1, sixS: 2, horizon: 3 });
  assert.equal(paper.fills, 1);
}

function checkMarkNotMid() {
  const bid = 5_000_000n;
  const ask = 5_001_600n;
  const mid = (bid + ask) / 2n;
  const lots = MOCK_SPEC.minSize;
  const marked = markInventory(lots, bid, ask, MOCK_SPEC);
  assert.equal(marked, notional(bid, lots, MOCK_SPEC));
  assert.notEqual(marked, notional(mid, lots, MOCK_SPEC));
  const mo = adverseMarkout("bid", bid, lots, bid - MOCK_SPEC.tickSize, ask, MOCK_SPEC);
  const midMo = notional(bid, lots, MOCK_SPEC) - notional(mid, lots, MOCK_SPEC);
  assert.notEqual(mo, midMo);
}

function checkCostAlwaysOn() {
  const paper = new PaperBook("t", MOCK_SPEC, paperOptions(MOCK_SPEC, true));
  paper.applyDesired(
    bookAt(5_000_000n, 1),
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  const c = deskCost({
    spec: MOCK_SPEC,
    ledger: paper.ledger,
    spreadCash: 0n,
    markoutCash: 0n,
    fillLots: 0n,
    cfg: {
      adverseTicks: paper.opts.adverseTicks,
      gasUsdPerReplace: paper.opts.gasUsdPerReplace,
      gasSource: paper.opts.gasSource,
      gasUnitsPerReplace: paper.opts.gasUnitsPerReplace,
    },
  });
  assert.ok(c.gasUsd > 0n);
  assert.equal(c.net2x, c.spreadUsd - c.costUsd * 2n);
  assert.equal(c.net3x, c.spreadUsd - c.costUsd * 3n);
}

function checkTouchIsNotFill() {
  const rest = 5_000_000n;
  const touch: Print = {
    block: 1,
    price: rest,
    size: MOCK_SPEC.minSize,
    takerBuy: false,
    txhash: "0xtouch",
    logIndex: 0,
    orderId: "1",
  };
  assert.equal(tradesThrough("bid", rest, touch, MOCK_SPEC), false);
  const thru: Print = { ...touch, price: rest - MOCK_SPEC.tickSize };
  assert.equal(tradesThrough("bid", rest, thru, MOCK_SPEC), true);
}

function checkDailyLossAndDeadMan() {
  assert.equal(dailyLossBreached(-25n * USD_MICROS, 25n * USD_MICROS), true);
  assert.equal(dailyLossBreached(-1n, 0n), false);
  const opts = { ...paperOptions(MOCK_SPEC, true), dailyLossUsd: 1n };
  const paper = new PaperBook("t", MOCK_SPEC, opts);
  paper.applyDesired(
    bookAt(5_000_000n, 90),
    OK_HEALTH,
    { bidInsideTicks: 0, askInsideTicks: 0, bidLots: MOCK_SPEC.minSize, askLots: MOCK_SPEC.minSize },
    Date.now(),
    0,
  );
  assert.equal(paper.kill.killed, true);
  assert.equal(paper.kill.reason, "daily_loss");

  const dm = new DeadMan(5, 1000);
  assert.equal(dm.expired(1005), false);
  assert.equal(dm.expired(1006), true);
  dm.beat(1006);
  assert.equal(dm.expired(1010), false);
}

function checkSingleWriter() {
  const w = new SingleWriter();
  w.run(() => {
    assert.throws(() => w.run(() => 1));
  });
}

function checkPaperOnlySources() {
  const root = dirname(fileURLToPath(import.meta.url));
  for (const file of ["cli.ts", "range.ts", "rangeModel.ts", "rangeRunner.ts", "desk.ts", "paper.ts"]) {
    const src = readFileSync(join(root, file), "utf8");
    assert.equal(src.includes("PRIVATE_KEY"), false, file);
    assert.equal(/new ethers\.Wallet/.test(src), false, file);
    assert.equal(src.includes("addBuyOrder"), false, file);
    assert.equal(src.includes("addSellOrder"), false, file);
  }
}

function rangeJudgment(over: Partial<{ choice: "nothing_burger" | "range_breaker"; confidence: number }> = {}) {
  const choice = over.choice ?? "nothing_burger";
  const confidence = over.confidence ?? 0.9;
  return {
    name: "mock",
    read: {
      choice,
      confidence,
      probabilities: {
        nothing_burger: choice === "nothing_burger" ? confidence : 1 - confidence,
        range_breaker: choice === "range_breaker" ? confidence : 1 - confidence,
      },
    },
    latencyMs: 5,
    inputTokens: 0,
  };
}

function checkRangeBandAndStop() {
  const spec = MOCK_SPEC;
  const params = rangeParams(spec, { lookback: 16, shortLookback: 4, minWidthTicks: 4n, horizonBlocks: 8 });
  const tick = spec.tickSize;
  const base = 5_000_000n;
  const chop: bigint[] = [];
  for (let i = 0; i < 16; i++) chop.push(base + BigInt((i % 5) - 2) * tick * 2n);
  const live = computeBand(chop, params);
  assert.ok(live);
  assert.ok(live.width >= 4n * tick);
  assert.equal(bandStatus(live, spec, params), "ok");
  assert.ok(live.low % tick === 0n);
  assert.ok(live.high % tick === 0n);

  const flat = computeBand(Array.from({ length: 16 }, () => base), params);
  assert.equal(bandStatus(flat, spec, params), "dead");

  const quiet = Array.from({ length: 16 }, () => base);
  const spike = [...quiet.slice(0, 12), base + 80n * tick, base + 160n * tick, base + 240n * tick, base + 320n * tick];
  const exploded = computeBand(spike, params);
  assert.equal(bandStatus(exploded, spec, params), "expanded");

  const deadTape = bandStatus(live, spec, params, { flow: "dead", lastSide: "none", cvdAgreesWithLastMove: false, activity: "no recent prints" });
  assert.equal(deadTape, "dead");

  const lowBand = computeBand(
    Array.from({ length: 16 }, (_, i) => base + BigInt(i) * tick),
    params,
  )!;
  const highMid = { ...lowBand, last: lowBand.high };
  const lowMid = { ...lowBand, last: lowBand.low };
  assert.equal(fadeSide(highMid, spec, params), "sell");
  assert.equal(fadeSide(lowMid, spec, params), "buy");

  const book = bookAt(lowBand.last, 10);
  const buyPlan = planLevels("buy", { ...lowBand, last: lowBand.low }, bookAt(lowBand.low, 10), spec, params);
  if (buyPlan) {
    assert.ok(buyPlan.tp > lowBand.low && buyPlan.tp < lowBand.high, "tp inside band");
    assert.ok(buyPlan.stop < lowBand.low, "stop beyond band");
    assert.equal(buyPlan.tp % tick, 0n);
    assert.equal(buyPlan.stop % tick, 0n);
  }

  const lots = params.clipLots;
  assert.ok(lots >= spec.minSize);
  assert.equal(lotsToMon(lots, spec) >= 200n, true);

  const trader = new RangeBook("fade", spec, params, paperOptions(spec, true), "fade");
  const entryBook = bookAt(lowBand.low, 20);
  const intent = composeRange({
    mode: "fade",
    status: "ok",
    band: { ...lowBand, last: lowBand.low },
    book: entryBook,
    spec,
    params,
    open: false,
    block: entryBook.block,
    nextOkBlock: 0,
    late: false,
    healthy: true,
  });
  trader.onHead(entryBook, []);
  trader.applyDecision(entryBook, intent);
  if (intent.act) {
    assert.equal(trader.entries, 1);
    assert.ok(trader.open);
    const stopBook = bookAt(intent.stop! - 8n * tick, 21);
    const thru: Print = {
      block: 21,
      price: intent.stop! - tick,
      size: spec.minSize,
      takerBuy: false,
      txhash: "0xstop",
      logIndex: 0,
      orderId: "1",
    };
    assert.equal(exitHit(trader.open, stopBook, [thru]), "stop");
    trader.onHead(stopBook, [thru]);
    assert.equal(trader.open, undefined);
    assert.equal(trader.stops, 1);
    assert.equal(trader.exits, 1);
    assert.equal(trader.ledger.inventory, 0n);
  } else {
    const forced = new RangeBook("fade", spec, params, paperOptions(spec, true), "fade");
    const wide: bigint[] = [];
    for (let i = 0; i < 16; i++) wide.push(base + BigInt(i) * 3n * tick);
    const band = computeBand(wide, params)!;
    const dip = bookAt(band.low, 30);
    const buy = composeRange({
      mode: "fade",
      status: "ok",
      band: { ...band, last: band.low },
      book: dip,
      spec,
      params,
      open: false,
      block: 30,
      nextOkBlock: 0,
      late: false,
      healthy: true,
    });
    assert.equal(buy.act, true, "wide band should allow a fade");
    forced.onHead(dip, []);
    forced.applyDecision(dip, buy);
    assert.equal(forced.entries, 1);
    forced.applyDecision(dip, buy);
    assert.equal(forced.entries, 1, "one position; no overlapping spam");
    assert.equal(forced.skips.open >= 1 || forced.ledger.inventory === params.clipLots, true);
    const stopBook = assembleBook(
      31,
      buy.stop! - tick,
      buy.stop! + 8n * tick,
      [[buy.stop! - tick, spec.minSize]],
      [[buy.stop! + 8n * tick, spec.minSize]],
      spec,
      Date.now(),
    );
    forced.onHead(stopBook, []);
    assert.equal(forced.open, undefined);
    assert.ok(forced.stops >= 1);
    assert.equal(forced.ledger.inventory, 0n);
  }

  const roomBand: StatisticalBand = {
    low: base,
    high: base + 50n * tick,
    width: 50n * tick,
    atr: 3n * tick,
    shortAtr: 3n * tick,
    last: base,
    samples: 16,
  };
  const roomBook = bookAt(base, 40);
  const fadeOk = composeRange({
    mode: "fade",
    status: "ok",
    band: roomBand,
    book: roomBook,
    spec,
    params,
    open: false,
    block: 40,
    nextOkBlock: 0,
    late: false,
    healthy: true,
  });
  assert.equal(fadeOk.act, true, "wide dip should be a code candidate");

  const low = composeRange({
    mode: "jev",
    status: "ok",
    band: roomBand,
    book: roomBook,
    spec,
    params,
    open: false,
    block: 40,
    nextOkBlock: 0,
    late: false,
    healthy: true,
    judgment: rangeJudgment({ choice: "nothing_burger", confidence: 0.4 }),
  });
  assert.equal(low.act, false);
  assert.equal(low.skipReason, "low_conf");

  const breaker = composeRange({
    mode: "jev",
    status: "ok",
    band: roomBand,
    book: roomBook,
    spec,
    params,
    open: false,
    block: 41,
    nextOkBlock: 0,
    late: false,
    healthy: true,
    judgment: rangeJudgment({ choice: "range_breaker", confidence: 0.95 }),
  });
  assert.equal(breaker.act, false);
  assert.equal(breaker.skipReason, "range_breaker");

  const highConf = composeRange({
    mode: "jev",
    status: "ok",
    band: roomBand,
    book: roomBook,
    spec,
    params,
    open: false,
    block: 42,
    nextOkBlock: 0,
    late: false,
    healthy: true,
    judgment: rangeJudgment({ choice: "nothing_burger", confidence: 0.9 }),
  });
  assert.equal(highConf.act, true);
  assert.equal(highConf.side, "buy");

  const gated = new RangeBook("jev", spec, params, paperOptions(spec, true), "jev");
  gated.onHead(roomBook, []);
  gated.applyDecision(roomBook, low, rangeJudgment({ choice: "nothing_burger", confidence: 0.4 }));
  assert.equal(gated.entries, 0);
  assert.equal(gated.ledger.inventory, 0n);
  assert.equal(gated.skips.low_conf, 1);

  const sit = composeRange({
    mode: "sit",
    status: "ok",
    band: { ...lowBand, last: lowBand.low },
    book,
    spec,
    params,
    open: false,
    block: 1,
    nextOkBlock: 0,
    late: false,
    healthy: true,
  });
  assert.equal(sit.act, false);
  assert.equal(sit.skipReason, "sit");
}

async function checkRangeReplay() {
  const result = await replayRangeUglyDay(new MockRangeModel());
  assert.ok(result.heads >= 200);
  assert.equal(result.holes, 1);
  const sit = result.run.sit.snapshot();
  const fade = result.run.fade.snapshot();
  const jev = result.run.composer.snapshot();
  assert.equal(sit.entries, 0);
  assert.ok(Number.isFinite(sit.pnlUsd) && sit.pnlUsd === 0);
  assert.ok(Number.isFinite(fade.pnlUsd) && Number.isFinite(jev.pnlUsd));
  assert.ok(fade.decisionSlots >= 1 && jev.decisionSlots >= 1);
  assert.ok(result.report.includes("sit:"));
  assert.ok(result.report.includes("fade:"));
  assert.ok(result.report.includes("Do not size"));
  assert.ok(result.run.sit.params.clipLots >= MOCK_SPEC.minSize);
}

async function checkUnknownDefaultFailClosed() {
  const model = new MockModel();
  const run = createRun(model.name, [], MOCK_SPEC, true);
  const tape = new Tape();
  const mids: number[] = [];
  const inFlight = { current: null as Promise<void> | null, deciding: false };
  const first = mockTape(1).next().value!;
  await stepHead(run, first, tape, mids, { composer: model }, { decide: true, awaitDecide: true, inFlight });
  assert.equal(run.health.reason, "UNKNOWN");
  assert.ok(!run.grid.paper.resting.bid && !run.grid.paper.resting.ask);
  assert.equal(run.composer.decisionSlots, 0);
}

async function checkDeadManKills() {
  const model = new MockModel();
  const run = createRun(model.name, [], MOCK_SPEC, true);
  run.deadMan = new DeadMan(5, 1000);
  const tape = new Tape();
  const first = mockTape(1).next().value!;
  await stepHead(run, first, tape, [], { composer: model }, {
    decide: true,
    awaitDecide: true,
    inFlight: { current: null, deciding: false },
    marketState: "ACTIVE",
    nowMs: 1006,
  });
  assert.equal(run.grid.paper.kill.killed, true);
  assert.equal(run.grid.paper.kill.reason, "dead_man");
}

async function main() {
  checkTradeDecode();
  checkBuckets();
  checkCompose();
  checkMinSize();
  checkSpecAndMinSizeLots();
  checkLedger();
  checkUnknownOrder();
  checkPostOnlyRevert();
  checkIdempotentFills();
  checkPartials();
  checkInclusionDelay();
  checkMarkNotMid();
  checkCostAlwaysOn();
  checkTouchIsNotFill();
  checkRestart();
  checkJevLateDoesNotPullGrid();
  checkFailClosedAndKill();
  checkDailyLossAndDeadMan();
  checkSingleWriter();
  checkPaperOnlySources();
  checkRangeBandAndStop();
  checkDirection();
  checkShadowBook();
  await checkUnknownDefaultFailClosed();
  await checkDeadManKills();
  await checkUglyReplay();
  await checkRangeReplay();
  await checkRunnerLateIsolation();
  await checkRunner();
  console.log("selfcheck ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
