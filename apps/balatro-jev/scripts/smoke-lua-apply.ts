#!/usr/bin/env node
/**
 * Offline smoke: assert Lua apply covers every action kind the TS bridge emits,
 * and that G.FUNCS names referenced in actions.lua exist in the installed game.
 */
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveLegalActions } from "../src/legal-actions.js";
import { parseState } from "../src/bridge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lovePath =
  process.env.BALATRO_LOVE ??
  path.join(
    process.env.HOME ?? "",
    "Library/Application Support/Steam/steamapps/common/Balatro/Balatro.app/Contents/Resources/Balatro.love",
  );

const KIND_TO_FUNCS: Record<string, string[]> = {
  play_hand: ["play_cards_from_highlighted"],
  discard: ["discard_cards_from_highlighted"],
  select_blind: ["select_blind"],
  skip_blind: ["skip_blind"],
  buy: ["buy_from_shop", "use_card"],
  reroll: ["reroll_shop"],
  leave_shop: ["toggle_shop"],
  cash_out: ["cash_out"],
  sell: ["sell_card"],
  use_consumable: ["use_card"],
  pack_select: ["use_card"],
  pack_skip: ["skip_booster"],
  new_run: ["start_run"],
  go_to_menu: ["go_to_menu"],
  noop: [],
};

async function main(): Promise<void> {
  const actionsLua = await readFile(
    path.join(root, "mod/balatro_jev/actions.lua"),
    "utf8",
  );
  const fixturesDir = path.join(root, "fixtures");
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json"));

  const kinds = new Set<string>();
  for (const f of files) {
    const state = parseState(
      JSON.parse(await readFile(path.join(fixturesDir, f), "utf8")) as unknown,
    );
    for (const a of deriveLegalActions(state)) kinds.add(a.kind);
  }

  console.log(`[smoke:lua] fixture action kinds: ${[...kinds].sort().join(", ")}`);

  let failed = false;
  for (const kind of kinds) {
    if (!actionsLua.includes(`kind == "${kind}"`)) {
      console.error(`[smoke:lua] FAIL actions.lua missing branch for kind=${kind}`);
      failed = true;
    } else {
      console.log(`[smoke:lua] ok branch kind=${kind}`);
    }
  }

  // Verify FUNCS exist in installed Balatro.love when present
  try {
    const files = [
      "functions/button_callbacks.lua",
      "functions/state_events.lua",
    ];
    const found = new Set<string>();
    for (const f of files) {
      // Stream via shell grep — full unzip into Node can abort on large buffers.
      const out = execFileSync(
        "sh",
        [
          "-c",
          `unzip -p "$1" "$2" | grep -oE 'G\\.FUNCS\\.[A-Za-z0-9_]+' | sort -u`,
          "sh",
          lovePath,
          f,
        ],
        { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
      );
      for (const line of out.split("\n")) {
        const name = line.trim().replace(/^G\.FUNCS\./, "");
        if (name) found.add(name);
      }
    }
    for (const kind of kinds) {
      const funcs = KIND_TO_FUNCS[kind] ?? [];
      for (const fn of funcs) {
        if (!found.has(fn)) {
          console.error(`[smoke:lua] FAIL game missing G.FUNCS.${fn} (needed by ${kind})`);
          failed = true;
        } else {
          console.log(`[smoke:lua] ok game has G.FUNCS.${fn}`);
        }
      }
    }
  } catch (err) {
    console.warn(
      `[smoke:lua] skip game FUNCS check (Balatro.love not readable):`,
      err instanceof Error ? err.message : err,
    );
  }

  if (failed) {
    console.error("[smoke:lua] FAILED");
    process.exit(1);
  }
  console.log("[smoke:lua] ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
