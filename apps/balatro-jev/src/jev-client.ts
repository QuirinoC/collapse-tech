import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { toSemanticState } from "./buckets.js";
import { config, resolveMode, type JevMode } from "./config.js";
import { toChoiceCriteria } from "./legal-actions.js";
import type { BalatroState, ChosenAction, LegalAction } from "./types.js";

export type { JevMode };
export { resolveMode };

/** Cheap heuristic when no API key: prefer play > buy joker > select small > first. */
export function mockChoose(
  state: BalatroState,
  actions: LegalAction[],
): ChosenAction {
  const prefer = (kinds: LegalAction["kind"][]) =>
    actions.find((a) => kinds.includes(a.kind));

  const picked =
    prefer(["play_hand"]) ??
    prefer(["buy"]) ??
    prefer(["select_blind"]) ??
    prefer(["cash_out"]) ??
    prefer(["discard"]) ??
    actions[0]!;

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
    prefer(["cash_out"]) ??
    prefer(["select_blind"]) ??
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
            "`legal_action_ids`",
            "`objective`",
          ],
          focus:
            "Pick exactly one id from the criteria. Prefer clearing the blind; do not invent actions.",
        },
        criteria,
      ),
    },
  });

  const selectedId = response.answers.action.choice;
  const confidence = response.answers.action.confidence;
  const action = actions.find((a) => a.id === selectedId);

  if (!action) {
    return safeFallback(
      actions,
      `stale/unknown choice id=${selectedId}; falling back`,
    );
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
    return liveChoose(state, actions);
  }
  return mockChoose(state, actions);
}
