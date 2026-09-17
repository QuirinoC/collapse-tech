import {
  DOME,
  FEED_COOLDOWN_MS,
  MAX_UNEATEN_FOOD,
  WATER_DISH,
  type AmbientEvent,
  type FeedResult,
  type FlyPose,
  type FoodItem,
  type Locomotion,
  type MealLogEntry,
  type MotorIntent,
  type Snapshot,
  type Vitals,
  type WorldEvent,
  type WorldSense,
} from "./protocol";

export const WATCH_TICK_MS = 350;
export const IDLE_TICK_MS = 5_000;
export const PERSIST_INTERVAL_MS = 3_500;

const HUNGER_PER_SEC = 0.00115;
const THIRST_PER_SEC = 0.00085;
const EAT_RANGE = 0.2;
const FOOD_WALK_RANGE = 1.08;
const FOOD_HOP_RANGE = 1.62;
const FOOD_HOP_COOLDOWN_MS = 3_400;
const FOOD_STUCK_MS = 1_800;
const APPROACH_SLOW_RANGE = 0.58;
const DRINK_RANGE = 0.18;
const VISION_RANGE = DOME.radius * 1.15;
const VISION_COS = Math.cos((52 * Math.PI) / 180);
const FLY_GRAVITY = 2.05;
const FLY_DRAG = 0.28;
const MIN_TAKEOFF_VY = 1.85;
const FLOOR_CONTACT = 0.03;
const WALL_CONTACT = 0.05;
const MAX_AIR_PITCH = 0.58;
const MIN_AIR_PITCH = -0.7;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface FlyBody {
  pos: Vec3;
  vel: Vec3;
  quat: Quat;
  locomotion: Locomotion;
  wingPhase: number;
  heading: number;
  modeUntil: number;
  target: Vec3 | null;
  startleUntil: number;
  eatingUntil: number;
  drinkingUntil: number;
  hopUntil: number;
  pursueId: string | null;
  approachDist: number;
  approachAt: number;
}

export interface SimState {
  version: 1;
  t: number;
  seed: number;
  rng: number;
  fly: FlyBody;
  hunger: number;
  thirst: number;
  brightness: number;
  brightnessTarget: number;
  lastFedBy: string | null;
  lastFedAt: number | null;
  lastFeedAttemptAt: number;
  foods: FoodItem[];
  meals: MealLogEntry[];
  ambient: AmbientEvent | null;
  nextLightAt: number;
  nextLoomAt: number;
  lastPersistAt: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function len2(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function norm(v: Vec3): Vec3 {
  const l = len2(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function projectOnPlane(v: Vec3, n: Vec3): Vec3 {
  return add(v, vecScale(n, -dot(v, n)));
}

function mulberry32(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next: t >>> 0 };
}

function rand(state: SimState): number {
  const r = mulberry32(state.rng);
  state.rng = r.next;
  return r.value;
}

function randRange(state: SimState, lo: number, hi: number): number {
  return lo + rand(state) * (hi - lo);
}

function identityQuat(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

function isFiniteQuat(q: Quat | undefined): q is Quat {
  return !!q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);
}

function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(l) || l < 1e-8) return identityQuat();
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function quatNeg(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: -q.w };
}

function slerpQuat(aIn: Quat, bIn: Quat, t: number): Quat {
  const a = normalizeQuat(aIn);
  let b = normalizeQuat(bIn);
  let d = quatDot(a, b);
  if (d < 0) {
    b = quatNeg(b);
    d = -d;
  }
  if (d > 0.9995) {
    return normalizeQuat({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      w: a.w + (b.w - a.w) * t,
    });
  }
  const theta = Math.acos(clamp(d, -1, 1));
  const s = Math.sin(theta) || 1;
  const w1 = Math.sin((1 - t) * theta) / s;
  const w2 = Math.sin(t * theta) / s;
  return {
    x: a.x * w1 + b.x * w2,
    y: a.y * w1 + b.y * w2,
    z: a.z * w1 + b.z * w2,
    w: a.w * w1 + b.w * w2,
  };
}

function quatRotate(q: Quat, v: Vec3): Vec3 {
  const u = { x: q.x, y: q.y, z: q.z };
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(vecScale(uv, 2 * q.w), vecScale(uuv, 2)));
}

function quatFromBasis(right: Vec3, up: Vec3, forward: Vec3): Quat {
  const m00 = right.x;
  const m01 = up.x;
  const m02 = forward.x;
  const m10 = right.y;
  const m11 = up.y;
  const m12 = forward.y;
  const m20 = right.z;
  const m21 = up.z;
  const m22 = forward.z;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s };
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
}

/** Local +Z is the head, local +Y is the back. */
function lookAlong(forwardIn: Vec3, upIn: Vec3): Quat {
  let up = norm(upIn);
  let forward = projectOnPlane(forwardIn, up);
  if (len2(forward) < 1e-5) {
    const helper = Math.abs(up.y) < 0.92 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    forward = projectOnPlane(helper, up);
  }
  if (len2(forward) < 1e-5) {
    forward = projectOnPlane({ x: 0, y: 0, z: 1 }, up);
  }
  forward = norm(forward);
  let right = cross(up, forward);
  if (len2(right) < 1e-6) {
    const helper = Math.abs(up.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    right = cross(up, helper);
  }
  right = norm(right);
  up = norm(cross(forward, right));
  right = norm(cross(up, forward));
  return quatFromBasis(right, up, forward);
}

function flightForward(vel: Vec3): Vec3 {
  const horiz = Math.hypot(vel.x, vel.z);
  const pitch = Math.atan2(vel.y, Math.max(horiz, 0.05));
  const capped = clamp(pitch, MIN_AIR_PITCH, MAX_AIR_PITCH);
  return { x: vel.x, y: Math.tan(capped) * Math.max(horiz, 0.1), z: vel.z };
}

function alignToMotion(
  fly: FlyBody,
  upIn: Vec3,
  dt: number,
  opts: { snap?: boolean; hint?: Vec3 } = {},
): void {
  const up = norm(upIn);
  const currentFwd = quatRotate(isFiniteQuat(fly.quat) ? fly.quat : identityQuat(), { x: 0, y: 0, z: 1 });
  const motion = opts.hint ?? fly.vel;
  const speed = len2(motion);
  let fwd = speed > 0.045 ? projectOnPlane(motion, up) : projectOnPlane(currentFwd, up);
  if (len2(fwd) < 0.025) fwd = projectOnPlane(currentFwd, up);
  if (len2(fwd) < 1e-4) {
    fwd = projectOnPlane({ x: Math.sin(fly.heading), y: 0, z: Math.cos(fly.heading) }, up);
  }
  if (len2(fwd) < 1e-4) fwd = projectOnPlane({ x: 1, y: 0, z: 0 }, up);
  fwd = norm(fwd);
  if (dot(fwd, currentFwd) < -0.15 && speed < 0.6) {
    const kept = projectOnPlane(currentFwd, up);
    if (len2(kept) > 1e-4) fwd = norm(kept);
  }

  const horiz = { x: fwd.x, y: 0, z: fwd.z };
  if (len2(horiz) > 0.06) fly.heading = Math.atan2(horiz.x, horiz.z);

  const desired = lookAlong(fwd, up);
  const alpha = opts.snap ? 1 : 1 - Math.exp(-11 * Math.max(dt, 1 / 120));
  fly.quat = slerpQuat(isFiniteQuat(fly.quat) ? fly.quat : desired, desired, alpha);
}

function radial(pos: Vec3): number {
  return Math.hypot(pos.x, pos.z);
}

type Surface = "floor" | "dome" | "air";

function wallNormal(pos: Vec3): Vec3 {
  const r = radial(pos) || 1;
  return { x: pos.x / r, y: 0, z: pos.z / r };
}

function onGlassBand(pos: Vec3): boolean {
  return pos.y <= DOME.floorY + DOME.glassH + 0.05;
}

function surfaceAt(pos: Vec3): Surface {
  const r = radial(pos);
  if (pos.y <= DOME.floorY + 0.045 && r < DOME.radius - 0.03) return "floor";
  if (r >= DOME.radius - 0.055 && onGlassBand(pos)) return "dome";
  return "air";
}

function clampInside(pos: Vec3): Vec3 {
  const next = { ...pos };
  next.y = clamp(next.y, DOME.floorY, DOME.floorY + DOME.airH);
  const r = radial(next);
  const maxR = DOME.radius - 0.014;
  if (r > maxR) {
    const s = maxR / r;
    next.x *= s;
    next.z *= s;
  }
  return next;
}

function snapToSurface(pos: Vec3, surface: Surface): Vec3 {
  if (surface === "floor") {
    return clampInside({ ...pos, y: DOME.floorY });
  }
  if (surface === "dome") {
    const inner = DOME.radius - 0.02;
    const r = radial(pos) || 1;
    const y = clamp(pos.y, DOME.floorY + 0.04, DOME.floorY + DOME.glassH - 0.02);
    return { x: (pos.x / r) * inner, y, z: (pos.z / r) * inner };
  }
  return clampInside(pos);
}

function floorPoint(state: SimState, radius = DOME.radius * 0.7): Vec3 {
  const a = randRange(state, 0, Math.PI * 2);
  const r = Math.sqrt(rand(state)) * radius;
  return { x: Math.cos(a) * r, y: DOME.floorY, z: Math.sin(a) * r };
}

function wallPoint(state: SimState): Vec3 {
  const a = randRange(state, 0, Math.PI * 2);
  const r = DOME.radius - 0.02;
  return {
    x: Math.cos(a) * r,
    y: DOME.floorY + randRange(state, 0.12, DOME.glassH - 0.06),
    z: Math.sin(a) * r,
  };
}

function neglectOf(state: SimState, now: number): number {
  const starved = 0.55 * state.hunger + 0.35 * state.thirst;
  const lonely =
    state.lastFedAt == null ? 0.28 : clamp01((now - state.lastFedAt - 90_000) / 240_000) * 0.3;
  return clamp01(starved + lonely);
}

function poseOf(fly: FlyBody): FlyPose {
  return {
    x: fly.pos.x,
    y: fly.pos.y,
    z: fly.pos.z,
    qx: fly.quat.x,
    qy: fly.quat.y,
    qz: fly.quat.z,
    qw: fly.quat.w,
    locomotion: fly.locomotion,
    wingPhase: fly.wingPhase,
    speed: len2(fly.vel),
  };
}

function vitalsOf(state: SimState, now: number, watcherCount: number): Vitals {
  return {
    hunger: state.hunger,
    thirst: state.thirst,
    neglect: neglectOf(state, now),
    brightness: state.brightness,
    lastFedBy: state.lastFedBy,
    lastFedAt: state.lastFedAt,
    watcherCount,
  };
}

export function createInitialState(now: number): SimState {
  const seed = Math.floor(now % 2_147_483_647) || 1;
  const state: SimState = {
    version: 1,
    t: now,
    seed,
    rng: seed >>> 0,
    fly: {
      pos: { x: -0.35, y: DOME.floorY, z: 0.42 },
      vel: { x: 0, y: 0, z: 0 },
      quat: lookAlong({ x: 0.8, y: 0, z: 0.25 }, { x: 0, y: 1, z: 0 }),
      locomotion: "walk",
      wingPhase: 0,
      heading: 0.4,
      modeUntil: now + 1_100,
      target: null,
      startleUntil: 0,
      eatingUntil: 0,
      drinkingUntil: 0,
      hopUntil: 0,
      pursueId: null,
      approachDist: 0,
      approachAt: 0,
    },
    hunger: 0.82,
    thirst: 0.68,
    brightness: 0.7,
    brightnessTarget: 0.7,
    lastFedBy: null,
    lastFedAt: null,
    lastFeedAttemptAt: 0,
    foods: [],
    meals: [],
    ambient: null,
    nextLightAt: now + 8_000,
    nextLoomAt: now + 14_000,
    lastPersistAt: now,
  };
  return state;
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "someone";
  const trimmed = raw
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return trimmed || "someone";
}

function uneaten(state: SimState): FoodItem[] {
  return state.foods.filter((food) => !food.eaten);
}

function nearestFood(state: SimState, from: Vec3): FoodItem | null {
  let best: FoodItem | null = null;
  let bestD = Infinity;
  for (const food of uneaten(state)) {
    const d = Math.hypot(food.x - from.x, food.y - from.y, food.z - from.z);
    if (d < bestD) {
      best = food;
      bestD = d;
    }
  }
  return best;
}

function foodById(state: SimState, id: string | null): FoodItem | null {
  if (!id) return null;
  return uneaten(state).find((food) => food.id === id) ?? null;
}

function horizDist(a: Vec3, b: Pick<Vec3, "x" | "z">): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function towardFood(fly: FlyBody, food: Pick<Vec3, "x" | "z">): Vec3 {
  return { x: food.x - fly.pos.x, y: 0, z: food.z - fly.pos.z };
}

function lockedFood(state: SimState): FoodItem | null {
  const held = foodById(state, state.fly.pursueId);
  if (held) return held;
  state.fly.pursueId = null;
  return nearestFood(state, state.fly.pos);
}

function canHopForFood(fly: FlyBody, now: number): boolean {
  return now >= fly.hopUntil && now >= fly.startleUntil && now >= fly.eatingUntil;
}

function hopForFood(state: SimState, now: number, aim: Vec3): boolean {
  const fly = state.fly;
  if (fly.locomotion === "fly" || !canHopForFood(fly, now)) return false;
  takeOff(state, now, aim, randRange(state, 1.52, 1.88), randRange(state, 880, 1_360));
  fly.hopUntil = now + FOOD_HOP_COOLDOWN_MS;
  return true;
}

function consumeFood(state: SimState, food: FoodItem, now: number, events: WorldEvent[]): void {
  const fly = state.fly;
  if (now < fly.eatingUntil) return;
  if (fly.locomotion === "fly") land(state, now, "floor");
  food.eaten = true;
  fly.vel = { x: 0, y: 0, z: 0 };
  fly.locomotion = "walk";
  fly.pos = snapToSurface(fly.pos, "floor");
  fly.eatingUntil = now + 1_100;
  fly.pursueId = null;
  fly.target = { x: food.x, y: DOME.floorY, z: food.z };
  fly.approachDist = 0;
  state.hunger = clamp01(state.hunger - 0.48);
  state.thirst = clamp01(state.thirst - 0.06);
  events.push({ kind: "food_eaten", id: food.id });
}

function odorStrength(from: Vec3, food: FoodItem): number {
  const d = Math.hypot(food.x - from.x, food.y - from.y, food.z - from.z);
  return Math.exp(-d * 1.55);
}

function sees(fly: FlyBody, point: Vec3): boolean {
  const to = sub(point, fly.pos);
  const d = len2(to);
  if (d > VISION_RANGE || d < 0.001) return d < 0.001;
  const forward = quatRotate(fly.quat, { x: 0, y: 0, z: 1 });
  return dot(norm(to), norm(forward)) >= VISION_COS;
}

function pickWanderTarget(state: SimState): Vec3 {
  const roll = rand(state);
  if (roll < 0.22) return wallPoint(state);
  return floorPoint(state);
}

function airPoint(state: SimState): Vec3 {
  const a = randRange(state, 0, Math.PI * 2);
  const elev = randRange(state, DOME.glassH * 0.7, DOME.airH * 0.78);
  const r = randRange(state, DOME.radius * 0.12, DOME.radius * 0.72);
  return clampInside({
    x: Math.cos(a) * r,
    y: DOME.floorY + elev,
    z: Math.sin(a) * r,
  });
}

function takeOff(state: SimState, now: number, aim: Vec3, burst: number, hangMs?: number): void {
  const fly = state.fly;
  const onGlass = fly.locomotion === "stick" || surfaceAt(fly.pos) === "dome";
  if (onGlass) {
    const n = wallNormal(fly.pos);
    fly.pos = clampInside({
      x: fly.pos.x - n.x * 0.12,
      y: fly.pos.y + 0.08,
      z: fly.pos.z - n.z * 0.12,
    });
  } else {
    fly.pos = { ...fly.pos, y: Math.max(fly.pos.y, DOME.floorY + 0.14) };
  }

  const delta = sub(aim, fly.pos);
  const lift = Math.max(1.05, Math.abs(delta.y) * 0.22 + 0.95);
  const dir = norm({ x: delta.x, y: lift, z: delta.z });
  fly.locomotion = "fly";
  fly.vel = vecScale(dir, burst);
  fly.vel.y = Math.max(fly.vel.y, MIN_TAKEOFF_VY);
  fly.modeUntil = now + (hangMs ?? randRange(state, 1_600, 2_700));
  fly.target = aim;
  alignToMotion(fly, { x: 0, y: 1, z: 0 }, 1, { snap: true, hint: flightForward(fly.vel) });
}

function land(state: SimState, now: number, surface: Surface): void {
  const fly = state.fly;
  const grounded = surface === "air" ? "floor" : surface;
  fly.pos = snapToSurface(fly.pos, grounded);
  fly.vel = { x: 0, y: 0, z: 0 };
  fly.locomotion = grounded === "floor" ? "walk" : "stick";
  fly.modeUntil = now + randRange(state, 1_200, 3_400);
  fly.target = null;
  alignToMotion(fly, surfaceUp(fly.pos, grounded), 1, { snap: true });
}

function surfaceUp(pos: Vec3, surface: Surface): Vec3 {
  if (surface === "dome") {
    const n = wallNormal(pos);
    return { x: -n.x, y: 0.08, z: -n.z };
  }
  return { x: 0, y: 1, z: 0 };
}

function stepLocomotion(state: SimState, dt: number, now: number, neglect: number, motor: MotorIntent | null): void {
  const fly = state.fly;
  const speedMul = 1 - neglect * 0.72;
  const quiet = neglect > 0.62;
  const verb = motor?.verb ?? "stop";
  const walkGain = verb === "walk" || verb === "turn" ? Math.max(0.12, motor?.walk ?? 0) : 0;
  const turn = motor?.turn ?? 0;

  if (now < fly.eatingUntil || now < fly.drinkingUntil) {
    fly.vel = { x: 0, y: 0, z: 0 };
    fly.wingPhase = (fly.wingPhase + dt * 3) % 1;
    const surface = fly.locomotion === "stick" ? surfaceAt(fly.pos) : "floor";
    alignToMotion(fly, surfaceUp(fly.pos, surface === "air" ? "floor" : surface), dt);
    return;
  }

  if (verb === "takeoff" && fly.locomotion !== "fly") {
    const heading = fly.heading + turn * 0.7;
    takeOff(
      state,
      now,
      {
        x: fly.pos.x + Math.sin(heading) * 1.4,
        y: DOME.floorY + DOME.airH * (0.34 + (motor?.flight ?? 0.3) * 0.28),
        z: fly.pos.z + Math.cos(heading) * 1.4,
      },
      1.7 + (motor?.flight ?? 0.3) * 1.4,
      1_200 + (motor?.flight ?? 0.3) * 1_400,
    );
  }

  if (fly.locomotion === "fly") {
    const settling = verb === "land" || now >= fly.modeUntil;
    fly.heading += turn * 1.55 * dt;
    fly.vel.y -= (settling ? FLY_GRAVITY * 1.35 : FLY_GRAVITY) * dt;
    fly.vel = add(fly.vel, vecScale(fly.vel, -FLY_DRAG * dt));
    const thrust = settling ? 0.15 : 0.62 + (motor?.flight ?? 0) * 1.05;
    fly.vel.x += Math.sin(fly.heading) * thrust * dt;
    fly.vel.z += Math.cos(fly.heading) * thrust * dt;
    fly.pos = clampInside(add(fly.pos, vecScale(fly.vel, dt)));

    const r = radial(fly.pos);
    if (r >= DOME.radius - WALL_CONTACT) {
      const outward = wallNormal(fly.pos);
      const vn = dot(fly.vel, outward);
      if (vn > 0) fly.vel = add(fly.vel, vecScale(outward, -1.55 * vn));
      fly.pos = clampInside(fly.pos);
      if (settling && onGlassBand(fly.pos)) {
        land(state, now, "dome");
        return;
      }
    }

    if (fly.pos.y >= DOME.floorY + DOME.airH - 0.08 && fly.vel.y > 0) {
      fly.vel.y *= -0.28;
      fly.pos.y = DOME.floorY + DOME.airH - 0.08;
    }

    if (fly.pos.y <= DOME.floorY + FLOOR_CONTACT && fly.vel.y <= 0) {
      land(state, now, "floor");
      return;
    }

    alignToMotion(fly, { x: 0, y: 1, z: 0 }, dt, { hint: flightForward(fly.vel) });
    fly.wingPhase = (fly.wingPhase + dt * (16 - neglect * 7)) % 1;
    return;
  }

  if (verb === "land") {
    fly.vel = { x: 0, y: 0, z: 0 };
  }

  const surface = fly.locomotion === "stick" ? surfaceAt(fly.pos) : "floor";
  const grounded = surface === "air" ? "floor" : surface;
  if (verb === "stick" || (verb === "stop" && grounded === "dome")) {
    fly.locomotion = "stick";
    fly.pos = snapToSurface(fly.pos, "dome");
    fly.vel = { x: 0, y: 0, z: 0 };
    fly.wingPhase = (fly.wingPhase + dt * 1.4) % 1;
    alignToMotion(fly, surfaceUp(fly.pos, "dome"), dt);
    return;
  }

  if (verb === "stop" || walkGain <= 0.001) {
    fly.vel = { x: 0, y: 0, z: 0 };
    fly.pos = snapToSurface(fly.pos, grounded === "dome" ? "dome" : "floor");
    fly.wingPhase = (fly.wingPhase + dt * (quiet ? 1.2 : 2.1)) % 1;
    alignToMotion(fly, surfaceUp(fly.pos, grounded), dt);
    return;
  }

  fly.heading += turn * 2.15 * dt;
  const walkSpeed = (fly.locomotion === "stick" ? 0.3 : 0.46) * speedMul * Math.min(1.15, 0.35 + walkGain);
  const walkDir = { x: Math.sin(fly.heading), y: 0, z: Math.cos(fly.heading) };
  fly.pos = clampInside(add(fly.pos, vecScale(walkDir, walkSpeed * dt)));

  const nextSurface = surfaceAt(fly.pos);
  if (nextSurface === "dome") {
    fly.locomotion = "stick";
    fly.pos = snapToSurface(fly.pos, "dome");
  } else if (nextSurface === "floor") {
    fly.locomotion = "walk";
    fly.pos = snapToSurface(fly.pos, "floor");
  } else {
    fly.pos = snapToSurface(fly.pos, grounded);
  }

  fly.vel = vecScale(walkDir, walkSpeed);
  alignToMotion(fly, surfaceUp(fly.pos, fly.locomotion === "stick" ? surfaceAt(fly.pos) : "floor"), dt, {
    hint: walkDir,
  });
  fly.wingPhase = (fly.wingPhase + dt * (quiet ? 1.2 : 2.4)) % 1;
}

function bearingTo(fly: FlyBody, point: Pick<Vec3, "x" | "z">): number {
  const to = { x: point.x - fly.pos.x, z: point.z - fly.pos.z };
  const fwd = { x: Math.sin(fly.heading), z: Math.cos(fly.heading) };
  const right = { x: fwd.z, z: -fwd.x };
  const len = Math.hypot(to.x, to.z) || 1;
  return clamp((to.x * right.x + to.z * right.z) / len, -1, 1);
}

export function senseWorld(state: SimState, now: number): WorldSense {
  const fly = state.fly;
  const food = nearestFood(state, fly.pos);
  const foodRange = food ? Math.hypot(food.x - fly.pos.x, food.y - fly.pos.y, food.z - fly.pos.z) : Infinity;
  const foodOdor = food ? odorStrength(fly.pos, food) : 0;
  const waterRange = Math.hypot(WATER_DISH.x - fly.pos.x, WATER_DISH.y - fly.pos.y, WATER_DISH.z - fly.pos.z);
  const loom =
    state.ambient?.kind === "loom" && now - state.ambient.at < 1_800
      ? state.ambient.intensity * (1 - (now - state.ambient.at) / 1_800)
      : 0;
  return {
    brightness: state.brightness,
    foodOdor,
    foodBearing: food ? bearingTo(fly, food) : 0,
    foodInView: !!food && sees(fly, { x: food.x, y: food.y, z: food.z }),
    foodRange: Number.isFinite(foodRange) ? foodRange : 99,
    foodContact: !!food && foodRange < EAT_RANGE && fly.pos.y <= DOME.floorY + 0.16,
    waterOdor: Math.exp(-waterRange * 1.2),
    waterBearing: bearingTo(fly, WATER_DISH),
    waterContact: waterRange < DRINK_RANGE && fly.locomotion !== "fly",
    wallContact: surfaceAt(fly.pos) === "dome" || radial(fly.pos) >= DOME.radius - WALL_CONTACT * 2,
    floorContact: fly.pos.y <= DOME.floorY + FLOOR_CONTACT + 0.02,
    loom,
    speed: len2(fly.vel),
  };
}

function applyMouth(state: SimState, now: number, motor: MotorIntent | null, events: WorldEvent[]): void {
  if (!motor) return;
  const food = nearestFood(state, state.fly.pos);
  if (motor.verb === "eat" && food) {
    const d = Math.hypot(food.x - state.fly.pos.x, food.y - state.fly.pos.y, food.z - state.fly.pos.z);
    if (d < EAT_RANGE + 0.04) consumeFood(state, food, now, events);
  }
  if (motor.verb === "drink") {
    const d = Math.hypot(WATER_DISH.x - state.fly.pos.x, WATER_DISH.y - state.fly.pos.y, WATER_DISH.z - state.fly.pos.z);
    if (d < DRINK_RANGE && now >= state.fly.drinkingUntil) {
      state.fly.drinkingUntil = now + 900;
      state.thirst = clamp01(state.thirst - 0.34);
    }
  }
}

function stepAmbient(state: SimState, dt: number, now: number, events: WorldEvent[]): void {
  if (now >= state.nextLightAt) {
    state.brightnessTarget = randRange(state, 0.42, 1.08);
    state.nextLightAt = now + randRange(state, 11_000, 28_000);
    const event: AmbientEvent = {
      kind: "light_shift",
      at: now,
      intensity: state.brightnessTarget,
    };
    state.ambient = event;
    events.push({ kind: "light_shift", intensity: event.intensity, at: now });
  }
  state.brightness += (state.brightnessTarget - state.brightness) * Math.min(1, dt * 1.8);

  if (now >= state.nextLoomAt) {
    const intensity = randRange(state, 0.45, 1);
    state.nextLoomAt = now + randRange(state, 32_000, 78_000);
    const event: AmbientEvent = { kind: "loom", at: now, intensity };
    state.ambient = event;
    events.push({ kind: "loom", intensity, at: now });
  }
}

export function stepSim(state: SimState, dtSec: number, now: number, motor: MotorIntent | null = null): WorldEvent[] {
  const events: WorldEvent[] = [];
  const dt = clamp(dtSec, 0.008, 0.35);
  const neglect = neglectOf(state, now);
  const activity = state.fly.locomotion === "fly" ? 1.25 : 1;

  state.hunger = clamp01(state.hunger + HUNGER_PER_SEC * dt * activity);
  state.thirst = clamp01(state.thirst + THIRST_PER_SEC * dt * activity);

  stepAmbient(state, dt, now, events);
  applyMouth(state, now, motor, events);
  stepLocomotion(state, dt, now, neglect, motor);

  state.t = now;
  return events;
}

export function catchUp(state: SimState, now: number): WorldEvent[] {
  const elapsed = now - state.t;
  if (elapsed <= 16) return [];
  const cap = Math.min(elapsed / 1000, 10 * 60);
  const activity = 1;
  state.hunger = clamp01(state.hunger + HUNGER_PER_SEC * cap * activity);
  state.thirst = clamp01(state.thirst + THIRST_PER_SEC * cap * activity);
  state.t = now;
  return [];
}

export function tryDropFood(state: SimState, now: number, name: string, id: string): FeedResult {
  const since = now - state.lastFeedAttemptAt;
  if (state.lastFeedAttemptAt > 0 && since < FEED_COOLDOWN_MS) {
    return { ok: false, error: "cooldown", retryAfterMs: FEED_COOLDOWN_MS - since };
  }
  const leftover = uneaten(state).length;
  if (leftover >= MAX_UNEATEN_FOOD) {
    return { ok: false, error: "jar_full", uneaten: leftover };
  }

  state.lastFeedAttemptAt = now;
  const pos = floorPoint(state, DOME.radius * 0.58);
  const food: FoodItem = {
    id,
    x: pos.x,
    y: DOME.floorY + 0.07,
    z: pos.z,
    droppedBy: name,
    droppedAt: now,
    eaten: false,
  };
  state.foods = [...state.foods.filter((item) => !item.eaten).slice(-5), food];
  state.meals = [{ name, at: now }, ...state.meals].slice(0, 8);
  state.lastFedBy = name;
  state.lastFedAt = now;
  return { ok: true, food, cooldownMs: FEED_COOLDOWN_MS };
}

export function toSnapshot(state: SimState, now: number, watcherCount: number): Snapshot {
  return {
    t: now,
    fly: poseOf(state.fly),
    vitals: vitalsOf(state, now, watcherCount),
    foods: state.foods.filter((food) => !food.eaten || now - food.droppedAt < 8_000),
    meals: state.meals,
    ambient: state.ambient,
    water: WATER_DISH,
  };
}

export function poseMessage(state: SimState, now: number, watcherCount: number) {
  const vitals = vitalsOf(state, now, watcherCount);
  return {
    type: "pose" as const,
    t: now,
    fly: poseOf(state.fly),
    vitals: {
      hunger: vitals.hunger,
      thirst: vitals.thirst,
      neglect: vitals.neglect,
      brightness: vitals.brightness,
      watcherCount: vitals.watcherCount,
    },
  };
}

export function parseState(raw: unknown, now: number): SimState {
  if (!raw || typeof raw !== "object") return createInitialState(now);
  const data = raw as SimState;
  if (data.version !== 1 || !data.fly?.pos) return createInitialState(now);
  data.fly.pos = clampInside({
    x: Number(data.fly.pos.x) || 0,
    y: Math.max(Number(data.fly.pos.y) || DOME.floorY, DOME.floorY),
    z: Number(data.fly.pos.z) || 0,
  });
  data.fly.quat = isFiniteQuat(data.fly.quat)
    ? normalizeQuat(data.fly.quat)
    : lookAlong({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  if (!Number.isFinite(data.fly.heading)) data.fly.heading = 0;
  if (!Number.isFinite(data.fly.hopUntil)) data.fly.hopUntil = 0;
  data.fly.pursueId = typeof data.fly.pursueId === "string" ? data.fly.pursueId : null;
  if (!Number.isFinite(data.fly.approachDist)) data.fly.approachDist = 0;
  if (!Number.isFinite(data.fly.approachAt)) data.fly.approachAt = 0;
  data.foods = Array.isArray(data.foods)
    ? data.foods.map((food) => ({
        ...food,
        x: Number(food.x) || 0,
        y: DOME.floorY + 0.07,
        z: Number(food.z) || 0,
      }))
    : [];
  return data;
}
