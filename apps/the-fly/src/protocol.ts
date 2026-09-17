export const DOME = {
  radius: 3.42,
  floorY: 0.04,
  /** Low open windscreen. The fly can leave this visually. */
  glassH: 0.38,
  /** Invisible play ceiling — lots of air above the bowl. */
  airH: 4.7,
} as const;

export const JAR = {
  radius: DOME.radius,
  floorY: DOME.floorY,
  lidY: DOME.floorY + DOME.airH,
} as const;

export const WATER_DISH = {
  x: DOME.radius * 0.28,
  y: DOME.floorY + 0.01,
  z: -DOME.radius * 0.2,
};

export const FEED_COOLDOWN_MS = 25_000;
export const MAX_UNEATEN_FOOD = 3;
export const INTERSTITIAL_SECONDS = 15;

export type Locomotion = "walk" | "stick" | "fly";

export type MotorVerb = "walk" | "turn" | "stop" | "takeoff" | "land" | "stick" | "eat" | "drink";

export interface MotorIntent {
  verb: MotorVerb;
  walk: number;
  turn: number;
  flight: number;
  feed: number;
}

export interface WorldSense {
  brightness: number;
  foodOdor: number;
  foodBearing: number;
  foodInView: boolean;
  foodRange: number;
  foodContact: boolean;
  waterOdor: number;
  waterBearing: number;
  waterContact: boolean;
  wallContact: boolean;
  floorContact: boolean;
  loom: number;
  speed: number;
}

export interface BrainHud {
  neurons: number;
  connections: number;
  hz: number;
  spikes: number;
  spark: number[];
  verb: MotorVerb;
  error: string | null;
  droppedOptic: boolean;
  dataset: string;
}

export type AmbientKind = "light_shift" | "loom";

export interface FlyPose {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  locomotion: Locomotion;
  wingPhase: number;
  speed: number;
}

export interface Vitals {
  hunger: number;
  thirst: number;
  neglect: number;
  brightness: number;
  lastFedBy: string | null;
  lastFedAt: number | null;
  watcherCount: number;
}

export interface FoodItem {
  id: string;
  x: number;
  y: number;
  z: number;
  droppedBy: string;
  droppedAt: number;
  eaten: boolean;
}

export interface MealLogEntry {
  name: string;
  at: number;
}

export interface AmbientEvent {
  kind: AmbientKind;
  at: number;
  intensity: number;
}

export interface Snapshot {
  t: number;
  fly: FlyPose;
  vitals: Vitals;
  foods: FoodItem[];
  meals: MealLogEntry[];
  ambient: AmbientEvent | null;
  water: { x: number; y: number; z: number };
  brain?: BrainHud;
}

export type ServerMessage =
  | { type: "snapshot"; payload: Snapshot }
  | {
      type: "pose";
      t: number;
      fly: FlyPose;
      vitals: Pick<Vitals, "hunger" | "thirst" | "neglect" | "brightness" | "watcherCount">;
    }
  | { type: "event"; event: WorldEvent };

export type WorldEvent =
  | { kind: "food_dropped"; food: FoodItem }
  | { kind: "food_eaten"; id: string }
  | { kind: "light_shift"; intensity: number; at: number }
  | { kind: "loom"; intensity: number; at: number };

export interface FeedRequest {
  name?: string;
}

export type FeedResult =
  | { ok: true; food: FoodItem; cooldownMs: number }
  | { ok: false; error: "cooldown" | "jar_full"; retryAfterMs?: number; uneaten?: number };

export interface PublicConfig {
  adsProvider: "first_party" | "mock";
  adsDisplayEnabled: boolean;
  adsensePublisherId: string;
  adsenseSlotId: string;
  interstitialSeconds: number;
  feedCooldownMs: number;
  maxUneatenFood: number;
}
