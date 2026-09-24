/** Shared Balatro ↔ bridge types. Keep in sync with mod/balatro_jev JSON shapes. */

export type Phase =
  | "blind_select"
  | "hand"
  | "shop"
  | "pack_open"
  | "round_eval"
  | "game_over"
  | "menu"
  | "unknown";

export interface CardRef {
  index: number;
  rank: string;
  suit: string;
  enhancement?: string | null;
  edition?: string | null;
  seal?: string | null;
  chip_value?: number | null;
}

export interface JokerRef {
  index: number;
  id: string;
  name: string;
  effect?: string | null;
  sell_value?: number;
}

export interface ConsumableRef {
  index: number;
  id: string;
  name: string;
  set?: string;
  effect?: string | null;
  sell_value?: number;
}

export interface BlindOption {
  id: "small" | "big" | "boss" | string;
  name: string;
  skippable?: boolean;
  native_key?: string;
  status?: string;
  chips?: number | null;
}

export interface ShopItem {
  index: number;
  kind: "joker" | "consumable" | "voucher" | "pack" | "unknown";
  id: string;
  name: string;
  cost: number;
  area?: "shop_jokers" | "shop_vouchers" | "shop_booster" | string;
  slot?: number;
}

export interface PackCard {
  index: number;
  id: string;
  name: string;
  kind?: string;
  effect?: string | null;
}

export interface LegalAction {
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
  label: string;
  what?: string;
  not_for?: string;
  score?: number;
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
  blind_on_deck?: string;
  blind_type?: string;
  shop?: ShopItem[];
  reroll_cost?: number;
  shop_can_leave?: boolean;
  pack?: PackCard[];
  pack_choices_left?: number;
  deck_remaining?: number;
  legal_actions?: LegalAction[];
  raw_state?: number | string;
  raw_state_name?: string;
  has_blind_select_ui?: boolean;
  /** True only when the Cash Out button exists (payout anim finished). */
  cash_out_ready?: boolean;
  notes?: string;
}

export interface ChosenAction {
  action: LegalAction;
  mode: "mock" | "live";
  confidence?: number;
  model?: string;
  rationale?: string;
  tokens?: { input: number; output: number };
}

export interface BridgeDecision {
  state: BalatroState;
  legal_actions: LegalAction[];
  chosen: ChosenAction;
  decided_at: string;
}
