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
  stateFingerprint,
  writeDecision,
} from "./bridge.js";
import { config } from "./config.js";
import { mockChoose, resolveMode } from "./jev-client.js";
import { deriveLegalActions } from "./legal-actions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

/** Poll interval when fs.watch is quiet — never stall forever. */
const WATCH_POLL_MS = Number(process.env.BALATRO_JEV_POLL_MS ?? "1500");
/** Re-decide same fingerprint after this many ms (stuck-state escape). */
const STUCK_REENGAGE_MS = Number(process.env.BALATRO_JEV_STUCK_MS ?? "8000");
/** After this many identical decisions without state change, force mock leave/select. */
const MAX_SAME_DECISIONS = Number(process.env.BALATRO_JEV_MAX_SAME ?? "3");

function usage(): never {
  console.log(`balatro-jev — Balatro state → Jev Choice → action bridge

Usage:
  npm start -- --once [--fixture <path>] [--state <path>] [--action <path>]
  npm run mock
  npm run watch
  npm run launch:macos
  npm run simulate
  npm run smoke:live

Env:
  TYPESAFE_API_KEY       enable live Jev (unless BALATRO_JEV_MODE=mock)
  JEV_MODEL_ID           pin model (default jev-1.13.0)
  BALATRO_JEV_MODE       mock | live
  BALATRO_JEV_IPC_DIR    directory for state.json / action.json (default: ./ipc)
  MIN_ACTION_CONFIDENCE  Choice confidence floor (default 0.45)
  BALATRO_JEV_POLL_MS    watch poll interval (default 1500)
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
      `${decision.chosen.model ? ` model=${decision.chosen.model}` : ""}` +
      `${decision.chosen.tokens ? ` tokens_in=${decision.chosen.tokens.input} tokens_out=${decision.chosen.tokens.output}` : ""})`,
  );
  if (decision.chosen.rationale) {
    console.log(`[balatro-jev] rationale: ${decision.chosen.rationale}`);
  }
  console.log(`[balatro-jev] wrote ${opts.actionPath}`);
}

async function runWatch(ipcDir: string, actionPath: string): Promise<void> {
  const statePath = path.join(ipcDir, "state.json");
  console.log(`[balatro-jev] watching ${statePath} (mode=${resolveMode()})`);
  console.log(
    `[balatro-jev] poll=${WATCH_POLL_MS}ms stuck=${STUCK_REENGAGE_MS}ms max_same=${MAX_SAME_DECISIONS}`,
  );
  console.log(
    `[balatro-jev] tip: if phase=menu → waiting for new_run / Play; if phase=blind_select → should choose select_blind`,
  );

  let busy = false;
  let queued = false;
  let lastFingerprint = "";
  let lastDecisionAt = 0;
  let lastActionId = "";
  let sameDecisionCount = 0;
  let lastWaitingLog = 0;

  const tick = async (reason: string) => {
    if (busy) {
      queued = true;
      return;
    }
    busy = true;
    try {
      const text = await readFile(statePath, "utf8");
      const state = parseState(JSON.parse(text) as unknown);
      const fp = stateFingerprint(state);
      const now = Date.now();

      if (state.phase === "menu" || state.phase === "unknown") {
        if (now - lastWaitingLog >= 5000) {
          lastWaitingLog = now;
          console.log(
            `[balatro-jev] WAITING phase=${state.phase}` +
              ` raw=${state.raw_state_name ?? "?"}` +
              ` blinds=${state.blinds?.map((b) => `${b.id}:${b.status}`).join(",") ?? "none"}` +
              ` ui=${state.has_blind_select_ui ?? false}` +
              ` — ${
                state.phase === "menu"
                  ? "will try new_run (or click Play once)"
                  : "no actionable phase yet"
              }`,
          );
        }
      }

      // Skip identical state unless stuck long enough to re-engage.
      if (fp === lastFingerprint) {
        const stuck = now - lastDecisionAt >= STUCK_REENGAGE_MS;
        if (!stuck) return;
        console.log(
          `[balatro-jev] STUCK phase=${state.phase} for ${STUCK_REENGAGE_MS}ms — re-engaging (${reason})`,
        );
      } else {
        sameDecisionCount = 0;
        console.log(
          `[balatro-jev] STATE CHANGE phase=${state.phase}` +
            ` ante=${state.ante} round=${state.round}` +
            ` money=$${state.money}` +
            ` blinds=${state.blinds?.map((b) => `${b.id}:${b.status}`).join(",") ?? "none"}` +
            ` raw=${state.raw_state_name ?? "?"}`,
        );
      }

      let decision = await decideFromState(state);

      // No legal moves (e.g. ROUND_EVAL payout anim → phase unknown) → wait.
      if (decision.legal_actions.length === 0) {
        if (now - lastWaitingLog >= 5000) {
          lastWaitingLog = now;
          console.log(
            `[balatro-jev] WAITING phase=${state.phase}` +
              ` raw=${state.raw_state_name ?? "?"}` +
              ` cash_out_ready=${state.cash_out_ready ?? "?"}` +
              ` — no legal actions yet`,
          );
        }
        lastFingerprint = fp;
        return;
      }

      // Escape hatch: same action on same state repeatedly → force progress fallback.
      // Never force-rewrite a one-shot that already succeeded (cash_out / leave_shop /
      // select_blind) — that re-entrancy crashed Balatro (round_eval nil).
      if (
        fp === lastFingerprint &&
        decision.chosen.action.id === lastActionId
      ) {
        sameDecisionCount += 1;
      } else {
        sameDecisionCount = 1;
      }

      const oneShotKinds = new Set([
        "cash_out",
        "leave_shop",
        "select_blind",
        "skip_blind",
        "new_run",
      ]);
      if (
        fp === lastFingerprint &&
        decision.chosen.action.id === lastActionId &&
        oneShotKinds.has(decision.chosen.action.kind)
      ) {
        // Only suppress rewrite if Lua already reported ok for this id.
        // Failed select_blind / cash_out-not-ready must still retry.
        let priorOk: boolean | null = null;
        try {
          const resultPath = path.join(ipcDir, "action_result.json");
          const resultText = await readFile(resultPath, "utf8");
          const result = JSON.parse(resultText) as {
            ok?: boolean;
            id?: string;
          };
          if (result.id === lastActionId) {
            priorOk = Boolean(result.ok);
          }
        } catch {
          priorOk = null;
        }
        if (priorOk === true) {
          if (now - lastWaitingLog >= 5000) {
            lastWaitingLog = now;
            console.log(
              `[balatro-jev] WAITING one-shot ${lastActionId} to take effect` +
                ` (phase=${state.phase} apply already ok)`,
            );
          }
          return;
        }
      }

      if (sameDecisionCount >= MAX_SAME_DECISIONS) {
        const legal = deriveLegalActions(state);
        if (legal.length === 0) {
          lastFingerprint = fp;
          return;
        }
        const escape =
          legal.find((a) =>
            [
              "select_blind",
              "new_run",
              "leave_shop",
              "cash_out",
              "pack_skip",
              "play_hand",
            ].includes(a.kind),
          ) ?? mockChoose(state, legal).action;
        console.log(
          `[balatro-jev] FORCE ESCAPE → ${escape.id} kind=${escape.kind} (same decision x${sameDecisionCount})`,
        );
        decision = {
          ...decision,
          chosen: {
            action: escape,
            mode: decision.chosen.mode,
            confidence: 0,
            rationale: `forced escape after ${sameDecisionCount} identical decisions`,
          },
        };
        sameDecisionCount = 0;
      }

      await writeDecision(decision, actionPath);
      lastFingerprint = fp;
      lastDecisionAt = now;
      lastActionId = decision.chosen.action.id;

      const legalIds = decision.legal_actions.map((a) => a.id).join(", ");
      console.log(
        `[balatro-jev] DECIDE ${reason} phase=${state.phase} → ${decision.chosen.action.id}` +
          ` kind=${decision.chosen.action.kind}` +
          ` (${decision.chosen.mode}` +
          `${decision.chosen.confidence != null ? ` conf=${typeof decision.chosen.confidence === "number" ? decision.chosen.confidence.toFixed(3) : decision.chosen.confidence}` : ""}` +
          `${decision.chosen.tokens ? ` tokens_in=${decision.chosen.tokens.input} tokens_out=${decision.chosen.tokens.output}` : ""})`,
      );
      console.log(`[balatro-jev]   legal=[${legalIds}]`);
      if (decision.chosen.rationale) {
        console.log(`[balatro-jev]   rationale: ${decision.chosen.rationale}`);
      }
      console.log(`[balatro-jev]   wrote ${actionPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ENOENT") && !msg.includes("Unexpected end")) {
        console.error(`[balatro-jev] watch cycle failed:`, err);
      }
    } finally {
      busy = false;
      if (queued) {
        queued = false;
        void tick("queued");
      }
    }
  };

  watch(path.dirname(statePath), { persistent: true }, (_event, filename) => {
    if (!filename || filename !== path.basename(statePath)) return;
    void tick("fs");
  });

  setInterval(() => {
    void tick("poll");
  }, WATCH_POLL_MS);

  try {
    await readFile(statePath, "utf8");
    await tick("boot");
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
