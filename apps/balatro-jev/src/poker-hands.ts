import type { CardRef } from "./types.js";

export const HAND_STRENGTH: Record<string, number> = {
  straight_flush: 900,
  four: 800,
  full_house: 700,
  flush: 600,
  straight: 500,
  three: 400,
  two_pair: 300,
  pair: 200,
  high_card: 100,
  flush_draw: 80,
  straight_draw: 70,
  garbage: 10,
};

export type MadeHandType =
  | "straight_flush"
  | "four"
  | "full_house"
  | "flush"
  | "straight"
  | "three"
  | "two_pair"
  | "pair"
  | "high_card";

export interface RankedCombo {
  indices: number[];
  handType: string;
  strength: number;
  cardsKey: string;
  label: string;
  made: boolean;
}

export function rankValue(rank: string): number {
  const map: Record<string, number> = {
    Ace: 14, A: 14, King: 13, K: 13, Queen: 12, Q: 12, Jack: 11, J: 11, "10": 10,
  };
  if (map[rank] != null) return map[rank]!;
  const n = Number(rank);
  return Number.isFinite(n) ? n : 0;
}

export function shortRank(rank: string): string {
  const v = rankValue(rank);
  if (v === 14) return "A";
  if (v === 13) return "K";
  if (v === 12) return "Q";
  if (v === 11) return "J";
  return String(v || rank);
}

export function shortSuit(suit: string): string {
  return suit[0]?.toUpperCase() ?? "?";
}

export function cardToken(c: CardRef): string {
  return `${shortRank(c.rank)}${shortSuit(c.suit)}`;
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const out: T[][] = [];
  const rec = (start: number, picked: T[]) => {
    if (picked.length === k) {
      out.push([...picked]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      picked.push(items[i]!);
      rec(i + 1, picked);
      picked.pop();
    }
  };
  rec(0, []);
  return out;
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

function tiebreak(distinctDesc: number[], byRank: Map<number, number>): number {
  const ranked = [...byRank.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  let s = 0;
  let place = 1;
  for (const [v] of ranked) {
    s += v * place;
    place *= 0.01;
  }
  for (const v of distinctDesc) {
    s += v * place;
    place *= 0.01;
  }
  return s;
}

function isStraightRanks(distinctDesc: number[]): boolean {
  if (distinctDesc.length < 5) return false;
  const uniq = uniqueSorted(distinctDesc);
  if (uniq.length !== 5) return false;
  const isSeq = (arr: number[]) => {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i]! !== arr[i - 1]! + 1) return false;
    }
    return true;
  };
  if (isSeq(uniq)) return true;
  if (uniq.includes(14)) {
    const wheel = uniqueSorted(uniq.map((v) => (v === 14 ? 1 : v)));
    return wheel.length === 5 && isSeq(wheel);
  }
  return false;
}

export function classifyPlayed(cards: CardRef[]): {
  handType: MadeHandType;
  strength: number;
} {
  if (cards.length === 0) {
    return { handType: "high_card", strength: HAND_STRENGTH.high_card };
  }
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit.toLowerCase());
  const byRank = new Map<number, number>();
  for (const v of values) byRank.set(v, (byRank.get(v) ?? 0) + 1);
  const counts = [...byRank.values()].sort((a, b) => b - a);
  const distinct = [...byRank.keys()].sort((a, b) => b - a);
  const isFlush = cards.length >= 5 && suits.every((s) => s === suits[0]);
  const isStraight = cards.length >= 5 && isStraightRanks(distinct);
  const kick = tiebreak(distinct, byRank);
  if (isFlush && isStraight) {
    return { handType: "straight_flush", strength: HAND_STRENGTH.straight_flush + kick };
  }
  if (counts[0] === 4) return { handType: "four", strength: HAND_STRENGTH.four + kick };
  if (counts[0] === 3 && counts[1] === 2) {
    return { handType: "full_house", strength: HAND_STRENGTH.full_house + kick };
  }
  if (isFlush) return { handType: "flush", strength: HAND_STRENGTH.flush + kick };
  if (isStraight) return { handType: "straight", strength: HAND_STRENGTH.straight + kick };
  if (counts[0] === 3) return { handType: "three", strength: HAND_STRENGTH.three + kick };
  if (counts[0] === 2 && counts[1] === 2) {
    return { handType: "two_pair", strength: HAND_STRENGTH.two_pair + kick };
  }
  if (counts[0] === 2) return { handType: "pair", strength: HAND_STRENGTH.pair + kick };
  return { handType: "high_card", strength: HAND_STRENGTH.high_card + kick };
}

function toCombo(
  cards: CardRef[],
  handType: string,
  strength: number,
  made: boolean,
): RankedCombo {
  const sorted = [...cards].sort(
    (a, b) => rankValue(b.rank) - rankValue(a.rank) || a.index - b.index,
  );
  const indices = sorted.map((c) => c.index);
  const tokens = sorted.map(cardToken);
  return {
    indices,
    handType,
    strength,
    cardsKey: tokens.join("_"),
    label: `${handType.replace(/_/g, " ")}: ${tokens.join(" ")}`,
    made,
  };
}

/** Every made hand (pair+) + draws + ranked high-cards. Cap at 255 later. */
export function enumeratePlayCombos(hand: CardRef[]): RankedCombo[] {
  if (hand.length === 0) return [];
  const bestByKey = new Map<string, RankedCombo>();
  const consider = (combo: RankedCombo) => {
    const key = [...combo.indices].sort((a, b) => a - b).join(",");
    const prev = bestByKey.get(key);
    if (!prev || combo.strength > prev.strength) bestByKey.set(key, combo);
  };
  const maxPlay = Math.min(5, hand.length);
  for (let k = 1; k <= maxPlay; k++) {
    for (const subset of combinations(hand, k)) {
      const { handType, strength } = classifyPlayed(subset);
      if (handType === "high_card" && k !== 1 && k !== Math.min(5, hand.length)) {
        continue;
      }
      consider(toCombo(subset, handType, strength, handType !== "high_card"));
    }
  }
  const bySuit = new Map<string, CardRef[]>();
  for (const c of hand) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(c);
    bySuit.set(c.suit, list);
  }
  for (const list of bySuit.values()) {
    if (list.length >= 4 && list.length < 5) {
      const top = [...list]
        .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
        .slice(0, 4);
      consider(
        toCombo(
          top,
          "flush_draw",
          HAND_STRENGTH.flush_draw + rankValue(top[0]!.rank) * 0.1 + list.length,
          false,
        ),
      );
    }
  }
  const distinctCards = [...hand].sort(
    (a, b) => rankValue(a.rank) - rankValue(b.rank),
  );
  for (const subset of combinations(distinctCards, 4)) {
    const vals = uniqueSorted(subset.map((c) => rankValue(c.rank)));
    if (vals.length !== 4) continue;
    let ok = true;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i]! - vals[i - 1]! > 2) {
        ok = false;
        break;
      }
    }
    const span = vals[vals.length - 1]! - vals[0]!;
    if (ok && span <= 4) {
      consider(
        toCombo(
          subset,
          "straight_draw",
          HAND_STRENGTH.straight_draw + vals[vals.length - 1]! * 0.1,
          false,
        ),
      );
    }
  }
  const all = [...bestByKey.values()].sort((a, b) => b.strength - a.strength);
  const kept: RankedCombo[] = [];
  const seen = new Set<string>();
  const push = (c: RankedCombo) => {
    const key = [...c.indices].sort((a, b) => a - b).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    kept.push(c);
  };
  for (const c of all) if (c.made) push(c);
  for (const c of all) {
    if (!c.made && (c.handType === "flush_draw" || c.handType === "straight_draw")) {
      push(c);
    }
  }
  let highKept = 0;
  for (const c of all) {
    if (c.made || c.handType === "flush_draw" || c.handType === "straight_draw") continue;
    if (highKept >= 12) break;
    push(c);
    highKept += 1;
  }
  return kept.sort((a, b) => b.strength - a.strength);
}

export function enumerateDiscardCombos(hand: CardRef[]): RankedCombo[] {
  if (hand.length === 0) return [];
  const plays = enumeratePlayCombos(hand);
  const bestMade = plays.find((p) => p.made);
  const bestDraw = plays.find(
    (p) => p.handType === "flush_draw" || p.handType === "straight_draw",
  );
  const keepSet = new Set(
    (bestMade ?? bestDraw)?.indices ??
      [...hand]
        .sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
        .slice(0, 2)
        .map((c) => c.index),
  );
  const dead = hand.filter((c) => !keepSet.has(c.index));
  const out: RankedCombo[] = [];
  const pushDead = (cards: CardRef[], reason: string, strength: number) => {
    if (cards.length === 0) return;
    const sorted = [...cards].sort(
      (a, b) => rankValue(a.rank) - rankValue(b.rank),
    );
    out.push(
      toCombo(sorted.slice(0, Math.min(5, sorted.length)), reason, strength, false),
    );
  };
  if (dead.length > 0) {
    pushDead(dead, "dead_cards", 50 + dead.length);
    const lowest = [...dead].sort(
      (a, b) => rankValue(a.rank) - rankValue(b.rank),
    );
    // Curated discard sizes (not all C(n,k) — keeps Choice focused).
    pushDead(lowest.slice(0, 1), "low_dead", 40);
    if (lowest.length >= 2) pushDead(lowest.slice(0, 2), "low_dead", 45);
    if (lowest.length >= 3) pushDead(lowest.slice(0, 3), "low_dead", 48);
    if (lowest.length >= 5) pushDead(lowest.slice(0, 5), "low_dead", 49);
  }
  const bySuit = new Map<string, CardRef[]>();
  for (const c of hand) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(c);
    bySuit.set(c.suit, list);
  }
  let bestSuit: string | null = null;
  let bestSuitCount = 0;
  for (const [suit, list] of bySuit) {
    if (list.length > bestSuitCount) {
      bestSuitCount = list.length;
      bestSuit = suit;
    }
  }
  if (bestSuit && bestSuitCount >= 3) {
    const off = hand.filter((c) => c.suit !== bestSuit);
    pushDead(off, "off_suit", 55 + bestSuitCount);
    const lowestOff = [...off].sort(
      (a, b) => rankValue(a.rank) - rankValue(b.rank),
    );
    if (lowestOff.length >= 2) {
      pushDead(lowestOff.slice(0, 2), "off_suit", 54);
    }
  }
  const seen = new Set<string>();
  const uniq: RankedCombo[] = [];
  for (const c of out.sort((a, b) => b.strength - a.strength)) {
    const key = [...c.indices].sort((a, b) => a - b).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(c);
    if (uniq.length >= 12) break;
  }
  return uniq;
}

export function pickBestHandAction(
  hand: CardRef[],
  opts: { handsLeft: number; discardsLeft: number },
): { kind: "play_hand" | "discard"; combo: RankedCombo } | null {
  const plays = enumeratePlayCombos(hand);
  const discards = enumerateDiscardCombos(hand);
  const bestPlay = plays[0];
  if (!bestPlay) return null;
  const hasMade = plays.some((p) => p.made && p.handType !== "high_card");
  const strongMade = plays.find(
    (p) =>
      p.made &&
      [
        "straight_flush", "four", "full_house", "flush", "straight",
        "three", "two_pair", "pair",
      ].includes(p.handType),
  );
  const bestDraw = plays.find(
    (p) => p.handType === "flush_draw" || p.handType === "straight_draw",
  );
  if (opts.handsLeft > 0 && strongMade) {
    return { kind: "play_hand", combo: strongMade };
  }
  if (opts.discardsLeft > 0 && !hasMade && bestDraw && discards[0]) {
    return { kind: "discard", combo: discards[0] };
  }
  if (opts.handsLeft > 0) return { kind: "play_hand", combo: bestPlay };
  if (opts.discardsLeft > 0 && discards[0]) {
    return { kind: "discard", combo: discards[0] };
  }
  return { kind: "play_hand", combo: bestPlay };
}

export function actionId(kind: "play" | "discard", combo: RankedCombo): string {
  return `${kind}_${combo.handType}_${combo.cardsKey}`
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 80);
}
