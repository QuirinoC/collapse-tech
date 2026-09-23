import { config } from "./config.js";
import type { Book } from "./book.js";
import { buildState } from "./buckets.js";
import { composeQuotes, gridQuote, inventoryQuote, naiveQuote } from "./compose.js";
import {
  Calibration,
  DirectionBoard,
  formatCalib,
  formatDirection,
  formatMaker,
  holdoutVerdict,
  MakerBook,
  midDisplay,
  paperOptions,
  writeEvent,
  type MakerSnapshot,
} from "./desk.js";
import { assessHealth, type Health, type MarketState } from "./health.js";
import type { Judgments, Model } from "./model.js";
import { DeadMan } from "./risk.js";
import { MOCK_SPEC, type MarketSpec } from "./spec.js";
import { Tape, type Print } from "./tape.js";
import { formatShadow, ShadowBook } from "./shadow.js";

export interface Snapshot {
  book: Book;
  prints: Print[];
}

export interface DeskRun {
  spec: MarketSpec;
  books: MakerBook[];
  composer: MakerBook;
  grid: MakerBook;
  extras: MakerBook[];
  naiveDir: DirectionBoard;
  calib: Calibration;
  health: Health;
  lastMidPx?: bigint;
  shadowGrid: ShadowBook;
  shadowComposer: ShadowBook;
  deadMan: DeadMan;
  report(): string;
  snapshots(): MakerSnapshot[];
}

export function createRun(
  composerName: string,
  extra?: { name: string; model: Model }[],
  spec: MarketSpec = MOCK_SPEC,
  testFast = false,
): DeskRun {
  const opts = paperOptions(spec, testFast);
  const grid = new MakerBook("grid", spec, opts);
  const inventory = new MakerBook("inventory", spec, opts);
  const composer = new MakerBook(composerName, spec, opts);
  const naive = new MakerBook("naive", spec, opts);
  const extras = (extra ?? []).map((e) => ({ book: new MakerBook(e.name, spec, opts), model: e.model }));
  const books = [grid, inventory, composer, naive, ...extras.map((e) => e.book)];
  const naiveDir = new DirectionBoard();
  const calib = new Calibration();
  const shadowGrid = new ShadowBook("grid");
  const shadowComposer = new ShadowBook("composer");
  return {
    spec,
    books,
    composer,
    grid,
    extras: extras.map((e) => e.book),
    naiveDir,
    calib,
    health: { ok: false, reason: "UNKNOWN", marketState: "UNKNOWN", detail: "not polled" },
    lastMidPx: undefined,
    shadowGrid,
    shadowComposer,
    deadMan: new DeadMan(config.deadManMs),
    snapshots: () => books.map((b) => b.snapshot()),
    report() {
      const lines = books.map((b) => formatMaker(b.snapshot()));
      lines.push(formatShadow(shadowGrid.snapshot()));
      lines.push(formatShadow(shadowComposer.snapshot()));
      lines.push(formatDirection("naive", naiveDir));
      lines.push(formatCalib(calib));
      lines.push(holdoutVerdict(composer.snapshot(), grid.snapshot(), calib));
      return lines.join("\n");
    },
  };
}

export function setHealth(run: DeskRun, health: Health) {
  run.health = health;
  for (const b of run.books) b.health = health;
}

export async function stepHead(
  run: DeskRun,
  snap: Snapshot,
  tape: Tape,
  mids: number[],
  models: { composer: Model; extra?: { name: string; model: Model; book: MakerBook }[] },
  opts: {
    decide: boolean;
    awaitDecide: boolean;
    inFlight: { current: Promise<void> | null; deciding: boolean };
    chainHead?: number;
    nowMs?: number;
    marketState?: MarketState;
    rpcError?: string;
  },
) {
  const { book, prints } = snap;
  const spec = run.spec;
  const nowMs = opts.nowMs ?? Date.now();
  if (run.deadMan.expired(nowMs)) {
    for (const b of run.books) b.paperKill("dead_man");
    run.shadowGrid.closeAll(book.block);
    run.shadowComposer.closeAll(book.block);
    setHealth(run, { ok: false, reason: "dead_man", marketState: opts.marketState ?? "UNKNOWN", detail: "dead-man timeout" });
    writeEvent({ block: book.block, health: "dead_man" });
    return;
  }
  if (!opts.rpcError) run.deadMan.beat(nowMs);

  const health = assessHealth({
    spec,
    book,
    chainHead: opts.chainHead ?? book.block,
    nowMs,
    marketState: opts.marketState ?? "UNKNOWN",
    rpcError: opts.rpcError,
    limits: { staleBookMs: config.staleBookMs, staleBookBlocks: config.staleBookBlocks },
  });
  setHealth(run, health);

  const mid = midDisplay(book, spec);
  tape.ingest(prints, run.lastMidPx ?? book.mid, book.mid);
  run.lastMidPx = book.mid;
  mids.push(mid);
  if (mids.length > 400) mids.shift();

  if (!health.ok) {
    for (const b of run.books) b.paper.pull(health.reason);
    run.shadowGrid.closeAll(book.block);
    run.shadowComposer.closeAll(book.block);
    writeEvent({ block: book.block, mid, health: health.reason, prints: prints.length });
    return;
  }

  for (const b of run.books) b.onBook(book, prints);
  run.naiveDir.onBook(book.block, mid);
  const drained = run.composer.resolvedToxic.splice(0);
  run.calib.onBook(book.block, mid, drained);
  run.shadowGrid.onPrints(prints, spec);
  run.shadowComposer.onPrints(prints, spec);

  if (!opts.decide) {
    writeEvent({ block: book.block, mid, spreadBps: Number(book.spreadBps), prints: prints.length });
    return;
  }

  if (opts.inFlight.deciding && !opts.awaitDecide) {
    run.composer.noteLate();
    run.books[3]?.noteLate();
    for (const e of run.extras) e.noteLate();
    syncShadows(run, book);
    writeEvent({ block: book.block, mid, late: true, gridPulled: false });
    return;
  }

  const work = async () => {
    const t0 = performance.now();
    const tapeStats = tape.stats();
    const headline = config.headline || undefined;
    const composerState = buildState(book, spec, mids, tapeStats, run.composer.inventoryMon, headline);
    try {
      const j = await models.composer.decide(composerState);
      const late = j.latencyMs > config.blockBudgetMs;
      applyAll(run, book, j, late);
      syncShadows(run, book);
      run.calib.observeRegime(book.block, mid, j.regime.choice, j.regime.confidence);

      if (models.extra) {
        await Promise.all(
          models.extra.map(async (e) => {
            const st = buildState(book, spec, mids, tapeStats, e.book.inventoryMon, headline);
            const ej = await e.model.decide(st);
            const eLate = ej.latencyMs > config.blockBudgetMs;
            e.book.applyIntent(book, composeQuotes(ej, e.book.inventoryMon, eLate), ej, eLate);
          }),
        );
      }

      writeEvent({
        block: book.block,
        mid,
        spreadBps: Number(book.spreadBps),
        loopMs: Math.round(performance.now() - t0),
        regime: j.regime,
        quoteOk: j.quoteOk,
        toxic: j.toxic,
        lean: j.lean,
        naive: j.naive,
        late,
      });
    } catch (e) {
      console.error(`decide ${book.block}:`, (e as Error).message);
      run.composer.noteLate();
      run.books[3]?.noteLate();
      for (const ex of run.extras) ex.noteLate();
    } finally {
      opts.inFlight.deciding = false;
    }
  };

  opts.inFlight.deciding = true;
  const p = work();
  opts.inFlight.current = p;
  if (opts.awaitDecide) await p;
}

function applyAll(run: DeskRun, book: Book, j: Judgments, late: boolean) {
  run.grid.applyIntent(book, gridQuote(), undefined, false);
  run.books[1]!.applyIntent(book, inventoryQuote(run.books[1]!.inventoryMon), undefined, false);
  run.composer.applyIntent(book, composeQuotes(j, run.composer.inventoryMon, late), j, late);
  run.books[3]!.applyIntent(book, naiveQuote(j, late), j, late);
  if (!late) run.naiveDir.decide(book.block, midDisplay(book, run.spec), j.naive.action);
}

function syncShadows(run: DeskRun, book: Book) {
  run.shadowGrid.lockFromRest(book, run.grid.paper.resting.bid, run.grid.paper.resting.ask);
  run.shadowComposer.lockFromRest(book, run.composer.paper.resting.bid, run.composer.paper.resting.ask);
}
