import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { toSemanticState } from "./buckets.js";
import { config, resolveMode, type JevMode } from "./config.js";
import { toChoiceCriteria } from "./legal-actions.js";
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

/** Cheap heuristic when no API key / low confidence / live failure. */
export function mockChoose(
  state: BalatroState,
  actions: LegalAction[],
): ChosenAction {
  const preferKinds = PHASE_PREFER[state.phase] ?? [];
  const prefer = (kinds: LegalAction["kind"][]) =>
    actions.find((a) => kinds.includes(a.kind));

  // Shop: prefer affordable joker buy, else leave (don't burn money on endless rerolls).
  let picked: LegalAction | undefined;
  if (state.phase === "shop") {
    picked =
      actions.find((a) => a.kind === "buy" && String(a.id).includes("joker")) ??
      prefer(["buy"]) ??
      prefer(["leave_shop", "cash_out"]) ??
      prefer(["reroll"]);
  } else if (state.phase === "blind_select") {
    picked = prefer(["select_blind"]) ?? prefer(["skip_blind"]);
  } else if (state.phase === "menu") {
    picked = prefer(["new_run"]);
  } else if (state.phase === "hand") {
    picked = prefer(["play_hand"]) ?? prefer(["discard"]);
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
    rationale: `mock heuristic for phase=${state.phase}`,
  };
}

function safeFallback(actions: LegalAction[], reason: string): ChosenAction {
  const prefer = (kinds: LegalAction["kind"][]) =>
    actions.find((a) => kinds.includes(a.kind));
  const picked =
    prefer(["noop"]) ??
    prefer(["leave_shop", "cash_out"]) ??
    prefer(["select_blind"]) ??
    prefer(["pack_skip"]) ??
    prefer(["go_to_menu"]) ??
    actions[0]!;
  return {
    action: picked,
    mode: "live",
    confidence: 0,
    rationale: reason,
  };
}

export async function liveChoose(
  state: BalatroState,
  actions: LegalAction[],
  opts?: { model?: string; apiKey?: string },
): Promise<ChosenAction> {
  if (actions.length === 0) {
    return safeFallback(
      [{ id: "noop", kind: "noop", label: "No-op", params: {} }],
      "no legal actions",
    );
  }

  if (actions.length === 1) {
    return {
      action: actions[0]!,
      mode: "live",
      confidence: 1,
      rationale: "single legal action; skipped Jev call",
    };
  }

  const apiKey = opts?.apiKey ?? config.jevApiKey;
  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY is required for live mode");
  }

  const model = opts?.model ?? config.jevModelId;
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: model,
    timeout: config.jevTimeoutMs,
    logLevel: "warn",
  });

  const criteria = toChoiceCriteria(actions);
  const response = await client.systemOne({
    model,
    state: toSemanticState(state, actions),
    questions: {
      action: choice(
        {
          question:
            "Which currently legal action should be taken next in this Balatro run?",
          inspect: [
            "`phase`",
            "`hand`",
            "`jokers`",
            "`chip_pressure`",
            "`hands`",
            "`discards`",
            "`money`",
            "`shop`",
            "`pack`",
            "`blinds`",
            "`legal_action_ids`",
            "`objective`",
          ],
          focus:
            "Pick exactly one id from the criteria. Prefer clearing the blind; in shop leave after useful buys; in packs take the strongest card; do not invent actions.",
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
      action: fallback.action,
      mode: "live",
      confidence: 0,
      model: response.model,
      rationale: `stale/unknown choice id=${selectedId}; mock fallback ${fallback.action.id}`,
    };
  }

  if (confidence < config.minActionConfidence) {
    const fallback = mockChoose(state, actions);
    return {
      action: fallback.action,
      mode: "live",
      confidence,
      model: response.model,
      rationale: `low confidence (${confidence.toFixed(3)} < ${config.minActionConfidence}); used mock fallback ${fallback.action.id}`,
    };
  }

  return {
    action,
    mode: "live",
    confidence,
    model: response.model,
    rationale: `jev choice=${selectedId}`,
  };
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
        action: fallback.action,
        mode: "live",
        confidence: 0,
        rationale: `live Jev failed (${err instanceof Error ? err.message : String(err)}); mock fallback ${fallback.action.id}`,
      };
    }
  }
  return mockChoose(state, actions);
}
