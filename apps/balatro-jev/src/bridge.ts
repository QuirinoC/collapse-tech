import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { deriveLegalActions } from "./legal-actions.js";
import { chooseAction, resolveMode, type JevMode } from "./jev-client.js";
import type { BalatroState, BridgeDecision } from "./types.js";

export function parseState(raw: unknown): BalatroState {
  if (!raw || typeof raw !== "object") {
    throw new Error("state must be a JSON object");
  }
  const s = raw as Partial<BalatroState>;
  if (s.version !== 1) {
    throw new Error(`unsupported state.version: ${String(s.version)}`);
  }
  if (!s.phase) throw new Error("state.phase required");
  return {
    version: 1,
    phase: s.phase,
    ante: Number(s.ante ?? 1),
    round: Number(s.round ?? 1),
    money: Number(s.money ?? 0),
    chips_needed: s.chips_needed,
    chips_scored: s.chips_scored,
    hands_left: s.hands_left,
    discards_left: s.discards_left,
    hand_size: s.hand_size,
    hand: s.hand,
    selected: s.selected,
    jokers: s.jokers,
    blinds: s.blinds,
    shop: s.shop,
    legal_actions: s.legal_actions,
    notes: s.notes,
  };
}

export async function decideFromState(
  state: BalatroState,
  mode?: JevMode,
): Promise<BridgeDecision> {
  const legal_actions = deriveLegalActions(state);
  const chosen = await chooseAction(state, legal_actions, mode ?? resolveMode());
  return {
    state,
    legal_actions,
    chosen,
    decided_at: new Date().toISOString(),
  };
}

export async function decideFromFile(
  statePath: string,
  mode?: JevMode,
): Promise<BridgeDecision> {
  const text = await readFile(statePath, "utf8");
  const state = parseState(JSON.parse(text) as unknown);
  return decideFromState(state, mode);
}

export async function writeDecision(
  decision: BridgeDecision,
  actionPath: string,
): Promise<void> {
  await mkdir(path.dirname(actionPath), { recursive: true });
  const payload = {
    version: 1,
    decided_at: decision.decided_at,
    mode: decision.chosen.mode,
    model: decision.chosen.model ?? null,
    confidence: decision.chosen.confidence ?? null,
    rationale: decision.chosen.rationale ?? null,
    action: decision.chosen.action,
    legal_action_ids: decision.legal_actions.map((a) => a.id),
  };
  await writeFile(actionPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function defaultIpcDir(cwd = process.cwd()): string {
  return config.ipcDir.trim() || path.join(cwd, "ipc");
}
