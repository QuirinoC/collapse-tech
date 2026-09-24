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

/** Combo-aware heuristic — never random. Used on API failure / low confidence. */
export function mockChoose(
  state: BalatroState,
  actions: LegalAction[],
): ChosenAction {
  const prefer = (kinds: LegalAction["kind"][]) =>
    actions.find((a) => kinds.includes(a.kind));

  let picked: LegalAction | undefined;

  if (state.phase === "hand" && (state.hand?.length ?? 0) > 0) {
    const best = pickBestHandAction(state.hand!, {
      handsLeft: state.hands_left ?? 1,
      discardsLeft: state.discards_left ?? 0,
    });
    if (best) {
      const id = actionId(
        best.kind === "play_hand" ? "play" : "discard",
        best.combo,
      );
      picked =
        actions.find((a) => a.id === id) ??
        actions.find(
          (a) =>
            a.kind === best.kind &&
            JSON.stringify(a.params?.card_indices) ===
              JSON.stringify(best.combo.indices),
        ) ??
        actions.find((a) => a.kind === best.kind);
    }
  } else if (state.phase === "shop") {
    picked =
      actions.find((a) => a.kind === "buy" && String(a.id).includes("joker")) ??
      prefer(["buy"]) ??
      prefer(["leave_shop", "cash_out"]) ??
      prefer(["reroll"]);
  } else if (state.phase === "blind_select") {
    picked = prefer(["select_blind"]) ?? prefer(["skip_blind"]);
  } else if (state.phase === "menu") {
    picked = prefer(["new_run"]);
  } else if (state.phase === "pack_open") {
    picked = prefer(["pack_select"]) ?? prefer(["pack_skip"]);
  } else {
    picked = prefer(PHASE_PREFER[state.phase] ?? []);
  }

  picked = picked ?? prefer(["noop"]) ?? actions[0]!;

  return {
    action: picked,
    mode: "mock",
    confidence: 1,
    rationale: `mock combo-aware heuristic for phase=${state.phase}`,
  };
}

function safeFallback(actions: LegalAction[], reason: string): ChosenAction {
  const prefer = (kinds: LegalAction["kind"][]) =>
    actions.find((a) => kinds.includes(a.kind));
  const picked =
    prefer(["leave_shop", "cash_out"]) ??
    prefer(["select_blind"]) ??
    prefer(["pack_skip"]) ??
    prefer(["go_to_menu"]) ??
    prefer(["noop"]) ??
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

  // Only skip Jev when there is truly one forced action.
  if (actions.length === 1) {
    console.log(
      `[balatro-jev] JEV skip single forced action=${actions[0]!.id} kind=${actions[0]!.kind}`,
    );
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
  console.log(
    `[balatro-jev] JEV call phase=${state.phase} options=${actions.length} model=${model}`,
  );

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
            "`ante`",
            "`blind`",
            "`hand`",
            "`jokers`",
            "`consumables`",
            "`chip_pressure`",
            "`hands_left`",
            "`discards_left`",
            "`money`",
            "`shop`",
            "`pack_open`",
            "`blinds`",
            "`deck_remaining`",
            "`legal_action_ids`",
            "`objective`",
          ],
          focus:
            "Pick exactly one id from the criteria. Prefer made poker hands (pair+) over high-card when scoring the blind; in shop buy strong jokers then leave; in packs take the strongest card; do not invent actions.",
        },
        criteria,
      ),
    },
  });

  const tokens = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  };
  const selectedId = response.answers.action.choice;
  const confidence = response.answers.action.confidence;

  console.log(
    `[balatro-jev] JEV result action=${selectedId} conf=${confidence.toFixed(3)}` +
      ` tokens_in=${tokens.input} tokens_out=${tokens.output} model=${response.model}`,
  );

  const action = actions.find((a) => a.id === selectedId);

  if (!action) {
    const fallback = mockChoose(state, actions);
    return {
      action: fallback.action,
      mode: "live",
      confidence: 0,
      model: response.model,
      tokens,
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
      tokens,
      rationale: `low confidence (${confidence.toFixed(3)} < ${config.minActionConfidence}); used mock fallback ${fallback.action.id}`,
    };
  }

  return {
    action,
    mode: "live",
    confidence,
    model: response.model,
    tokens,
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
      console.log(
        `[balatro-jev] JEV failed → mock fallback ${fallback.action.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
