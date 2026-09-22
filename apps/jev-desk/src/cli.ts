import { ethers } from "ethers";
import * as Kuru from "@kuru-labs/kuru-sdk";
import { config } from "./config.js";
import { readPrints, Tape, type Print } from "./tape.js";
import { readBook, rpc, type Book } from "./book.js";
import { JevModel, MockModel, type Model } from "./model.js";
import { rangeComposerModel } from "./rangeModel.js";
import { runRangePaper } from "./rangeRunner.js";
import { resetEvents } from "./desk.js";
import { mockTape } from "./mockTape.js";
import { replayKuruTape, replayUglyDay } from "./replay.js";
import { createRun, setHealth, stepHead } from "./runner.js";
import { persistSpec, specFromKuru, MOCK_SPEC, monUsdMicros, venueNotes, type MarketSpec } from "./spec.js";
import { measureReplaceGasUsd } from "./cost.js";
import { assessHealth, liveAbiMarketState, type MarketState } from "./health.js";

function composerModel(): Model {
  if (config.model === "jev") {
    if (!config.jevApiKey) throw new Error("Set TYPESAFE_API_KEY or drop MODEL=jev");
    return new JevModel();
  }
  return new MockModel();
}

function extraModels(): { name: string; model: Model }[] {
  if (!config.compare || !config.jevApiKey) return [];
  if (config.model === "mock") return [{ name: config.jevModelId, model: new JevModel() }];
  return [{ name: "mock", model: new MockModel() }];
}

async function main() {
  if (config.mode === "range") {
    await runRangePaper(rangeComposerModel());
    return;
  }
  const primary = composerModel();
  const extra = extraModels();
  let spec: MarketSpec = MOCK_SPEC;
  if (config.tape === "live") {
    const provider = new ethers.providers.StaticJsonRpcProvider(config.rpcUrl, config.chainId);
    spec = specFromKuru(await Kuru.ParamFetcher.getMarketParams(provider, config.market), config.market, config.chainId);
    persistSpec(spec);
  }
  const run = createRun(primary.name, extra, spec, false);
  const extraBound = extra.map((e, i) => ({ ...e, book: run.extras[i]! }));
  const tape = new Tape();
  const mids: number[] = [];
  const inFlight = { current: null as Promise<void> | null, deciding: false };
  let processed = 0;

  resetEvents();
  const hoursLabel = config.hours >= 1 ? `${config.hours.toFixed(2)}h` : `${(config.hours * 60).toFixed(1)}m`;
  console.log(
    `jev-desk paper · 4-way grid/inventory/${primary.name}/naive${extra.length ? ` + ${extra.map((e) => e.name).join(",")}` : ""} · ${config.blocks} heads (~${hoursLabel}) · decide/${config.decisionEveryBlocks} · tape ${config.tape} · ${config.jevModelId}`,
  );
  console.log(venueNotes(spec).join(" · "));
  console.log(`gas ${config.gasUsdSource} ${config.gasUsdPerReplace}/replace · replaceMinMs=${config.replaceMinMs}`);
  if (config.tape === "live") {
    console.log(`live market state ${liveAbiMarketState()} (JS ABI has no pause view; fail-closed; no wallet)`);
  }

  const onSnap = async (
    book: Book,
    prints: Print[],
    awaitDecide: boolean,
    chainHead?: number,
    rpcError?: string,
    marketState: MarketState = "UNKNOWN",
  ) => {
    if (processed >= config.blocks) return;
    const decide = processed % config.decisionEveryBlocks === 0;
    processed++;
    await stepHead(run, { book, prints }, tape, mids, { composer: primary, extra: extraBound }, {
      decide,
      awaitDecide,
      inFlight,
      chainHead,
      rpcError,
      marketState,
    });
    if (processed % 20 === 0 || processed === config.blocks) {
      console.log(`#${processed}/${config.blocks} block ${book.block} mid ${mids[mids.length - 1]}`);
      console.log(run.report());
    }
  };

  if (config.tape === "replay") {
    const result = await replayUglyDay(primary);
    console.log(`ugly-day replay ${result.heads} heads + ${result.holes} hole in ${result.elapsedMs.toFixed(0)}ms (faster-than-live)`);
    console.log(result.report);
    console.log("events: data/events.jsonl");
    return;
  }

  if (config.tape === "kuru") {
    const result = await replayKuruTape(primary);
    console.log(`kuru replay ${result.heads} heads + ${result.holes} hole in ${result.elapsedMs.toFixed(0)}ms (faster-than-live)`);
    console.log(result.report);
    console.log("events: data/events.jsonl");
    return;
  }

  if (config.tape === "mock") {
    for (const snap of mockTape(config.blocks)) {
      await onSnap(snap.book, snap.prints, true, snap.book.block, undefined, "ACTIVE");
    }
  } else {
    const provider = new ethers.providers.StaticJsonRpcProvider(config.rpcUrl, config.chainId);
    let last = 0;
    let prevBook: Book | undefined;
    try {
      const gp = BigInt((await provider.getGasPrice()).toString());
      const measured = measureReplaceGasUsd({
        gasPriceWei: gp,
        gasUnits: BigInt(config.gasUnitsPerReplace),
        monUsdMicros: 23_000n,
      });
      if (measured) console.log(`gas heuristic ${measured.usd} micros @ gasPrice ${gp} (Kuru 210k+150k*n; not a receipt)`);
    } catch {
      console.log("gas: assumed-unknown-high (rpc measure failed)");
    }

    const poll = async () => {
      try {
        const hex = await rpc<string>(config.rpcUrl, "eth_blockNumber");
        const block = parseInt(hex, 16);
        if (block > last && processed < config.blocks) {
          last = block;
          const book = await readBook(config.rpcUrl, config.market, spec);
          const got = await readPrints(config.rpcUrl, config.market, prevBook ? prevBook.block + 1 : block, block, spec);
          if (!got.ok) {
            const h = assessHealth({
              spec,
              book,
              chainHead: block,
              nowMs: Date.now(),
              marketState: liveAbiMarketState(),
              rpcError: got.error,
              limits: { staleBookMs: config.staleBookMs, staleBookBlocks: config.staleBookBlocks },
            });
            setHealth(run, h);
            for (const b of run.books) b.paper.pull("rpc_error");
            console.error(got.error);
          } else {
            prevBook = book;
            try {
              const m = measureReplaceGasUsd({
                gasPriceWei: BigInt((await provider.getGasPrice()).toString()),
                gasUnits: BigInt(config.gasUnitsPerReplace),
                monUsdMicros: monUsdMicros(book.mid, spec),
              });
              if (m) {
                for (const b of run.books) b.paper.opts.gasUsdPerReplace = m.usd;
              }
            } catch {
              /* keep configured gas */
            }
            await onSnap(book, got.prints, false, block, undefined, liveAbiMarketState());
          }
        }
      } catch (e) {
        console.error((e as Error).message);
        const now = Date.now();
        if (run.deadMan.expired(now)) {
          for (const b of run.books) b.paperKill("dead_man");
        } else {
          for (const b of run.books) b.paper.pull("rpc_error");
        }
      }
      if (processed < config.blocks) setTimeout(poll, config.pollMs);
      else {
        if (inFlight.current) await inFlight.current;
        console.log("\n=== holdout ===");
        console.log(run.report());
        console.log("events: data/events.jsonl");
      }
    };
    await poll();
    return;
  }

  if (inFlight.current) await inFlight.current;
  console.log("\n=== holdout ===");
  console.log(run.report());
  console.log("events: data/events.jsonl");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
