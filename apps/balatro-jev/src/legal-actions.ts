import type { BalatroState, LegalAction } from "./types.js";
import {
  actionId,
  enumerateDiscardCombos,
  enumeratePlayCombos,
} from "./poker-hands.js";

/** TypeSafe Choice accepts at most 255 options. */
export const MAX_CHOICE_OPTIONS = 255;

function uniqActions(actions: LegalAction[]): LegalAction[] {
  const seen = new Set<string>();
  const out: LegalAction[] = [];
  for (const a of actions) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

function ensureNoop(actions: LegalAction[], phase: string): LegalAction[] {
  if (actions.length > 0) return actions;
  return [
    {
      id: "noop",
      kind: "noop",
      label: `No-op (no legal actions for ${phase})`,
      what: `No currently legal action for phase ${phase}.`,
      not_for: "Any real play, buy, select, or skip.",
      score: 0,
      params: { phase },
    },
  ];
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function truncateToChoiceCap(
  actions: LegalAction[],
  cap = MAX_CHOICE_OPTIONS,
): LegalAction[] {
  if (actions.length <= cap) return actions;
  const scored = [...actions].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id),
  );
  const kept = scored.slice(0, cap);
  if (kept.length === 1 && kept[0]!.kind === "noop" && scored.length > 1) {
    return scored.filter((a) => a.kind !== "noop").slice(0, cap);
  }
  return kept;
}

function handActions(state: BalatroState): LegalAction[] {
  const hand = state.hand ?? [];
  if (hand.length === 0) return [];
  const handsLeft = state.hands_left ?? 1;
  const discardsLeft = state.discards_left ?? 0;
  const actions: LegalAction[] = [];

  if (handsLeft > 0) {
    for (const combo of enumeratePlayCombos(hand)) {
      actions.push({
        id: actionId("play", combo),
        kind: "play_hand",
        label: `Play ${combo.label}`,
        what: `Play these cards now as a ${combo.handType.replace(/_/g, " ")}: ${combo.cardsKey.replace(/_/g, " ")}.`,
        not_for:
          "Discarding, playing a different subset, or keeping these cards for later.",
        score: combo.strength + 1000,
        params: {
          card_indices: combo.indices,
          hand_type: combo.handType,
          cards_key: combo.cardsKey,
        },
      });
    }
  }

  if (discardsLeft > 0) {
    for (const combo of enumerateDiscardCombos(hand)) {
      actions.push({
        id: actionId("discard", combo),
        kind: "discard",
        label: `Discard ${combo.label}`,
        what: `Discard ${combo.cardsKey.replace(/_/g, " ")} (${combo.handType.replace(/_/g, " ")}) to improve the remaining hand.`,
        not_for: "Playing a scoring hand this turn, or discarding keepers.",
        score: combo.strength + 500,
        params: {
          card_indices: combo.indices,
          hand_type: combo.handType,
          cards_key: combo.cardsKey,
        },
      });
    }
  }

  if (state.selected && state.selected.length > 0 && handsLeft > 0) {
    const idxs = state.selected;
    const names = idxs
      .map((i) => {
        const c = hand.find((h) => h.index === i);
        return c ? `${c.rank}${c.suit[0]?.toUpperCase() ?? ""}` : `#${i}`;
      })
      .join(" ");
    actions.push({
      id: `play_selected_${idxs.join("_")}`,
      kind: "play_hand",
      label: `Play currently selected [${names}]`,
      what: `Play the cards already highlighted in the UI: ${names}.`,
      not_for: "A different play subset or a discard.",
      score: 150,
      params: { card_indices: idxs },
    });
  }

  return actions;
}

function blindActions(state: BalatroState): LegalAction[] {
  const actions: LegalAction[] = [];
  const blinds =
    state.blinds ??
    [
      { id: "small", name: "Small Blind", skippable: true, native_key: "Small", status: "Select" },
      { id: "big", name: "Big Blind", skippable: true, native_key: "Big", status: "Upcoming" },
      { id: "boss", name: "Boss Blind", skippable: false, native_key: "Boss", status: "Upcoming" },
    ];

  const available = blinds.filter((b) => {
    const s = (b.status ?? "").toLowerCase();
    return s !== "defeated" && s !== "hide" && s !== "hidden";
  });

  const selectable = available.filter((b) => {
    const s = (b.status ?? "").toLowerCase();
    return s === "select" || s === "current";
  });
  const targets =
    selectable.length > 0
      ? selectable
      : available.filter(
          (b) =>
            !state.blind_on_deck ||
            b.id.toLowerCase() === state.blind_on_deck.toLowerCase(),
        );
  const list = targets.length > 0 ? targets : available.slice(0, 1);

  for (const blind of list) {
    actions.push({
      id: `select_blind_${blind.id}`,
      kind: "select_blind",
      label: `Select ${blind.name}`,
      what: `Enter ${blind.name}${blind.chips != null ? ` (need ${blind.chips} chips)` : ""} and play the round.`,
      not_for: "Skipping this blind or selecting a different blind.",
      score:
        (blind.status ?? "").toLowerCase() === "select"
          ? 200
          : blind.id === "boss"
            ? 120
            : 150,
      params: {
        blind_id: blind.id,
        native_key: blind.native_key ?? capitalize(blind.id),
      },
    });

    const skippable =
      blind.skippable != null
        ? blind.skippable
        : blind.id === "big" || blind.id === "small";
    if (skippable && blind.id !== "boss") {
      actions.push({
        id: `skip_blind_${blind.id}`,
        kind: "skip_blind",
        label: `Skip ${blind.name}`,
        what: `Skip ${blind.name} to take its skip tag and advance.`,
        not_for: "Selecting and playing this blind.",
        score: 80,
        params: {
          blind_id: blind.id,
          native_key: blind.native_key ?? capitalize(blind.id),
        },
      });
    }
  }

  return actions;
}

function shopActions(state: BalatroState): LegalAction[] {
  const actions: LegalAction[] = [];

  for (const item of state.shop ?? []) {
    if (item.cost <= state.money) {
      actions.push({
        id: `buy_${item.area ?? "shop"}_${item.slot ?? item.index}`,
        kind: "buy",
        label: `Buy ${item.name} ($${item.cost})`,
        what: `Purchase ${item.name} (${item.kind}) for $${item.cost}.`,
        not_for: "Leaving, rerolling, or buying a different offer.",
        score: 100 + (item.kind === "joker" ? 40 : 10) - item.cost,
        params: {
          shop_index: item.index,
          shop_area: item.area ?? "shop_jokers",
          shop_slot: item.slot ?? item.index,
          item_id: item.id,
          item_kind: item.kind,
        },
      });
    }
  }

  for (const j of state.jokers ?? []) {
    actions.push({
      id: `sell_joker_${j.index}`,
      kind: "sell",
      label: `Sell ${j.name}${j.sell_value != null ? ` ($${j.sell_value})` : ""}`,
      what: `Sell joker ${j.name}${j.effect ? ` — ${j.effect}` : ""}.`,
      not_for: "Keeping this joker or selling a different card.",
      score: 40 + (j.sell_value ?? 0),
      params: { target: "joker", index: j.index },
    });
  }

  for (const c of state.consumables ?? []) {
    actions.push({
      id: `use_consumable_${c.index}`,
      kind: "use_consumable",
      label: `Use ${c.name}`,
      what: `Use consumable ${c.name}${c.effect ? ` — ${c.effect}` : ""}.`,
      not_for: "Selling this consumable or leaving it unused.",
      score: 70,
      params: { target: "consumable", index: c.index },
    });
    actions.push({
      id: `sell_consumable_${c.index}`,
      kind: "sell",
      label: `Sell ${c.name}${c.sell_value != null ? ` ($${c.sell_value})` : ""}`,
      what: `Sell consumable ${c.name} for cash.`,
      not_for: "Using this consumable.",
      score: 35 + (c.sell_value ?? 0),
      params: { target: "consumable", index: c.index },
    });
  }

  const rerollCost = state.reroll_cost;
  if (rerollCost == null || rerollCost <= state.money) {
    actions.push({
      id: "reroll_shop",
      kind: "reroll",
      label: rerollCost != null ? `Reroll shop ($${rerollCost})` : "Reroll shop",
      what: `Pay to refresh shop offers${rerollCost != null ? ` ($${rerollCost})` : ""}.`,
      not_for: "Buying a current offer or leaving the shop.",
      score: 30,
      params: { reroll_cost: rerollCost ?? null },
    });
  }

  if (state.shop_can_leave !== false) {
    actions.push({
      id: "leave_shop",
      kind: "leave_shop",
      label: "Leave shop (next round)",
      what: "Leave the shop and continue to the next blind.",
      not_for: "Buying, selling, using, or rerolling in this shop visit.",
      score: 60,
      params: {},
    });
  }

  return actions;
}

/** Derive the full legal action set. Always regenerates (ignores fixture stubs). */
export function deriveLegalActions(state: BalatroState): LegalAction[] {
  const actions: LegalAction[] = [];

  switch (state.phase) {
    case "blind_select":
      actions.push(...blindActions(state));
      break;
    case "hand":
      actions.push(...handActions(state));
      break;
    case "shop":
      actions.push(...shopActions(state));
      break;
    case "pack_open": {
      for (const card of state.pack ?? []) {
        actions.push({
          id: `pack_select_${card.index}`,
          kind: "pack_select",
          label: `Take ${card.name}`,
          what: `Take ${card.name} from the opened pack${card.effect ? ` — ${card.effect}` : ""}.`,
          not_for: "Skipping the pack or taking a different card.",
          score: 100,
          params: { pack_index: card.index, item_id: card.id },
        });
      }
      actions.push({
        id: "pack_skip",
        kind: "pack_skip",
        label: "Skip booster pack",
        what: "Skip the remaining pack choices.",
        not_for: "Taking a card from the pack.",
        score: 40,
        params: {},
      });
      break;
    }
    case "round_eval":
      // Lua only emits round_eval when cash_out_button is ready; still gate.
      if (state.cash_out_ready === false) break;
      actions.push({
        id: "cash_out",
        kind: "cash_out",
        label: "Cash out (enter shop)",
        what: "Collect payout and enter the shop.",
        not_for: "Any other round-eval action.",
        score: 100,
        params: {},
      });
      break;
    case "game_over":
      actions.push({
        id: "new_run",
        kind: "new_run",
        label: "Start a new run",
        what: "Start a fresh Balatro run after game over.",
        not_for: "Returning to the main menu.",
        score: 100,
        params: {},
      });
      actions.push({
        id: "go_to_menu",
        kind: "go_to_menu",
        label: "Return to main menu",
        what: "Leave the run and go to the title menu.",
        not_for: "Starting a new run immediately.",
        score: 50,
        params: {},
      });
      break;
    case "menu":
      actions.push({
        id: "new_run",
        kind: "new_run",
        label: "Start a new run from title",
        what: "Start a new run from the title screen (stake 1).",
        not_for: "Staying on the menu with no run.",
        score: 100,
        params: { stake: 1 },
      });
      break;
    case "unknown":
    default: {
      if (
        state.has_blind_select_ui ||
        state.blinds?.some((b) => {
          const s = (b.status ?? "").toLowerCase();
          return s === "select" || s === "current";
        })
      ) {
        actions.push(...blindActions({ ...state, phase: "blind_select" }));
        break;
      }
      if (state.hand && state.hand.length > 0) {
        actions.push(...handActions({ ...state, phase: "hand" }));
        break;
      }
      if (state.shop && state.shop.length > 0) {
        actions.push(...shopActions({ ...state, phase: "shop" }));
        break;
      }
      if (state.pack && state.pack.length > 0) {
        for (const card of state.pack) {
          actions.push({
            id: `pack_select_${card.index}`,
            kind: "pack_select",
            label: `Take ${card.name}`,
            what: `Take ${card.name} from the pack.`,
            not_for: "Skipping the pack.",
            score: 100,
            params: { pack_index: card.index, item_id: card.id },
          });
        }
        actions.push({
          id: "pack_skip",
          kind: "pack_skip",
          label: "Skip booster pack",
          what: "Skip the pack.",
          not_for: "Taking a pack card.",
          score: 40,
          params: {},
        });
        break;
      }
      actions.push({
        id: "noop",
        kind: "noop",
        label: "No-op (phase not actionable yet)",
        what: "Wait; no actionable phase yet.",
        not_for: "Any real game action.",
        score: 0,
        params: {
          phase: state.phase,
          raw_state_name: state.raw_state_name ?? null,
        },
      });
      break;
    }
  }

  return truncateToChoiceCap(ensureNoop(uniqActions(actions), state.phase));
}

export function toChoiceCriteria(
  actions: LegalAction[],
): Record<string, { what: string; not_for: string }> {
  const criteria: Record<string, { what: string; not_for: string }> = {};
  for (const a of actions) {
    criteria[a.id] = {
      what: a.what ?? a.label,
      not_for: a.not_for ?? "Any other listed action.",
    };
  }
  return criteria;
}
