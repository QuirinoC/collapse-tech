/**
 * Consolidate proof for brain-merge:
 * 1) Mock pair-flush → flush wins (not high-card stub)
 * 2) Mock pair-hand → Ace pair wins
 * 3) Simulated low-conf Jev answer → valid choice KEPT (no mock override)
 * 4) Unknown id → combo-aware mock
 * Runtime must stay stopped (DO_NOT_LAUNCH).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLegalActions } from "../src/legal-actions.js";
import {
  mockChoose,
  resolveLiveChoice,
} from "../src/jev-client.js";
import { config } from "../src/config.js";
import type { BalatroState } from "../src/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadFixture(name: string): BalatroState {
  return JSON.parse(
    readFileSync(join(root, "fixtures", name), "utf8"),
  ) as BalatroState;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function checkDoNotLaunch(): void {
  const markers = [
    join(root, ".DO_NOT_LAUNCH"),
    "/tmp/BALATRO_JEV_DO_NOT_LAUNCH",
    join(process.env.HOME ?? "", ".balatro-jev-stop/DO_NOT_LAUNCH"),
  ];
  const present = markers.filter((p) => p && existsSync(p));
  assert(present.length > 0, "DO_NOT_LAUNCH marker missing — runtime must stay stopped");
  console.log(`ok  runtime STOPPED (${present.length} DO_NOT_LAUNCH markers)`);
}

function proofPairFlush(): void {
  const state = loadFixture("pair-flush-state.json");
  const actions = deriveLegalActions(state);
  const flushIds = actions
    .filter((a) => a.kind === "play_hand" && a.id.includes("flush"))
    .map((a) => a.id);
  const pairIds = actions
    .filter((a) => a.kind === "play_hand" && a.id.includes("pair"))
    .map((a) => a.id);
  assert(flushIds.length > 0, "expected flush play options");
  assert(pairIds.length > 0, "expected pair play options");
  assert(
    !actions.some((a) => /^play_0_1_2$/.test(a.id)),
    "stub play_0_1_2 must not be a legal id",
  );

  const chosen = mockChoose(state, actions);
  assert(
    chosen.action.id.includes("flush"),
    `mock pair-flush must prefer flush, got ${chosen.action.id}`,
  );
  console.log(
    `ok  mock pair-flush → ${chosen.action.id} (options=${actions.length}, flush=${flushIds[0]}, pair=${pairIds[0]})`,
  );
}

function proofPairHand(): void {
  const state = loadFixture("pair-hand-state.json");
  const actions = deriveLegalActions(state);
  const chosen = mockChoose(state, actions);
  assert(
    chosen.action.id.includes("pair") &&
      (chosen.action.id.includes("A") ||
        JSON.stringify(chosen.action.params?.card_indices ?? []).includes("0")),
    `mock pair-hand must prefer Ace pair, got ${chosen.action.id}`,
  );
  console.log(
    `ok  mock pair-hand → ${chosen.action.id} (options=${actions.length})`,
  );
}

function proofLowConfKeepsJev(): void {
  const state = loadFixture("pair-flush-state.json");
  const actions = deriveLegalActions(state);
  const jevPick =
    actions.find((a) => a.id.includes("flush")) ??
    actions.find((a) => a.id.includes("pair"));
  assert(jevPick, "need a made-hand id to simulate Jev choice");

  const lowConf = Math.min(0.33, config.minActionConfidence * 0.5);
  assert(
    lowConf < config.minActionConfidence,
    `simulated conf ${lowConf} must be below floor ${config.minActionConfidence}`,
  );

  const resolved = resolveLiveChoice({
    state,
    actions,
    selectedId: jevPick.id,
    confidence: lowConf,
    model: "proof-sim",
    optionCount: actions.length,
  });

  assert(
    resolved.action.id === jevPick.id,
    `low-conf trap: expected keep ${jevPick.id}, got ${resolved.action.id}`,
  );
  assert(
    !resolved.rationale?.includes("mock fallback"),
    `low-conf must not mock-override; rationale=${resolved.rationale}`,
  );
  assert(resolved.confidence === lowConf, "confidence must pass through");
  console.log(
    `ok  low-conf ${lowConf.toFixed(3)} < ${config.minActionConfidence} keeps ${resolved.action.id}`,
  );
}

function proofUnknownIdMocks(): void {
  const state = loadFixture("pair-flush-state.json");
  const actions = deriveLegalActions(state);
  const resolved = resolveLiveChoice({
    state,
    actions,
    selectedId: "play_totally_fake_xyz",
    confidence: 0.99,
    model: "proof-sim",
  });
  assert(
    resolved.rationale?.includes("combo-aware mock fallback"),
    `unknown id must mock; rationale=${resolved.rationale}`,
  );
  assert(
    resolved.action.id.includes("flush") || resolved.action.kind === "play_hand",
    `unknown-id mock should still be combo-aware, got ${resolved.action.id}`,
  );
  console.log(`ok  unknown id → combo-aware mock ${resolved.action.id}`);
}

function main(): void {
  console.log("=== balatro-jev brain-merge proof ===");
  checkDoNotLaunch();
  proofPairFlush();
  proofPairHand();
  proofLowConfKeepsJev();
  proofUnknownIdMocks();
  console.log("=== ALL PASSED — low-conf trap gone ===");
}

main();
