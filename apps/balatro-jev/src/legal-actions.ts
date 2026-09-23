import type { BalatroState, LegalAction } from "./types.js";

function cardLabel(state: BalatroState, index: number): string {
  const c = state.hand?.find((h) => h.index === index);
  if (!c) return `#${index}`;
  return `${c.rank}${c.suit[0]?.toUpperCase() ?? ""}`;
}

function comboId(kind: string, indices: number[]): string {
  return `${kind}_${indices.join("_") || "none"}`;
}

/** Derive legal actions when the mod did not supply them. Heuristic / incomplete by design. */
export function deriveLegalActions(state: BalatroState): LegalAction[] {
  if (state.legal_actions && state.legal_actions.length > 0) {
    return state.legal_actions;
  }

  const actions: LegalAction[] = [];

  switch (state.phase) {
    case "blind_select": {
      for (const blind of state.blinds ?? [
        { id: "small", name: "Small Blind", skippable: false },
        { id: "big", name: "Big Blind", skippable: true },
        { id: "boss", name: "Boss Blind", skippable: false },
      ]) {
        actions.push({
          id: `select_blind_${blind.id}`,
          kind: "select_blind",
          label: `Select ${blind.name}`,
          params: { blind_id: blind.id },
        });
        if (blind.skippable) {
          actions.push({
            id: `skip_blind_${blind.id}`,
            kind: "skip_blind",
            label: `Skip ${blind.name}`,
            params: { blind_id: blind.id },
          });
        }
      }
      break;
    }
    case "hand": {
      const hand = state.hand ?? [];
      const selected =
        state.selected && state.selected.length > 0
          ? state.selected
          : hand.slice(0, Math.min(5, hand.length)).map((c) => c.index);

      if ((state.hands_left ?? 1) > 0 && selected.length > 0) {
        const names = selected.map((i) => cardLabel(state, i)).join(" ");
        actions.push({
          id: comboId("play", selected),
          kind: "play_hand",
          label: `Play hand [${names}]`,
          params: { card_indices: selected },
        });
      }
      if ((state.discards_left ?? 0) > 0 && selected.length > 0) {
        const names = selected.map((i) => cardLabel(state, i)).join(" ");
        actions.push({
          id: comboId("discard", selected),
          kind: "discard",
          label: `Discard [${names}]`,
          params: { card_indices: selected },
        });
      }
      // Alternate: play first 1–5 cards individually as candidates when nothing selected.
      if (actions.length === 0 && hand.length > 0) {
        const pick = hand.slice(0, Math.min(5, hand.length)).map((c) => c.index);
        actions.push({
          id: comboId("play", pick),
          kind: "play_hand",
          label: `Play hand [${pick.map((i) => cardLabel(state, i)).join(" ")}]`,
          params: { card_indices: pick },
        });
      }
      break;
    }
    case "shop": {
      for (const item of state.shop ?? []) {
        if (item.cost <= state.money) {
          actions.push({
            id: `buy_${item.kind}_${item.index}`,
            kind: "buy",
            label: `Buy ${item.name} ($${item.cost})`,
            params: { shop_index: item.index, item_id: item.id },
          });
        }
      }
      actions.push({
        id: "reroll_shop",
        kind: "reroll",
        label: "Reroll shop",
        params: {},
      });
      actions.push({
        id: "cash_out",
        kind: "cash_out",
        label: "Leave shop / cash out",
        params: {},
      });
      break;
    }
    case "game_over":
    case "pack_open":
    case "unknown":
    default:
      actions.push({
        id: "noop",
        kind: "noop",
        label: "No-op (phase not wired)",
        params: { phase: state.phase },
      });
      break;
  }

  if (actions.length === 0) {
    actions.push({
      id: "noop",
      kind: "noop",
      label: "No-op (no legal actions derived)",
      params: {},
    });
  }

  return actions;
}

/** Choice criteria must use stable string labels; sanitize if needed. */
export function toChoiceCriteria(
  actions: LegalAction[],
): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const a of actions) {
    criteria[a.id] = a.label;
  }
  return criteria;
}
