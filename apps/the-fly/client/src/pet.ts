import type { FeedResult, Snapshot } from "../../src/protocol";
import type { MotorIntent } from "../../src/protocol";
import {
  catchUp,
  createInitialState,
  parseState,
  PERSIST_INTERVAL_MS,
  sanitizeName,
  senseWorld,
  stepSim,
  toSnapshot,
  tryDropFood,
  type SimState,
} from "../../src/sim";

export { senseWorld };

const PET_KEY = "the-fly:pet";
const NAME_KEY = "the-fly:name";

export type { SimState };

function persistLocal(state: SimState): void {
  try {
    localStorage.setItem(PET_KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode — the live tab still runs.
  }
}

function localPet(now: number): SimState | null {
  try {
    const raw = localStorage.getItem(PET_KEY);
    if (!raw) return null;
    return parseState(JSON.parse(raw), now);
  } catch {
    return null;
  }
}

async function fetchRemotePet(now: number): Promise<SimState | null> {
  try {
    const res = await fetch("/api/state", { credentials: "same-origin" });
    if (res.status === 204 || !res.ok) return null;
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return null;
    const state = parseState(raw, now);
    const updatedAt = (raw as { updatedAt?: unknown }).updatedAt;
    if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
      state.t = updatedAt;
    }
    return state;
  } catch {
    return null;
  }
}

async function putRemote(state: SimState): Promise<void> {
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...state, updatedAt: Date.now() }),
      keepalive: true,
      credentials: "same-origin",
    });
  } catch {
    // Offline — localStorage still has the snapshot.
  }
}

export async function loadPet(): Promise<SimState> {
  const now = Date.now();
  const remote = await fetchRemotePet(now);
  const state = remote ?? localPet(now) ?? createInitialState(now);
  catchUp(state, now);
  if (state.fly.locomotion !== "fly") state.fly.modeUntil = now;
  persistLocal(state);
  return state;
}

export function savePet(state: SimState, force = false): void {
  const now = Date.now();
  if (!force && now - state.lastPersistAt < PERSIST_INTERVAL_MS) return;
  state.lastPersistAt = now;
  persistLocal(state);
  void putRemote(state);
}

export function tickPet(state: SimState, dtSec: number, now: number, motor: MotorIntent | null = null): void {
  stepSim(state, dtSec, now, motor);
}

export function resumePet(state: SimState): void {
  catchUp(state, Date.now());
}

export function snapshotOf(state: SimState): Snapshot {
  return toSnapshot(state, Date.now(), 1);
}

export function feedPet(state: SimState, name: unknown): FeedResult {
  const now = Date.now();
  catchUp(state, now);
  const result = tryDropFood(state, now, sanitizeName(name), crypto.randomUUID());
  savePet(state, true);
  return result;
}

export function loadFeederName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveFeederName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.slice(0, 24));
  } catch {
    // ignore
  }
}
