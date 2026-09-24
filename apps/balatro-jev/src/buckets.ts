import type { JsonValue } from "@typesafe-ai/sdk";
import type { BalatroState, CardRef, LegalAction } from "./types.js";

/** Bucket chip progress into coarse labels Jev can compare without raw floats. */
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

function compactCard(c: CardRef): string {
  const bits = [`${c.rank}${c.suit[0]?.toUpperCase() ?? "?"}`];
  if (c.enhancement) bits.push(c.enhancement);
  if (c.edition) bits.push(c.edition);
  if (c.seal) bits.push(c.seal);
  return bits.join("+");
}

/**
 * Compact named JSON for System One. Buckets/labels beat raw floats when useful.
 * Keep legal action ids in criteria; put summaries here for judgment context.
 */
export function toSemanticState(
  state: BalatroState,
  legalActions: LegalAction[],
): { [key: string]: JsonValue } {
  return {
    game: "balatro",
    phase: state.phase,
    ante: state.ante,
    round: state.round,
    money: moneyBucket(state.money),
    money_exact: state.money,
    chip_pressure: chipPressure(state),
    chips_needed: state.chips_needed ?? null,
    chips_scored: state.chips_scored ?? null,
    hands: resourceBucket(state.hands_left, "hands"),
    discards: resourceBucket(state.discards_left, "discards"),
    hand: (state.hand ?? []).map(compactCard),
    selected: state.selected ?? [],
    jokers: (state.jokers ?? []).map((j) => j.name || j.id),
    shop: (state.shop ?? []).map((s) => `${s.name}@$${s.cost}`),
    pack: (state.pack ?? []).map((p) => p.name || p.id),
    blinds: (state.blinds ?? []).map((b) => b.name || b.id),
    blind_on_deck: state.blind_on_deck ?? null,
    consumables: (state.consumables ?? []).map((c) => c.name || c.id),
    legal_action_ids: legalActions.map((a) => a.id),
    notes: state.notes ?? null,
    objective:
      "Pick the single best currently legal action to progress a strong Balatro run. Prefer clearing blinds efficiently; in shop buy strong jokers then leave; in packs take the best card; respect hands/discards left and money.",
  };
}
