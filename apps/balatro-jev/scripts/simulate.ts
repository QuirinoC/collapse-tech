#!/usr/bin/env node
/**
 * Simulated Balatro full-phase loop — exercises the bridge without the game.
 * Cycles fixture states → decide → print action (mock or live).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideFromState, parseState, writeDecision } from "../src/bridge.js";
import { config } from "../src/config.js";
import { resolveMode } from "../src/jev-client.js";
import { deriveLegalActions } from "../src/legal-actions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [
  "fixtures/blind-select-state.json",
  "fixtures/hand-state.json",
  "fixtures/round-eval-state.json",
  "fixtures/shop-state.json",
  "fixtures/pack-open-state.json",
  "fixtures/game-over-state.json",
];

const EXPECTED_KINDS: Record<string, string[]> = {
  blind_select: ["select_blind", "skip_blind"],
  hand: ["play_hand", "discard"],
  round_eval: ["cash_out"],
  shop: ["buy", "leave_shop", "reroll", "sell", "use_consumable"],
  pack_open: ["pack_select", "pack_skip"],
  game_over: ["new_run", "go_to_menu"],
};

async function main(): Promise<void> {
  const mode = resolveMode();
  console.log(`[simulate] mode=${mode} model=${config.jevModelId}`);
  console.log(`[simulate] steps=${fixtures.length}`);

  let failed = false;

  for (let i = 0; i < fixtures.length; i++) {
    const rel = fixtures[i]!;
    const full = path.join(root, rel);
    const state = parseState(JSON.parse(await readFile(full, "utf8")) as unknown);
    const legal = deriveLegalActions(state);
    const expected = EXPECTED_KINDS[state.phase] ?? [];
    for (const kind of expected) {
      if (!legal.some((a) => a.kind === kind)) {
        console.error(
          `[simulate] FAIL phase=${state.phase}: missing kind ${kind} in`,
          legal.map((a) => a.kind),
        );
        failed = true;
      }
    }

    const decision = await decideFromState(state, mode);
    const out = path.join(root, "ipc", `sim-action-${i + 1}.json`);
    await writeDecision(decision, out);
    console.log(
      `\n[simulate] step ${i + 1}/${fixtures.length} phase=${state.phase} ← ${rel}`,
    );
    console.log(`  legal=${legal.length} kinds=${[...new Set(legal.map((a) => a.kind))].join(",")}`);
    console.log(
      `  → ${decision.chosen.action.id} (${decision.chosen.mode}` +
        `${decision.chosen.confidence != null ? ` conf=${decision.chosen.confidence.toFixed(3)}` : ""})`,
    );
    if (decision.chosen.rationale) {
      console.log(`  rationale: ${decision.chosen.rationale}`);
    }
    console.log(`  wrote ${out}`);
  }

  console.log(failed ? "\n[simulate] FAILED coverage checks" : "\n[simulate] done");
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
