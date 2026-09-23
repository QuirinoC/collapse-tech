#!/usr/bin/env node
/**
 * Simulated Balatro state loop — exercises the bridge without the game.
 * Cycles fixture states → decide → print action (mock or live).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideFromState, parseState, writeDecision } from "../src/bridge.js";
import { config } from "../src/config.js";
import { resolveMode } from "../src/jev-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [
  "fixtures/blind-select-state.json",
  "fixtures/hand-state.json",
  "fixtures/shop-state.json",
];

async function main(): Promise<void> {
  const mode = resolveMode();
  console.log(`[simulate] mode=${mode} model=${config.jevModelId}`);
  console.log(`[simulate] steps=${fixtures.length}`);

  for (let i = 0; i < fixtures.length; i++) {
    const rel = fixtures[i]!;
    const full = path.join(root, rel);
    const state = parseState(JSON.parse(await readFile(full, "utf8")) as unknown);
    const decision = await decideFromState(state, mode);
    const out = path.join(root, "ipc", `sim-action-${i + 1}.json`);
    await writeDecision(decision, out);
    console.log(
      `\n[simulate] step ${i + 1}/${fixtures.length} phase=${state.phase} ← ${rel}`,
    );
    console.log(
      `  → ${decision.chosen.action.id} (${decision.chosen.mode}` +
        `${decision.chosen.confidence != null ? ` conf=${decision.chosen.confidence.toFixed(3)}` : ""})`,
    );
    if (decision.chosen.rationale) {
      console.log(`  rationale: ${decision.chosen.rationale}`);
    }
    console.log(`  wrote ${out}`);
  }

  console.log("\n[simulate] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
