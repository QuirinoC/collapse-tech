#!/usr/bin/env node
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideFromFile,
  decideFromState,
  defaultIpcDir,
  parseState,
  writeDecision,
} from "./bridge.js";
import { config } from "./config.js";
import { resolveMode } from "./jev-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function usage(): never {
  console.log(`balatro-jev — Balatro state → Jev Choice → action bridge

Usage:
  npm start -- --once [--fixture <path>] [--state <path>] [--action <path>]
  npm run mock
  npm run watch
  npm run simulate
  npm run smoke:live

Env:
  TYPESAFE_API_KEY       enable live Jev (unless BALATRO_JEV_MODE=mock)
  JEV_MODEL_ID           pin model (default jev-1.13.0)
  BALATRO_JEV_MODE       mock | live
  BALATRO_JEV_IPC_DIR    directory for state.json / action.json (default: ./ipc)
  MIN_ACTION_CONFIDENCE  Choice confidence floor (default 0.45)
`);
  process.exit(1);
}

function argValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

async function runOnce(opts: {
  statePath?: string;
  fixturePath?: string;
  actionPath: string;
}): Promise<void> {
  const mode = resolveMode();
  console.log(`[balatro-jev] mode=${mode} model=${config.jevModelId}`);

  let decision;
  if (opts.fixturePath) {
    const text = await readFile(opts.fixturePath, "utf8");
    const state = parseState(JSON.parse(text) as unknown);
    decision = await decideFromState(state, mode);
  } else if (opts.statePath) {
    decision = await decideFromFile(opts.statePath, mode);
  } else {
    throw new Error("provide --fixture or --state");
  }

  await writeDecision(decision, opts.actionPath);

  console.log(`[balatro-jev] legal_actions=${decision.legal_actions.length}`);
  for (const a of decision.legal_actions) {
    const mark = a.id === decision.chosen.action.id ? "*" : " ";
    console.log(`  ${mark} ${a.id} — ${a.label}`);
  }
  console.log(
    `[balatro-jev] chose ${decision.chosen.action.id} (${decision.chosen.mode}` +
      `${decision.chosen.confidence != null ? ` conf=${decision.chosen.confidence}` : ""}` +
      `${decision.chosen.model ? ` model=${decision.chosen.model}` : ""})`,
  );
  if (decision.chosen.rationale) {
    console.log(`[balatro-jev] rationale: ${decision.chosen.rationale}`);
  }
  console.log(`[balatro-jev] wrote ${opts.actionPath}`);
}

async function runWatch(ipcDir: string, actionPath: string): Promise<void> {
  const statePath = path.join(ipcDir, "state.json");
  console.log(`[balatro-jev] watching ${statePath} (mode=${resolveMode()})`);

  let busy = false;
  let queued = false;

  const tick = async () => {
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    try {
      await runOnce({ statePath, actionPath });
    } catch (err) {
      console.error(`[balatro-jev] watch cycle failed:`, err);
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        void tick();
      }
    }
  };

  watch(path.dirname(statePath), { persistent: true }, (_event, filename) => {
    if (!filename || filename !== path.basename(statePath)) return;
    void tick();
  });

  try {
    await readFile(statePath, "utf8");
    await tick();
  } catch {
    console.log(`[balatro-jev] waiting for first state dump…`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) usage();

  const ipcDir = defaultIpcDir(appRoot);
  const actionPath =
    argValue(argv, "--action") ?? path.join(ipcDir, "action.json");
  const fixture =
    argValue(argv, "--fixture") ??
    (argv.includes("--once") && !argValue(argv, "--state")
      ? path.join(appRoot, "fixtures/hand-state.json")
      : undefined);
  const statePath = argValue(argv, "--state") ?? path.join(ipcDir, "state.json");

  if (argv.includes("--watch")) {
    await runWatch(ipcDir, actionPath);
    return;
  }

  await runOnce({
    statePath: fixture ? undefined : statePath,
    fixturePath: fixture,
    actionPath,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
