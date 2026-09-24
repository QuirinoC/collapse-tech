import type {
  BalatroState,
  CardRef,
  LegalAction,
} from "./types.js";

function cardLabel(state: BalatroState, index: number): string {
  const c = state.hand?.find((h) => h.index === index);
  if (!c) return `#${index}`;
  return `${c.rank}${c.suit[0]?.toUpperCase() ?? ""}`;
}

function comboId(kind: string, indices: number[]): string {
  return `${kind}_${indices.join("_") || "none"}`;
}

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

function rankValue(rank: string): number {
  const map: Record<string, number> = {
    Ace: 14,
    A: 14,
    King: 13,
    K: 13,
    Queen: 12,
    Q: 12,
    Jack: 11,
    J: 11,
    "10": 10,
  };
  if (map[rank] != null) return map[rank]!;
  const n = Number(rank);
  return Number.isFinite(n) ? n : 0;
}

/** Build a few play/discard candidate index sets without exploding C(n,k). */
function handCandidates(hand: CardRef[]): number[][] {
  if (hand.length === 0) return [];
  const byRank = [...hand].sort(
    (a, b) => rankValue(b.rank) - rankValue(a.rank),
  );
  const indices = hand.map((c) => c.index);
  const top = (n: number) => byRank.slice(0, Math.min(n, byRank.length)).map((c) => c.index);
  const bottom = (n: number) =>
    [...byRank]
      .reverse()
      .slice(0, Math.min(n, byRank.length))
      .map((c) => c.index);

  const out: number[][] = [];
  const push = (xs: number[]) => {
    if (xs.length === 0) return;
    const key = [...xs].sort((a, b) => a - b).join(",");
    if (out.some((y) => [...y].sort((a, b) => a - b).join(",") === key)) return;
    out.push(xs);
  };

  push(top(Math.min(5, hand.length)));
  push(top(Math.min(4, hand.length)));
  push(top(Math.min(3, hand.length)));
  push(top(1));
  push(indices.slice(0, Math.min(5, indices.length)));
  push(bottom(Math.min(5, hand.length)));
  push(bottom(Math.min(2, hand.length)));

  // Same-suit flush draw (up to 5)
  const bySuit = new Map<string, number[]>();
  for (const c of hand) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(c.index);
    bySuit.set(c.suit, list);
  }
  for (const list of bySuit.values()) {
    if (list.length >= 3) push(list.slice(0, Math.min(5, list.length)));
  }

  // Pair / trips by rank
  const byR = new Map<string, number[]>();
  for (const c of hand) {
    const list = byR.get(c.rank) ?? [];
    list.push(c.index);
    byR.set(c.rank, list);
  }
  for (const list of byR.values()) {
    if (list.length >= 2) push(list.slice(0, Math.min(5, list.length)));
  }

  return out.slice(0, 10);
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

/** Derive legal actions when the mod did not supply them. */
export function deriveLegalActions(state: BalatroState): LegalAction[] {
  if (state.legal_actions && state.legal_actions.length > 0) {
    return state.legal_actions;
  }

  const actions: LegalAction[] = [];

  switch (state.phase) {
    case "blind_select": {
      const onDeck = (state.blind_on_deck ?? "small").toLowerCase();
      const blinds =
        state.blinds ??
        [
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
          params: {
            blind_id: current.id,
            native_key: current.native_key ?? capitalize(current.id),
          },
        });
        // Small and Big are skippable in vanilla; Boss is not.
        const skippable =
          current.skippable != null
            ? current.skippable
            : current.id === "big" || current.id === "small";
        if (skippable && current.id !== "boss") {
          actions.push({
            id: `skip_blind_${current.id}`,
            kind: "skip_blind",
            label: `Skip ${current.name}`,
            params: {
              blind_id: current.id,
              native_key: current.native_key ?? capitalize(current.id),
            },
          });
        }
      } else {
        for (const blind of blinds) {
          actions.push({
            id: `select_blind_${blind.id}`,
            kind: "select_blind",
            label: `Select ${blind.name}`,
            params: {
              blind_id: blind.id,
              native_key: blind.native_key ?? capitalize(blind.id),
            },
          });
          if (blind.skippable) {
            actions.push({
              id: `skip_blind_${blind.id}`,
              kind: "skip_blind",
              label: `Skip ${blind.name}`,
              params: {
                blind_id: blind.id,
                native_key: blind.native_key ?? capitalize(blind.id),
              },
            });
          }
        }
      }
      break;
    }
    case "hand": {
      const hand = state.hand ?? [];
      const selected =
        state.selected && state.selected.length > 0
          ? state.selected
          : null;

      const candidates = handCandidates(hand);
      if (selected) candidates.unshift(selected);

      const handsLeft = state.hands_left ?? 1;
      const discardsLeft = state.discards_left ?? 0;

      for (const idxs of candidates) {
        if (handsLeft > 0) {
          const names = idxs.map((i) => cardLabel(state, i)).join(" ");
          actions.push({
            id: comboId("play", idxs),
            kind: "play_hand",
            label: `Play [${names}]`,
            params: { card_indices: idxs },
          });
        }
        if (discardsLeft > 0) {
          const names = idxs.map((i) => cardLabel(state, i)).join(" ");
          actions.push({
            id: comboId("discard", idxs),
            kind: "discard",
            label: `Discard [${names}]`,
            params: { card_indices: idxs },
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
        label:
          rerollCost != null ? `Reroll shop ($${rerollCost})` : "Reroll shop",
        params: { reroll_cost: rerollCost ?? null },
      });
      actions.push({
        id: "leave_shop",
        kind: "leave_shop",
        label: "Leave shop (next round)",
        params: {},
      });
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
      actions.push({
        id: "pack_skip",
        kind: "pack_skip",
        label: "Skip booster pack",
        params: {},
      });
      break;
    }
    case "round_eval": {
      actions.push({
        id: "cash_out",
        kind: "cash_out",
        label: "Cash out (enter shop)",
        params: {},
      });
      break;
    }
    case "game_over": {
      actions.push({
        id: "new_run",
        kind: "new_run",
        label: "Start a new run",
        params: {},
      });
      actions.push({
        id: "go_to_menu",
        kind: "go_to_menu",
        label: "Return to main menu",
        params: {},
      });
      break;
    }
    case "unknown":
    default:
      actions.push({
        id: "noop",
        kind: "noop",
        label: "No-op (phase not actionable yet)",
        params: { phase: state.phase },
      });
      break;
  }

  return ensureNoop(uniqActions(actions), state.phase);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
