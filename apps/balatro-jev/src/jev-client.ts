import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { toSemanticState } from "./buckets.js";
import { config, resolveMode, type JevMode } from "./config.js";
import { toChoiceCriteria } from "./legal-actions.js";
import { actionId, pickBestHandAction } from "./poker-hands.js";
import type { BalatroState, ChosenAction, LegalAction } from "./types.js";

export type { JevMode };
export { resolveMode };

const PHASE_PREFER: Record<string, LegalAction["kind"][]> = {
  blind_select: ["select_blind", "skip_blind"],
  hand: ["play_hand", "discard"],
  shop: ["buy", "leave_shop", "reroll", "sell"],
  pack_open: ["pack_select", "pack_skip"],
  round_eval: ["cash_out"],
  game_over: ["new_run", "go_to_menu"],
  menu: ["new_run"],
  unknown: ["select_blind", "new_run", "noop"],
};

function matchHandHeuristic(state: BalatroState, actions: LegalAction[]): LegalAction | undefined {
  const hand = state.hand ?? [];
  if (hand.length === 0) return undefined;
  const pick = pickBestHandAction(hand, {
    handsLeft: state.hands_left ?? 1,
    discardsLeft: state.discards_left ?? 0,
  });
  if (!pick) return undefined;
  const wantId = actionId(pick.kind === "play_hand" ? "play" : "discard", pick.combo);
  const byId = actions.find((a) => a.id === wantId);
  if (byId) return byId;
  const key = [...pick.combo.indices].sort((a, b) => a - b).join(",");
  return actions.find((a) => {
    if (a.kind !== pick.kind) return false;
    const idxs = a.params?.card_indices;
    if (!Array.isArray(idxs)) return false;
    return [...idxs].map(Number).sort((x, y) => x - y).join(",") === key;
  });
}

export function mockChoose(state: BalatroState, actions: LegalAction[]): ChosenAction {
  const preferKinds = PHASE_PREFER[state.phase] ?? [];
  const prefer = (kinds: LegalAction["kind"][]) => actions.find((a) => kinds.includes(a.kind));
  let picked: LegalAction | undefined;
  if (state.phase === "shop") {
    picked =
      actions.find((a) => a.kind === "buy" && String(a.id).includes("joker")) ??
      prefer(["buy"]) ?? prefer(["leave_shop", "cash_out"]) ?? prefer(["reroll"]);
  } else if (state.phase === "blind_select") {
    picked = prefer(["select_blind"]) ?? prefer(["skip_blind"]);
  } else if (state.phase === "menu") {
    picked = prefer(["new_run"]);
  } else if (state.phase === "hand") {
    picked = matchHandHeuristic(state, actions) ?? prefer(["play_hand"]) ?? prefer(["discard"]);
  } else if (state.phase === "pack_open") {
    picked = prefer(["pack_select"]) ?? prefer(["pack_skip"]);
  } else {
    picked = prefer(preferKinds);
  }
  picked = picked ?? prefer(["noop"]) ?? actions[0]!;
  return {
    action: picked,
    mode: "mock",
    confidence: 1,
    rationale: state.phase === "hand" ? `mock poker heuristic → ${picked.id}` : `mock heuristic for phase=${state.phase}`,
  };
}

function safeFallback(actions: LegalAction[], reason: string): ChosenAction {
  const prefer = (kinds: LegalAction["kind"][]) => actions.find((a) => kinds.includes(a.kind));
  const picked =
    prefer(["noop"]) ?? prefer(["leave_shop", "cash_out"]) ?? prefer(["select_blind"]) ??
    prefer(["pack_skip"]) ?? prefer(["go_to_menu"]) ?? actions[0]!;
  return { action: picked, mode: "live", confidence: 0, rationale: reason };
}

export async function liveChoose(
  state: BalatroState,
  actions: LegalAction[],
  opts?: { model?: string; apiKey?: string },
): Promise<ChosenAction> {
  if (actions.length === 0) {
    return safeFallback([{ id: "noop", kind: "noop", label: "No-op", params: {} }], "no legal actions");
  }
  if (actions.length === 1) {
    return { action: actions[0]!, mode: "live", confidence: 1, rationale: "single legal action; skipped Jev call" };
  }
  const apiKey = opts?.apiKey ?? config.jevApiKey;
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is required for live mode");
  const model = opts?.model ?? config.jevModelId;
  const client = new TypeSafeClient({ apiKey, defaultModel: model, timeout: config.jevTimeoutMs, logLevel: "warn" });
  const criteria = toChoiceCriteria(actions);
  const response = await client.systemOne({
    model,
    state: toSemanticState(state, actions),
    questions: {
      action: choice(
        {
          question: "Which currently legal action should be taken next in this Balatro run?",
          inspect: [
            "`phase`", "`hand`", "`hand.best_made`", "`hand.draws`", "`hand.cards`", "`jokers`",
            "`chip_pressure`", "`chips_remaining`", "`hands_left`", "`discards_left`",
            "`play_options`", "`discard_options`", "`preference_order`", "`objective`",
          ],
          focus:
            "Pick exactly one action id from the criteria. In hand phase: prefer MADE poker hands (pair/two_pair/three/straight/flush/full_house/four) over draws; prefer discard of dead cards when chasing a flush/straight and no made hand exists; never invent actions. Elsewhere: clear blinds; in shop leave after useful buys; in packs take the strongest card.",
        },
        criteria,
      ),
    },
  });
  const selectedId = response.answers.action.choice;
  const confidence = response.answers.action.confidence;
  const action = actions.find((a) => a.id === selectedId);
  if (!action) {
    const fallback = mockChoose(state, actions);
    return {
      action: fallback.action, mode: "live", confidence: 0, model: response.model,
      rationale: `stale/unknown choice id=${selectedId}; mock fallback ${fallback.action.id}`,
    };
  }
  if (confidence < config.minActionConfidence) {
    const fallback = mockChoose(state, actions);
    return {
      action: fallback.action, mode: "live", confidence, model: response.model,
      rationale: `low confidence (${confidence.toFixed(3)} < ${config.minActionConfidence}); used mock fallback ${fallback.action.id}`,
    };
  }
  return { action, mode: "live", confidence, model: response.model, rationale: `jev choice=${selectedId}` };
}

export async function chooseAction(
  state: BalatroState,
  actions: LegalAction[],
  mode: JevMode = resolveMode(),
): Promise<ChosenAction> {
  if (mode === "live") {
    try {
      return await liveChoose(state, actions);
    } catch (err) {
      const fallback = mockChoose(state, actions);
      return {
        action: fallback.action, mode: "live", confidence: 0,
        rationale: `live Jev failed (${err instanceof Error ? err.message : String(err)}); mock fallback ${fallback.action.id}`,
      };
    }
  }
  return mockChoose(state, actions);
}
