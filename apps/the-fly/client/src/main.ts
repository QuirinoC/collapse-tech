import type { PublicConfig, Snapshot } from "../../src/protocol";
import { FEED_COOLDOWN_MS, INTERSTITIAL_SECONDS } from "../../src/protocol";
import { BrainController } from "./brain/controller";
import {
  feedPet,
  loadFeederName,
  loadPet,
  resumePet,
  saveFeederName,
  savePet,
  senseWorld,
  snapshotOf,
  tickPet,
  type SimState,
} from "./pet";
import { HabitatScene } from "./scene";

const moodEl = document.querySelector("#mood")!;
const hungerBar = document.querySelector<HTMLElement>("#hunger-bar")!;
const thirstBar = document.querySelector<HTMLElement>("#thirst-bar")!;
const lastFedEl = document.querySelector("#last-fed")!;
const mealsEl = document.querySelector("#meals")!;
const feedBtn = document.querySelector<HTMLButtonElement>("#feed-btn")!;
const feedHint = document.querySelector("#feed-hint")!;
const nameInput = document.querySelector<HTMLInputElement>("#feeder-name")!;
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const statusEl = document.querySelector("#brain-status")!;
const sparkEl = document.querySelector<HTMLCanvasElement>("#spark")!;
const errorEl = document.querySelector<HTMLElement>("#brain-error")!;

const FALLBACK_CONFIG: PublicConfig = {
  adsProvider: "mock",
  adsDisplayEnabled: false,
  adsensePublisherId: "",
  adsenseSlotId: "",
  interstitialSeconds: INTERSTITIAL_SECONDS,
  feedCooldownMs: FEED_COOLDOWN_MS,
  maxUneatenFood: 3,
};

const scene = new HabitatScene(canvas);
const brain = new BrainController();
let pet: SimState | null = null;
let config: PublicConfig = FALLBACK_CONFIG;
let lastHudKey = "";
let lastMealsKey = "";
let lastTick = performance.now();
let lastStatusKey = "";

nameInput.value = loadFeederName();

function moodLine(vitals: Snapshot["vitals"], locomotion: Snapshot["fly"]["locomotion"]): string {
  if (brain.getStatus().error) return "Connectome failed to load.";
  if (!brain.getStatus().loaded) return "Loading the connectome.";
  if (locomotion === "fly") return "In the air.";
  if (vitals.neglect > 0.72) return "Slow. Quiet. Still here.";
  if (locomotion === "stick") return "On the glass.";
  if (vitals.hunger > 0.7) return "Pacing. Hungry.";
  if (vitals.thirst > 0.7) return "Looking for water.";
  return "Making the rounds.";
}

function applyVitals(snapshot: Pick<Snapshot, "vitals" | "fly" | "meals">): void {
  const hunger = Math.round(snapshot.vitals.hunger * 100);
  const thirst = Math.round(snapshot.vitals.thirst * 100);
  const key = [
    hunger,
    thirst,
    snapshot.vitals.lastFedBy ?? "",
    snapshot.fly.locomotion,
    Math.round(snapshot.vitals.brightness * 20),
    brain.getStatus().error ?? "",
    brain.getStatus().loaded ? "1" : "0",
  ].join("|");
  if (key !== lastHudKey) {
    lastHudKey = key;
    hungerBar.style.setProperty("--level", `${hunger}%`);
    thirstBar.style.setProperty("--level", `${thirst}%`);
    lastFedEl.textContent = snapshot.vitals.lastFedBy
      ? `Last fed by ${snapshot.vitals.lastFedBy}`
      : "Never fed";
    moodEl.textContent = moodLine(snapshot.vitals, snapshot.fly.locomotion);
    scene.setBrightness(snapshot.vitals.brightness);
  }
  const mealsKey = snapshot.meals.map((meal) => `${meal.name}:${meal.at}`).join(",");
  if (mealsKey === lastMealsKey) return;
  lastMealsKey = mealsKey;
  mealsEl.innerHTML = snapshot.meals
    .map((meal) => {
      const when = new Date(meal.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<li><span>${meal.name}</span><span>${when}</span></li>`;
    })
    .join("");
}

function paintSpark(values: number[]): void {
  const ctx = sparkEl.getContext("2d");
  if (!ctx) return;
  const w = sparkEl.width;
  const h = sparkEl.height;
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const max = Math.max(0.002, ...values);
  ctx.beginPath();
  ctx.strokeStyle = "rgba(42, 36, 28, 0.55)";
  ctx.lineWidth = 1.2;
  values.forEach((value, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (value / max) * (h - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function paintStatus(): void {
  const s = brain.getStatus();
  errorEl.hidden = !s.error;
  errorEl.textContent = s.error
    ? `The FlyWire connectome did not load. ${s.error} The fly will not wander on a fake brain.`
    : "";
  const key = [s.loaded, s.neurons, s.connections, s.hz.toFixed(0), s.spikes, s.verb, s.error ?? ""].join("|");
  if (key !== lastStatusKey) {
    lastStatusKey = key;
    if (!s.loaded && !s.error) {
      statusEl.textContent = "Loading FlyWire FAFB v783…";
    } else if (s.error) {
      statusEl.textContent = "Connectome offline";
    } else {
      const subset = s.droppedOptic ? " · optic-lobe intrinsic omitted" : "";
      statusEl.textContent = `${s.neurons.toLocaleString()} neurons · ${s.connections.toLocaleString()} connections · ${s.hz.toFixed(0)} Hz · ${s.spikes.toLocaleString()} spikes${subset}`;
    }
  }
  paintSpark(s.spark);
}

function paint(): void {
  if (!pet) return;
  const snapshot = snapshotOf(pet);
  scene.pushPose(snapshot.t, snapshot.fly);
  scene.syncFoods(snapshot.foods);
  applyVitals(snapshot);
  paintStatus();
  canvas.dataset.flyX = snapshot.fly.x.toFixed(3);
  canvas.dataset.flyY = snapshot.fly.y.toFixed(3);
  canvas.dataset.flyZ = snapshot.fly.z.toFixed(3);
  canvas.dataset.flyLoc = snapshot.fly.locomotion;
}

async function loadConfig(): Promise<void> {
  try {
    const res = await fetch("/api/config");
    if (res.ok) config = (await res.json()) as PublicConfig;
  } catch {
    config = FALLBACK_CONFIG;
  }
  feedHint.textContent = "Drop food. Then a short wait.";
}

async function feed(): Promise<void> {
  if (!pet) return;
  if (!brain.getStatus().loaded) {
    feedHint.textContent = "Wait for the connectome.";
    return;
  }
  feedBtn.disabled = true;
  try {
    const result = feedPet(pet, nameInput.value);
    if (!result.ok) {
      const wait = Math.ceil((result.retryAfterMs ?? config.feedCooldownMs) / 1000);
      feedHint.textContent =
        result.error === "cooldown"
          ? `Wait ${wait}s, then try again.`
          : "There's already food waiting.";
      return;
    }
    paint();
    feedHint.textContent = "Food dropped.";
  } catch {
    feedHint.textContent = "Could not feed just now.";
  } finally {
    feedBtn.disabled = false;
  }
}

function persist(): void {
  if (!pet) return;
  savePet(pet, true);
}

feedBtn.addEventListener("click", () => {
  void feed();
});

nameInput.addEventListener("change", () => {
  saveFeederName(nameInput.value);
});

document.addEventListener("visibilitychange", () => {
  if (!pet) return;
  if (document.visibilityState === "hidden") {
    persist();
    return;
  }
  resumePet(pet);
  lastTick = performance.now();
  paint();
});

window.addEventListener("pagehide", persist);

function loop(now: number): void {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  if (pet && document.visibilityState === "visible") {
    const ready = brain.getStatus().loaded && !brain.getStatus().error;
    brain.setVitals(pet.hunger, pet.thirst);
    brain.setFlying(pet.fly.locomotion === "fly");
    if (ready) {
      brain.pushSense(senseWorld(pet, Date.now()));
      tickPet(pet, dt, Date.now(), brain.latestCommand());
    }
    savePet(pet);
    paint();
    scene.render();
  }
  requestAnimationFrame(loop);
}

async function boot(): Promise<void> {
  await loadConfig();
  pet = await loadPet();
  paint();
  await brain.boot();
  paint();
  requestAnimationFrame(loop);
}

void boot();
