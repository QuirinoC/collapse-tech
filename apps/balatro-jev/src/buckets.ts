import type { JsonValue } from "@typesafe-ai/sdk";
import type { BalatroState, CardRef, LegalAction } from "./types.js";

export function chipPressure(state: BalatroState): string {
  const need = state.chips_needed;
  const scored = state.chips_scored ?? 0;
  if (need == null || need <= 0) return "unknown";
  const ratio = scored / need;
  if (ratio <= 0) return "none";
  if (ratio < 0.25) return "far_behind";
  if (ratio < 0.6) return "behind";
  if (ratio < 1) return "close";
  return "cleared";
}

export function moneyBucket(money: number): string {
  if (money <= 0) return "broke";
  if (money < 5) return "tight";
  if (money < 15) return "ok";
  if (money < 40) return "comfortable";
  return "rich";
}

export function resourceBucket(n: number | undefined, label: string): string {
  if (n == null) return `unknown_${label}`;
  if (n <= 0) return `no_${label}`;
  if (n === 1) return `one_${label}`;
  if (n <= 2) return `few_${label}`;
  return `many_${label}`;
}

function compactCard(c: CardRef): { [key: string]: JsonValue } {
  return {
    index: c.index,
    rank: c.rank,
    suit: c.suit,
    enhancement: c.enhancement ?? null,
    edition: c.edition ?? null,
    seal: c.seal ?? null,
    chip_value: c.chip_value ?? null,
    token: `${c.rank}${c.suit[0]?.toUpperCase() ?? "?"}`,
  };
}

/** Rich named JSON for System One — full run context for every phase. */
export function toSemanticState(
  state: BalatroState,
  legalActions: LegalAction[],
): { [key: string]: JsonValue } {
  return {
    game: "balatro",
    phase: state.phase,
    ante: state.ante,
    round: state.round,
    blind: {
      on_deck: state.blind_on_deck ?? null,
      type: state.blind_type ?? null,
      chips_needed: state.chips_needed ?? null,
      chips_scored: state.chips_scored ?? null,
      chip_pressure: chipPressure(state),
      options: (state.blinds ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status ?? null,
        skippable: b.skippable ?? null,
        chips: b.chips ?? null,
      })),
    },
    money: moneyBucket(state.money),
    money_exact: state.money,
    chip_pressure: chipPressure(state),
    chips_needed: state.chips_needed ?? null,
    chips_scored: state.chips_scored ?? null,
    hands_left: state.hands_left ?? null,
    discards_left: state.discards_left ?? null,
    hands: resourceBucket(state.hands_left, "hands"),
    discards: resourceBucket(state.discards_left, "discards"),
    hand: (state.hand ?? []).map(compactCard),
    selected: state.selected ?? [],
    jokers: (state.jokers ?? []).map((j) => ({
      index: j.index,
      id: j.id,
      name: j.name,
      effect: j.effect ?? null,
      sell_value: j.sell_value ?? null,
    })),
    consumables: (state.consumables ?? []).map((c) => ({
      index: c.index,
      id: c.id,
      name: c.name,
      set: c.set ?? null,
      effect: c.effect ?? null,
      sell_value: c.sell_value ?? null,
    })),
    shop: {
      offers: (state.shop ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        cost: s.cost,
        area: s.area ?? null,
        slot: s.slot ?? s.index,
        affordable: s.cost <= state.money,
      })),
      reroll_cost: state.reroll_cost ?? null,
      can_leave: state.shop_can_leave !== false,
    },
    pack_open: {
      cards: (state.pack ?? []).map((p) => ({
        index: p.index,
        id: p.id,
        name: p.name,
        kind: p.kind ?? null,
        effect: p.effect ?? null,
      })),
      choices_left: state.pack_choices_left ?? null,
    },
    blinds: (state.blinds ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status ?? null,
      skippable: b.skippable ?? null,
    })),
    blind_on_deck: state.blind_on_deck ?? null,
    deck_remaining: state.deck_remaining ?? null,
    legal_action_ids: legalActions.map((a) => a.id),
    legal_action_count: legalActions.length,
    notes: state.notes ?? null,
    objective:
      "Pick the single best currently legal action. Prefer made poker hands (pair+) when playing; clear blinds efficiently; in shop buy strong jokers then leave; in packs take the best card; respect hands/discards left and money.",
  };
}
