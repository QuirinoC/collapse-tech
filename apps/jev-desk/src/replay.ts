import { config } from "./config.js";
import { createRun, stepHead, type DeskRun } from "./runner.js";
import { MockModel, type Model } from "./model.js";
import { MOCK_SPEC } from "./spec.js";
import { Tape } from "./tape.js";
import { assembleBook } from "./book.js";
import {
  UGLY_DECISION_EVERY,
  uglyDayReplay,
  uglyDayStats,
  loadUglyDayFile,
  materializeUglyDay,
  kuruFixturePath,
  type ReplayEvent,
} from "./uglyDay.js";

export interface ReplayResult {
  run: DeskRun;
  heads: number;
  holes: number;
  holeSteps: number;
  elapsedMs: number;
  report: string;
}

function dummyBook(block: number) {
  const mid = 5_000_000n;
  const half = 8n * MOCK_SPEC.tickSize;
  return assembleBook(block, mid - half, mid + half, [[mid - half, MOCK_SPEC.minSize]], [[mid + half, MOCK_SPEC.minSize]], MOCK_SPEC, Date.now());
}

/** Faster-than-live: no poll sleep. Cost function stays on in the paper books. */
export async function replayEvents(
  events: ReplayEvent[],
  model: Model = new MockModel(),
  testFast = true,
  decisionEvery = config.decisionEveryBlocks,
  decideBy: "index" | "block" = "index",
): Promise<ReplayResult> {
  const run = createRun(model.name, [], MOCK_SPEC, testFast);
  const tape = new Tape();
  const mids: number[] = [];
  const inFlight = { current: null as Promise<void> | null, deciding: false };
  let heads = 0;
  let holeSteps = 0;
  let i = 0;
  let nextDecideBlock = -1;
  const t0 = performance.now();
  for (const ev of events) {
    if (ev.type === "hole") {
      holeSteps += 1;
      await stepHead(
        run,
        { book: dummyBook(ev.fromBlock), prints: [] },
        tape,
        mids,
        { composer: model },
        {
          decide: false,
          awaitDecide: true,
          inFlight,
          chainHead: ev.chainHead,
          rpcError: `ugly-day ${ev.reason} ${ev.fromBlock}-${ev.toBlock}`,
        },
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
    await stepHead(run, { book: { ...ev.book, recvMs: Date.now() }, prints: ev.prints }, tape, mids, { composer: model }, {
      decide,
      awaitDecide: true,
      inFlight,
      chainHead: ev.book.block,
      marketState: "ACTIVE",
    });
  }
  return {
    run,
    heads,
    holes: holeSteps,
    holeSteps,
    elapsedMs: performance.now() - t0,
    report: run.report(),
  };
}

export async function replayUglyDay(model?: Model): Promise<ReplayResult> {
  const file = loadUglyDayFile();
  const stats = uglyDayStats(file);
  if (stats.holes < 1 || stats.heads < 2) throw new Error("ugly-day fixture missing trend or hole");
  return replayEvents(uglyDayReplay(), model, true, UGLY_DECISION_EVERY);
}

export async function replayKuruTape(model?: Model, path = config.replayFixture || kuruFixturePath()): Promise<ReplayResult> {
  const file = loadUglyDayFile(path);
  const stats = uglyDayStats(file);
  if (stats.heads < 2) throw new Error(`kuru fixture missing heads: ${path}`);
  return replayEvents(materializeUglyDay(file), model, true, config.decisionEveryBlocks, "block");
}
