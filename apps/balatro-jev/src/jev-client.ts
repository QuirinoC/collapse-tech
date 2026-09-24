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

/** Combo-aware heuristic — never random. Used only on API failure / unknown action id. */
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
  const optionKeys = Object.keys(criteria);
  console.log(
    `[balatro-jev] JEV CALL phase=${state.phase} options=${optionKeys.length} keys=[${optionKeys.join(", ")}] model=${model}`,
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
            "`hand.best_made`",
            "`hand.draws`",
            "`hand.cards`",
            "`jokers`",
            "`consumables`",
            "`chip_pressure`",
            "`chips_remaining`",
            "`hands_left`",
            "`discards_left`",
            "`money`",
            "`shop`",
            "`pack_open`",
            "`blinds`",
            "`deck_remaining`",
            "`play_options`",
            "`discard_options`",
            "`preference_order`",
            "`legal_action_ids`",
            "`objective`",
          ],
          focus:
            "Pick exactly one id from the criteria. In hand phase: prefer MADE poker hands (flush > straight > three > two_pair > pair) over draws and high card; never invent actions. Elsewhere: clear blinds; in shop leave after useful buys; in packs take the strongest card.",
        },
        criteria,
      ),
    },
  });

  const tokens = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  };
  return resolveLiveChoice({
    state,
    actions,
    selectedId: response.answers.action.choice,
    confidence: response.answers.action.confidence,
    model: response.model,
    tokens,
    optionCount: optionKeys.length,
  });
}

/**
 * Map a live Choice answer onto a legal action.
 * Valid ids are ALWAYS kept — even below MIN_ACTION_CONFIDENCE.
 * Mock only for unknown/stale ids (API failure is handled by chooseAction).
 */
export function resolveLiveChoice(args: {
  state: BalatroState;
  actions: LegalAction[];
  selectedId: string;
  confidence: number;
  model?: string;
  tokens?: { input: number; output: number };
  optionCount?: number;
}): ChosenAction {
  const {
    state,
    actions,
    selectedId,
    confidence,
    model,
    tokens,
    optionCount = actions.length,
  } = args;

  console.log(
    `[balatro-jev] JEV RESULT choice=${selectedId} conf=${confidence.toFixed(3)}` +
      ` options=${optionCount}` +
      (tokens
        ? ` tokens_in=${tokens.input} tokens_out=${tokens.output}`
        : "") +
      (model ? ` model=${model}` : ""),
  );

  const action = actions.find((a) => a.id === selectedId);

  if (!action) {
    const fallback = mockChoose(state, actions);
    return {
      action: fallback.action,
      mode: "live",
      confidence: 0,
      model,
      tokens,
      rationale: `stale/unknown choice id=${selectedId}; combo-aware mock fallback ${fallback.action.id}`,
    };
  }

  // Keep valid Jev choice even below MIN_ACTION_CONFIDENCE.
  // (Old trap: conf 0.33 → throw away pair/flush → dumb mock play_0_1_2.)
  if (confidence < config.minActionConfidence) {
    console.log(
      `[balatro-jev] JEV low conf ${confidence.toFixed(3)} < ${config.minActionConfidence} — keeping valid choice ${selectedId}`,
    );
  }

  return {
    action,
    mode: "live",
    confidence,
    model,
    tokens,
    rationale: `jev choice=${selectedId} conf=${confidence.toFixed(3)} options=${optionCount}`,
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
        `[balatro-jev] JEV failed → combo-aware mock fallback ${fallback.action.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        action: fallback.action,
        mode: "live",
        confidence: 0,
        rationale: `live Jev failed (${err instanceof Error ? err.message : String(err)}); combo-aware mock fallback ${fallback.action.id}`,
      };
    }
  }
  return mockChoose(state, actions);
}
