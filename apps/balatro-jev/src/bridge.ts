import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { deriveLegalActions } from "./legal-actions.js";
import { chooseAction, resolveMode, type JevMode } from "./jev-client.js";
import type { BalatroState, BridgeDecision, Phase } from "./types.js";

const PHASES = new Set<Phase>([
  "blind_select",
  "hand",
  "shop",
  "pack_open",
  "round_eval",
  "game_over",
  "menu",
  "unknown",
]);

/** If Lua lags on phase, infer actionable phase from payload shape. */
export function normalizePhase(state: BalatroState): Phase {
  if (state.phase !== "unknown" && PHASES.has(state.phase)) {
    return state.phase;
  }
  if (state.has_blind_select_ui) return "blind_select";
  if (state.blinds?.some((b) => {
    const s = (b.status ?? "").toLowerCase();
    return s === "select";
  })) {
    return "blind_select";
  }
  if (state.hand && state.hand.length > 0) return "hand";
  if (state.shop && state.shop.length > 0) return "shop";
  if (state.pack && state.pack.length > 0) return "pack_open";
  const raw = (state.raw_state_name ?? "").toUpperCase();
  if (raw === "MENU" || raw === "SPLASH" || raw === "DEMO_CTA") return "menu";
  return state.phase;
}

export function parseState(raw: unknown): BalatroState {
  if (!raw || typeof raw !== "object") {
    throw new Error("state must be a JSON object");
  }
  const s = raw as Partial<BalatroState>;
  if (s.version !== 1) {
    throw new Error(`unsupported state.version: ${String(s.version)}`);
  }
  if (!s.phase) throw new Error("state.phase required");
  const phase = (PHASES.has(s.phase as Phase) ? s.phase : "unknown") as Phase;
  const state: BalatroState = {
    version: 1,
    phase,
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
    consumables: s.consumables,
    blinds: s.blinds,
    blind_on_deck: s.blind_on_deck,
    shop: s.shop,
    reroll_cost: s.reroll_cost,
    pack: s.pack,
    pack_choices_left: s.pack_choices_left,
    legal_actions: s.legal_actions,
    raw_state: s.raw_state,
    raw_state_name: s.raw_state_name,
    has_blind_select_ui: s.has_blind_select_ui,
    notes: s.notes,
  };
  state.phase = normalizePhase(state);
  return state;
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
    phase: decision.state.phase,
    action: decision.chosen.action,
    legal_action_ids: decision.legal_actions.map((a) => a.id),
  };
  await writeFile(actionPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** Fingerprint a state for watch-loop dedupe (ignore notes churn). */
export function stateFingerprint(state: BalatroState): string {
  return JSON.stringify({
    phase: state.phase,
    ante: state.ante,
    round: state.round,
    money: state.money,
    chips_needed: state.chips_needed ?? null,
    chips_scored: state.chips_scored ?? null,
    hands_left: state.hands_left ?? null,
    discards_left: state.discards_left ?? null,
    hand: state.hand?.map((c) => [c.index, c.rank, c.suit]) ?? null,
    selected: state.selected ?? null,
    jokers: state.jokers?.map((j) => [j.index, j.id]) ?? null,
    consumables: state.consumables?.map((c) => [c.index, c.id]) ?? null,
    shop: state.shop?.map((s) => [s.index, s.id, s.cost, s.area]) ?? null,
    pack: state.pack?.map((p) => [p.index, p.id]) ?? null,
    blind_on_deck: state.blind_on_deck ?? null,
    blinds: state.blinds?.map((b) => [b.id, b.status]) ?? null,
  });
}

export function defaultIpcDir(cwd = process.cwd()): string {
  return config.ipcDir.trim() || path.join(cwd, "ipc");
}
