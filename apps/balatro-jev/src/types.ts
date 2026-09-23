/** Shared Balatro ↔ bridge types. Keep in sync with mod/balatro_jev JSON shapes. */

export type Phase =
  | "blind_select"
  | "hand"
  | "shop"
  | "pack_open"
  | "game_over"
  | "unknown";

export interface CardRef {
  index: number;
  rank: string;
  suit: string;
  enhancement?: string | null;
  edition?: string | null;
  seal?: string | null;
}

export interface JokerRef {
  index: number;
  id: string;
  name: string;
}

export interface BlindOption {
  id: "small" | "big" | "boss" | string;
  name: string;
  skippable?: boolean;
}

export interface ShopItem {
  index: number;
  kind: "joker" | "consumable" | "voucher" | "pack" | "unknown";
  id: string;
  name: string;
  cost: number;
}

export interface LegalAction {
  /** Stable id used as Choice label (alphanumeric + underscore). */
  id: string;
  kind:
    | "play_hand"
    | "discard"
    | "select_blind"
    | "skip_blind"
    | "buy"
    | "reroll"
    | "cash_out"
    | "use_consumable"
    | "sell"
    | "noop";
  /** Human-readable label for Jev + logs. */
  label: string;
  /** Extra params the Lua apply layer needs. */
  params?: Record<string, unknown>;
}

export interface BalatroState {
  version: 1;
  phase: Phase;
  ante: number;
  round: number;
  money: number;
  chips_needed?: number;
  chips_scored?: number;
  hands_left?: number;
  discards_left?: number;
  hand_size?: number;
  hand?: CardRef[];
  selected?: number[];
  jokers?: JokerRef[];
  blinds?: BlindOption[];
  shop?: ShopItem[];
  /** Optional: mod can precompute; bridge derives if missing. */
  legal_actions?: LegalAction[];
  notes?: string;
}

export interface ChosenAction {
  action: LegalAction;
  mode: "mock" | "live";
  confidence?: number;
  model?: string;
  rationale?: string;
}

export interface BridgeDecision {
  state: BalatroState;
  legal_actions: LegalAction[];
  chosen: ChosenAction;
  decided_at: string;
}
