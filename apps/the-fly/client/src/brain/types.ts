import type { MotorVerb } from "../../../src/protocol";

export type { MotorVerb, WorldSense } from "../../../src/protocol";

export interface BrainMeta {
  dataset: string;
  dataset_full: string;
  citations: string[];
  sources: string[];
  neurons: number;
  connections: number;
  synapses: number;
  full_proofread_neurons: number;
  dropped_optic_intrinsic: boolean;
  channels: Record<string, number>;
  mapping: string;
  limits: string;
}

export interface MotorCommand {
  verb: MotorVerb;
  walk: number;
  turn: number;
  flight: number;
  feed: number;
  lockedUntil: number;
}

export interface BrainTick {
  t: number;
  hz: number;
  tickMs: number;
  spikes: number;
  rates: Record<string, number>;
  spark: number;
}

export interface BrainStatus {
  loaded: boolean;
  error: string | null;
  neurons: number;
  connections: number;
  synapses: number;
  hz: number;
  spikes: number;
  spark: number[];
  verb: MotorVerb;
  droppedOptic: boolean;
  dataset: string;
}

export const CHANNEL_NAMES = [
  "photo_l",
  "photo_r",
  "photo",
  "loom",
  "motion",
  "olf_food_l",
  "olf_food_r",
  "olf_food",
  "olf_l",
  "olf_r",
  "pn",
  "mech_l",
  "mech_r",
  "mech",
  "gus_sweet",
  "gus_bitter",
  "gus_water",
  "thermo",
  "cx",
  "hunger_mod",
  "mn_proboscis",
  "mn_head",
  "dn_walk",
  "dn_flight",
  "dn_escape",
  "dn_other",
  "dn_l",
  "dn_r",
  "tonic",
] as const;

export type ChannelName = (typeof CHANNEL_NAMES)[number];
