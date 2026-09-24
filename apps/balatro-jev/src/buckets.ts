import type { JsonValue } from "@typesafe-ai/sdk";
import type { BalatroState, CardRef, LegalAction } from "./types.js";
import { cardToken, enumeratePlayCombos, rankValue } from "./poker-hands.js";

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
  const out: { [key: string]: JsonValue } = {
    i: c.index, card: cardToken(c), rank: c.rank, suit: c.suit, rank_value: rankValue(c.rank),
  };
  if (c.enhancement) out.enhancement = c.enhancement;
  if (c.edition) out.edition = c.edition;
  if (c.seal) out.seal = c.seal;
  return out;
}

function handSummary(state: BalatroState): { [key: string]: JsonValue } {
  const hand = state.hand ?? [];
  const combos = enumeratePlayCombos(hand);
  return {
    size: hand.length,
    cards: hand.map(compactCard),
    best_made: combos.filter((c) => c.made).slice(0, 5).map((c) => `${c.handType}:${c.cardsKey}`),
    draws: combos
      .filter((c) => c.handType === "flush_draw" || c.handType === "straight_draw")
      .slice(0, 3)
      .map((c) => `${c.handType}:${c.cardsKey}`),
    ranks: hand.map((c) => c.rank),
    suits: hand.map((c) => c.suit),
  };
}

export function toSemanticState(
  state: BalatroState,
  legalActions: LegalAction[],
): { [key: string]: JsonValue } {
  const chipsNeeded = state.chips_needed ?? null;
  const chipsScored = state.chips_scored ?? 0;
  const chipsRemaining = chipsNeeded != null ? Math.max(0, chipsNeeded - chipsScored) : null;
  return {
    game: "balatro",
    phase: state.phase,
    ante: state.ante,
    round: state.round,
    money: moneyBucket(state.money),
    money_exact: state.money,
    chip_pressure: chipPressure(state),
    chips_needed: chipsNeeded,
    chips_scored: chipsScored,
    chips_remaining: chipsRemaining,
    hands_left: state.hands_left ?? null,
    discards_left: state.discards_left ?? null,
    hands: resourceBucket(state.hands_left, "hands"),
    discards: resourceBucket(state.discards_left, "discards"),
    hand: handSummary(state),
    selected: state.selected ?? [],
    jokers: (state.jokers ?? []).map((j) => ({ name: j.name || j.id, index: j.index })),
    shop: (state.shop ?? []).map((s) => `${s.name}@$${s.cost}`),
    pack: (state.pack ?? []).map((p) => p.name || p.id),
    blinds: (state.blinds ?? []).map((b) => b.name || b.id),
    blind_on_deck: state.blind_on_deck ?? null,
    consumables: (state.consumables ?? []).map((c) => c.name || c.id),
    legal_action_ids: legalActions.map((a) => a.id),
    play_options: legalActions.filter((a) => a.kind === "play_hand").map((a) => `${a.id} (${a.label})`),
    discard_options: legalActions.filter((a) => a.kind === "discard").map((a) => `${a.id} (${a.label})`),
    notes: state.notes ?? null,
    objective:
      "In hand phase: prefer MADE poker hands (pair, two pair, three, straight, flush, full house, four) over draws; prefer strong draws over garbage high-card plays; discard should dump dead/off-suit cards toward a flush or straight. Elsewhere: clear blinds, buy strong jokers then leave shop, take best pack card.",
    preference_order: "made_hand > flush_or_straight_draw_via_discard > weak_high_card",
  };
}
