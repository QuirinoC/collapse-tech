import { config } from "./config.js";
import type { Book } from "./book.js";
import { paperOptions, resetEvents, writeEvent } from "./desk.js";
import { assessHealth, type Health, type MarketState } from "./health.js";
import { mockTape } from "./mockTape.js";
import {
  bandStatus,
  composeRange,
  computeBand,
  formatRange,
  rangeCompareLine,
  rangeParams,
  RangeBook,
  type RangeParams,
  type RangeSnapshot,
} from "./range.js";
import { buildRangeState, type RangeModel } from "./rangeModel.js";
import { DeadMan } from "./risk.js";
import { MOCK_SPEC, type MarketSpec } from "./spec.js";
import { Tape, type Print } from "./tape.js";
import {
  kuruFixturePath,
  loadUglyDayFile,
  materializeUglyDay,
  uglyDayReplay,
  uglyDayStats,
  UGLY_DECISION_EVERY,
  type ReplayEvent,
} from "./uglyDay.js";

export interface RangeRun {
  spec: MarketSpec;
  params: RangeParams;
  sit: RangeBook;
  fade: RangeBook;
  composer: RangeBook;
  books: RangeBook[];
  health: Health;
  deadMan: DeadMan;
  report(): string;
  snapshots(): RangeSnapshot[];
}

export interface RangeReplayResult {
  run: RangeRun;
  heads: number;
  holes: number;
  elapsedMs: number;
  report: string;
}

export function createRangeRun(composerName: string, spec: MarketSpec = MOCK_SPEC, testFast = false): RangeRun {
  const opts = paperOptions(spec, testFast);
  const params = rangeParams(spec);
  const sit = new RangeBook("sit", spec, params, opts, "sit");
  const fade = new RangeBook("fade", spec, params, opts, "fade");
  const composer = new RangeBook(composerName, spec, params, opts, "jev");
  const books = [sit, fade, composer];
  return {
    spec,
    params,
    sit,
    fade,
    composer,
    books,
    health: { ok: false, reason: "UNKNOWN", marketState: "UNKNOWN", detail: "not polled" },
    deadMan: new DeadMan(config.deadManMs),
    snapshots: () => books.map((b) => b.snapshot()),
    report() {
      const [s, f, j] = books.map((b) => b.snapshot());
      return [formatRange(s!), formatRange(f!), formatRange(j!), rangeCompareLine(s!, f!, j!)].join("\n");
    },
  };
}

export async function stepRangeHead(
  run: RangeRun,
  snap: { book: Book; prints: Print[] },
  tape: Tape,
  mids: PxList,
  model: RangeModel,
  opts: {
    decide: boolean;
    nowMs?: number;
    marketState?: MarketState;
    rpcError?: string;
    chainHead?: number;
  },
) {
  const { book, prints } = snap;
  const nowMs = opts.nowMs ?? Date.now();
  if (run.deadMan.expired(nowMs)) {
    for (const b of run.books) b.paperKill("dead_man", book);
    run.health = { ok: false, reason: "dead_man", marketState: opts.marketState ?? "UNKNOWN", detail: "dead-man timeout" };
    writeEvent({ block: book.block, health: "dead_man", mode: "range" });
    return;
  }
  if (!opts.rpcError) run.deadMan.beat(nowMs);

  const health = assessHealth({
    spec: run.spec,
    book,
    chainHead: opts.chainHead ?? book.block,
    nowMs,
    marketState: opts.marketState ?? "UNKNOWN",
    rpcError: opts.rpcError,
    limits: { staleBookMs: config.staleBookMs, staleBookBlocks: config.staleBookBlocks },
  });
  run.health = health;

  if (!health.ok) {
    writeEvent({ block: book.block, health: health.reason, mode: "range", prints: prints.length });
    return;
  }

  mids.push(book.mid);
  if (mids.length > Math.max(400, run.params.lookback * 2)) mids.splice(0, mids.length - run.params.lookback * 2);
  tape.ingest(prints, mids.length > 1 ? mids[mids.length - 2]! : book.mid, book.mid);

  for (const b of run.books) b.onHead(book, prints);

  if (!opts.decide) {
    writeEvent({ block: book.block, mid: book.mid.toString(), prints: prints.length, mode: "range" });
    return;
  }

  const tapeStats = tape.stats();
  const band = computeBand(mids, run.params);
  const status = bandStatus(band, run.spec, run.params, tapeStats);
  const base = {
    status,
    band,
    book,
    spec: run.spec,
    params: run.params,
    block: book.block,
    late: false,
    killed: false,
    healthy: true,
  };

  run.sit.applyDecision(book, composeRange({ ...base, mode: "sit", open: Boolean(run.sit.open), nextOkBlock: run.sit.nextOkBlock }));
  run.fade.applyDecision(book, composeRange({ ...base, mode: "fade", open: Boolean(run.fade.open), nextOkBlock: run.fade.nextOkBlock }));

  const candidate = composeRange({
    ...base,
    mode: "fade",
    open: Boolean(run.composer.open),
    nextOkBlock: run.composer.nextOkBlock,
  });
  if (!candidate.act) {
    run.composer.applyDecision(book, composeRange({ ...base, mode: "jev", open: Boolean(run.composer.open), nextOkBlock: run.composer.nextOkBlock }));
    writeEvent({ block: book.block, mode: "range", skip: candidate.skipReason, status });
    return;
  }

  try {
    const headline = config.headline || undefined;
    const j = await model.decide(buildRangeState(tapeStats, headline));
    const late = j.latencyMs > config.blockBudgetMs;
    const intent = composeRange({
      ...base,
      mode: "jev",
      open: Boolean(run.composer.open),
      nextOkBlock: run.composer.nextOkBlock,
      late,
      judgment: j,
    });
    run.composer.applyDecision(book, intent, j);
    writeEvent({
      block: book.block,
      mode: "range",
      status,
      side: intent.side,
      act: intent.act,
      skip: intent.skipReason,
      read: j.read,
      late,
    });
  } catch (e) {
    console.error(`range decide ${book.block}:`, (e as Error).message);
    run.composer.applyDecision(
      book,
      composeRange({
        ...base,
        mode: "jev",
        open: Boolean(run.composer.open),
        nextOkBlock: run.composer.nextOkBlock,
        late: true,
      }),
    );
  }
}

type PxList = bigint[];

export async function replayRangeEvents(
  events: ReplayEvent[],
  model: RangeModel,
  testFast = true,
  decisionEvery = config.decisionEveryBlocks,
  decideBy: "index" | "block" = "index",
): Promise<RangeReplayResult> {
  resetEvents();
  const run = createRangeRun(model.name, MOCK_SPEC, testFast);
  const tape = new Tape();
  const mids: PxList = [];
  let heads = 0;
  let holes = 0;
  let i = 0;
  let nextDecideBlock = -1;
  const t0 = performance.now();
  for (const ev of events) {
    if (ev.type === "hole") {
      holes += 1;
      await stepRangeHead(
        run,
        { book: evDummy(ev.fromBlock), prints: [] },
        tape,
        mids,
        model,
        { decide: false, chainHead: ev.chainHead, rpcError: `range-hole ${ev.reason} ${ev.fromBlock}-${ev.toBlock}` },
      );
      continue;
    }
    let decide = false;
    if (decideBy === "block") {
      decide = nextDecideBlock < 0 || ev.book.block >= nextDecideBlock;
      if (decide) nextDecideBlock = ev.book.block + decisionEvery;
    } else {
      decide = i % decisionEvery === 0;
    }
    i += 1;
    heads += 1;
    await stepRangeHead(run, { book: { ...ev.book, recvMs: Date.now() }, prints: ev.prints }, tape, mids, model, {
      decide,
      chainHead: ev.book.block,
      marketState: "ACTIVE",
    });
  }
  return { run, heads, holes, elapsedMs: performance.now() - t0, report: run.report() };
}

function evDummy(block: number): Book {
  return {
    block,
    recvMs: Date.now(),
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

export async function replayRangeUglyDay(model: RangeModel): Promise<RangeReplayResult> {
  const file = loadUglyDayFile();
  const stats = uglyDayStats(file);
  if (stats.holes < 1 || stats.heads < 2) throw new Error("ugly-day fixture missing trend or hole");
  return replayRangeEvents(uglyDayReplay(), model, true, UGLY_DECISION_EVERY);
}

export async function replayRangeKuru(model: RangeModel, path = config.replayFixture || kuruFixturePath()): Promise<RangeReplayResult> {
  const file = loadUglyDayFile(path);
  const stats = uglyDayStats(file);
  if (stats.heads < 2) throw new Error(`kuru fixture missing heads: ${path}`);
  return replayRangeEvents(materializeUglyDay(file), model, true, config.decisionEveryBlocks, "block");
}

export async function replayRangeMock(model: RangeModel, blocks = config.blocks): Promise<RangeReplayResult> {
  resetEvents();
  const run = createRangeRun(model.name, MOCK_SPEC, true);
  const tape = new Tape();
  const mids: PxList = [];
  let heads = 0;
  const t0 = performance.now();
  let i = 0;
  for (const snap of mockTape(blocks)) {
    const decide = i % config.decisionEveryBlocks === 0;
    i += 1;
    heads += 1;
    await stepRangeHead(run, snap, tape, mids, model, { decide, marketState: "ACTIVE", chainHead: snap.book.block });
  }
  return { run, heads, holes: 0, elapsedMs: performance.now() - t0, report: run.report() };
}

export async function runRangePaper(model: RangeModel) {
  if (config.tape === "live") {
    throw new Error("MODE=range is paper replay/kuru/mock only. No live send.");
  }
  console.log(
    `jev-desk paper RANGE · sit / fade / ${model.name} · tape ${config.tape} · ${config.jevModelId} · clip ${config.tradeSizeMon} MON · band is statistical not guaranteed · do not size`,
  );
  let result: RangeReplayResult;
  if (config.tape === "replay") result = await replayRangeUglyDay(model);
  else if (config.tape === "kuru") result = await replayRangeKuru(model);
  else result = await replayRangeMock(model, config.blocks);
  const label = config.tape === "replay" ? "ugly-day range" : config.tape === "kuru" ? "kuru range" : "mock range";
  console.log(`${label} ${result.heads} heads + ${result.holes} hole in ${result.elapsedMs.toFixed(0)}ms (paper only)`);
  console.log(result.report);
  console.log("events: data/events.jsonl");
}
