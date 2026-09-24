/** Shared Balatro ↔ bridge types. Keep in sync with mod/balatro_jev JSON shapes. */

export type Phase =
  | "blind_select"
  | "hand"
  | "shop"
  | "pack_open"
  | "round_eval"
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
  sell_value?: number;
}

export interface ConsumableRef {
  index: number;
  id: string;
  name: string;
  set?: string;
  sell_value?: number;
}

export interface BlindOption {
  id: "small" | "big" | "boss" | string;
  name: string;
  skippable?: boolean;
  /** Native Balatro key: Small | Big | Boss */
  native_key?: string;
  status?: string;
}

export interface ShopItem {
  index: number;
  kind: "joker" | "consumable" | "voucher" | "pack" | "unknown";
  id: string;
  name: string;
  cost: number;
  /** Which shop CardArea: shop_jokers | shop_vouchers | shop_booster */
  area?: "shop_jokers" | "shop_vouchers" | "shop_booster" | string;
  /** 0-based slot within that area */
  slot?: number;
}

export interface PackCard {
  index: number;
  id: string;
  name: string;
  kind?: string;
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
    | "leave_shop"
    | "use_consumable"
    | "sell"
    | "pack_select"
    | "pack_skip"
    | "new_run"
    | "go_to_menu"
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
  consumables?: ConsumableRef[];
  blinds?: BlindOption[];
  /** Current blind on deck: small | big | boss */
  blind_on_deck?: string;
  shop?: ShopItem[];
  reroll_cost?: number;
  pack?: PackCard[];
  pack_choices_left?: number;
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
