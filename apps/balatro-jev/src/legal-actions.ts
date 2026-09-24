import type {
  BalatroState,
  LegalAction,
} from "./types.js";
import {
  actionId,
  enumerateDiscardCombos,
  enumeratePlayCombos,
  type RankedCombo,
} from "./poker-hands.js";

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
      params: { phase },
    },
  ];
}

function playAction(combo: RankedCombo): LegalAction {
  return {
    id: actionId("play", combo),
    kind: "play_hand",
    label: `Play ${combo.label}`,
    params: {
      card_indices: combo.indices,
      hand_type: combo.handType,
      strength: combo.strength,
      made: combo.made,
    },
  };
}

function discardAction(combo: RankedCombo): LegalAction {
  return {
    id: actionId("discard", combo),
    kind: "discard",
    label: `Discard ${combo.label}`,
    params: {
      card_indices: combo.indices,
      hand_type: combo.handType,
      strength: combo.strength,
    },
  };
}

export function deriveHandActions(state: BalatroState): LegalAction[] {
  const hand = state.hand ?? [];
  if (hand.length === 0) return [];
  const handsLeft = state.hands_left ?? 1;
  const discardsLeft = state.discards_left ?? 0;
  const actions: LegalAction[] = [];
  if (handsLeft > 0) {
    for (const combo of enumeratePlayCombos(hand)) actions.push(playAction(combo));
  }
  if (discardsLeft > 0) {
    for (const combo of enumerateDiscardCombos(hand)) actions.push(discardAction(combo));
  }
  if (state.selected && state.selected.length > 0 && handsLeft > 0) {
    const idxs = state.selected;
    const cards = hand.filter((c) => idxs.includes(c.index));
    if (cards.length > 0) {
      const combo = enumeratePlayCombos(cards)[0];
      if (combo) {
        actions.unshift({
          ...playAction(combo),
          id: `play_selected_${combo.handType}_${combo.cardsKey}`.replace(/[^a-zA-Z0-9_]/g, ""),
          label: `Play selected (${combo.label})`,
        });
      }
    }
  }
  return uniqActions(actions);
}

export function deriveLegalActions(state: BalatroState): LegalAction[] {
  if (state.phase === "hand") {
    return ensureNoop(deriveHandActions(state), state.phase);
  }
  if (state.legal_actions && state.legal_actions.length > 0) {
    return state.legal_actions;
  }
  const actions: LegalAction[] = [];
  switch (state.phase) {
    case "blind_select": {
      const onDeck = (state.blind_on_deck ?? "small").toLowerCase();
      const blinds = state.blinds ?? [
        { id: "small", name: "Small Blind", skippable: false, native_key: "Small" },
        { id: "big", name: "Big Blind", skippable: true, native_key: "Big" },
        { id: "boss", name: "Boss Blind", skippable: false, native_key: "Boss" },
      ];
      const current =
        blinds.find((b) => b.id.toLowerCase() === onDeck) ??
        blinds.find((b) => (b.status ?? "").toLowerCase() === "select") ??
        blinds[0];
      if (current) {
        actions.push({
          id: `select_blind_${current.id}`,
          kind: "select_blind",
          label: `Select ${current.name}`,
          params: { blind_id: current.id, native_key: current.native_key ?? capitalize(current.id) },
        });
        const skippable = current.skippable != null ? current.skippable : current.id === "big" || current.id === "small";
        if (skippable && current.id !== "boss") {
          actions.push({
            id: `skip_blind_${current.id}`,
            kind: "skip_blind",
            label: `Skip ${current.name}`,
            params: { blind_id: current.id, native_key: current.native_key ?? capitalize(current.id) },
          });
        }
      }
      break;
    }
    case "shop": {
      for (const item of state.shop ?? []) {
        if (item.cost <= state.money) {
          actions.push({
            id: `buy_${item.area ?? "shop"}_${item.slot ?? item.index}`,
            kind: "buy",
            label: `Buy ${item.name} ($${item.cost})`,
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
          params: { target: "joker", index: j.index },
        });
      }
      for (const c of state.consumables ?? []) {
        actions.push({
          id: `use_consumable_${c.index}`,
          kind: "use_consumable",
          label: `Use ${c.name}`,
          params: { target: "consumable", index: c.index },
        });
        actions.push({
          id: `sell_consumable_${c.index}`,
          kind: "sell",
          label: `Sell ${c.name}${c.sell_value != null ? ` ($${c.sell_value})` : ""}`,
          params: { target: "consumable", index: c.index },
        });
      }
      const rerollCost = state.reroll_cost;
      actions.push({
        id: "reroll_shop",
        kind: "reroll",
        label: rerollCost != null ? `Reroll shop ($${rerollCost})` : "Reroll shop",
        params: { reroll_cost: rerollCost ?? null },
      });
      actions.push({ id: "leave_shop", kind: "leave_shop", label: "Leave shop (next round)", params: {} });
      break;
    }
    case "pack_open": {
      for (const card of state.pack ?? []) {
        actions.push({
          id: `pack_select_${card.index}`,
          kind: "pack_select",
          label: `Take ${card.name}`,
          params: { pack_index: card.index, item_id: card.id },
        });
      }
      actions.push({ id: "pack_skip", kind: "pack_skip", label: "Skip booster pack", params: {} });
      break;
    }
    case "round_eval": {
      actions.push({ id: "cash_out", kind: "cash_out", label: "Cash out (enter shop)", params: {} });
      break;
    }
    case "game_over": {
      actions.push({ id: "new_run", kind: "new_run", label: "Start a new run", params: {} });
      actions.push({ id: "go_to_menu", kind: "go_to_menu", label: "Return to main menu", params: {} });
      break;
    }
    case "menu": {
      actions.push({ id: "new_run", kind: "new_run", label: "Start a new run from title", params: { stake: 1 } });
      break;
    }
    case "unknown":
    default: {
      const selectBlind = state.blinds?.find((b) => {
        const s = (b.status ?? "").toLowerCase();
        return s === "select" || s === "current";
      });
      if (selectBlind || state.has_blind_select_ui) {
        const current = selectBlind ?? state.blinds?.[0];
        if (current) {
          actions.push({
            id: `select_blind_${current.id}`,
            kind: "select_blind",
            label: `Select ${current.name}`,
            params: { blind_id: current.id, native_key: current.native_key ?? capitalize(current.id) },
          });
          const skippable = current.skippable != null ? current.skippable : current.id === "big" || current.id === "small";
          if (skippable && current.id !== "boss") {
            actions.push({
              id: `skip_blind_${current.id}`,
              kind: "skip_blind",
              label: `Skip ${current.name}`,
              params: { blind_id: current.id, native_key: current.native_key ?? capitalize(current.id) },
            });
          }
          break;
        }
      }
      actions.push({
        id: "noop",
        kind: "noop",
        label: "No-op (phase not actionable yet)",
        params: { phase: state.phase, raw_state_name: state.raw_state_name ?? null },
      });
      break;
    }
  }
  return ensureNoop(uniqActions(actions), state.phase);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function toChoiceCriteria(actions: LegalAction[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const a of actions) {
    const handType = a.params?.hand_type;
    const made = a.params?.made;
    if (a.kind === "play_hand" && typeof handType === "string") {
      const tier =
        made === true
          ? "MADE poker hand — prefer over draws and high card"
          : handType.includes("draw")
            ? "DRAW — only if no made hand is available"
            : "WEAK — last resort high card / filler";
      const idxs = (a.params?.card_indices as number[] | undefined)?.join(",") ?? "";
      criteria[a.id] = `${a.label}. ${tier}. Plays cards at indices [${idxs}].`;
    } else if (a.kind === "discard" && typeof handType === "string") {
      const idxs = (a.params?.card_indices as number[] | undefined)?.join(",") ?? "";
      criteria[a.id] = `${a.label}. DISCARD dead/off-suit cards to chase a better hand. Prefer dumping lowest dead cards while keeping pairs/flush/straight potential. Indices [${idxs}].`;
    } else {
      criteria[a.id] = a.label;
    }
  }
  return criteria;
}
