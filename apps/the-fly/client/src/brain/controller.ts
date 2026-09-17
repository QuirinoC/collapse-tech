// Authored mapping: world sensors inject current into labeled FlyWire
// populations. The graph and synapse weights are FlyWire FAFB v783; this
// injection table is not.

import type { MotorVerb, WorldSense } from "../../../src/protocol";
import type { BrainMeta, BrainStatus, BrainTick, MotorCommand } from "./types";
import { CHANNEL_NAMES } from "./types";

const VERB_LOCK_MS = 320;
const TAKEOFF_LOCK_MS = 2600;
const LAND_LOCK_MS = 900;
const SPARK_LEN = 64;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function rate(rates: Record<string, number>, name: string): number {
  return rates[name] ?? 0;
}

export class BrainController {
  private worker: Worker | null = null;
  private meta: BrainMeta | null = null;
  private status: BrainStatus = {
    loaded: false,
    error: null,
    neurons: 0,
    connections: 0,
    synapses: 0,
    hz: 0,
    spikes: 0,
    spark: [],
    verb: "stop",
    droppedOptic: false,
    dataset: "",
  };
  private command: MotorCommand = {
    verb: "stop",
    walk: 0,
    turn: 0,
    flight: 0,
    feed: 0,
    lockedUntil: 0,
  };
  private flying = false;
  private lastTakeoff = 0;
  private lastLand = 0;
  private lastVerbAt = 0;
  private lastSense: WorldSense | null = null;
  private hunger = 0.5;
  private thirst = 0.5;

  getStatus(): BrainStatus {
    return this.status;
  }

  latestCommand(): MotorCommand {
    return this.command;
  }

  async boot(): Promise<void> {
    try {
      const metaRes = await fetch("/connectome/meta.json");
      if (!metaRes.ok) throw new Error(`connectome meta HTTP ${metaRes.status}`);
      this.meta = (await metaRes.json()) as BrainMeta;
      this.status.dataset = this.meta.dataset;
      this.status.neurons = this.meta.neurons;
      this.status.connections = this.meta.connections;
      this.status.synapses = this.meta.synapses;
      this.status.droppedOptic = this.meta.dropped_optic_intrinsic;

      const binRes = await fetch("/connectome/graph.bin.gz");
      if (!binRes.ok) throw new Error(`connectome graph HTTP ${binRes.status}`);
      const buffer = await binRes.arrayBuffer();
      if (buffer.byteLength < 64) throw new Error("connectome graph is empty");

      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onerror = (event) => {
        this.fail(event.message || "connectome worker crashed");
      };
      this.worker.onmessage = (event: MessageEvent) => this.onWorker(event.data);
      this.worker.postMessage({ type: "init", buffer }, [buffer]);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : "connectome failed to load");
    }
  }

  setVitals(hunger: number, thirst: number): void {
    this.hunger = hunger;
    this.thirst = thirst;
  }

  setFlying(flying: boolean): void {
    this.flying = flying;
  }

  pushSense(sense: WorldSense): void {
    this.lastSense = sense;
    if (!this.worker || !this.status.loaded) return;
    this.worker.postMessage({ type: "sense", intensities: this.mapSense(sense) });
  }

  dispose(): void {
    this.worker?.postMessage({ type: "stop" });
    this.worker?.terminate();
    this.worker = null;
  }

  private onWorker(data: { type: string; message?: string; neurons?: number; connections?: number } & Partial<BrainTick>): void {
    if (data.type === "error") {
      this.fail(data.message || "connectome worker error");
      return;
    }
    if (data.type === "ready") {
      this.status.loaded = true;
      this.status.error = null;
      this.status.neurons = data.neurons ?? this.status.neurons;
      this.status.connections = data.connections ?? this.status.connections;
      this.worker?.postMessage({ type: "start" });
      return;
    }
    if (data.type !== "tick") return;
    this.status.hz = data.hz ?? 0;
    this.status.spikes = data.spikes ?? 0;
    this.status.spark = [...this.status.spark, data.spark ?? 0].slice(-SPARK_LEN);
    this.command = this.decode(data.rates ?? {}, Date.now());
    this.status.verb = this.command.verb;
  }

  private fail(message: string): void {
    this.status.loaded = false;
    this.status.error = message;
    this.worker?.terminate();
    this.worker = null;
  }

  private mapSense(s: WorldSense): Float32Array {
    const hunger = this.hunger;
    const thirst = this.thirst;
    const foodL = clamp01(s.foodOdor * (s.foodBearing < 0 ? 1 : 0.35) * (0.35 + hunger));
    const foodR = clamp01(s.foodOdor * (s.foodBearing > 0 ? 1 : 0.35) * (0.35 + hunger));
    const viewBoost = s.foodInView ? 0.35 : 0;
    const photo = clamp01(s.brightness);
    const photoL = clamp01(photo * (0.72 + (s.foodInView && s.foodBearing < -0.08 ? 0.28 : 0)));
    const photoR = clamp01(photo * (0.72 + (s.foodInView && s.foodBearing > 0.08 ? 0.28 : 0)));
    const waterL = clamp01(s.waterOdor * (s.waterBearing < 0 ? 1 : 0.4) * thirst);
    const waterR = clamp01(s.waterOdor * (s.waterBearing > 0 ? 1 : 0.4) * thirst);
    const out = new Float32Array(CHANNEL_NAMES.length);
    const put = (name: (typeof CHANNEL_NAMES)[number], value: number) => {
      out[CHANNEL_NAMES.indexOf(name)] = value;
    };
    put("photo_l", photoL);
    put("photo_r", photoR);
    put("photo", photo);
    put("loom", clamp01(s.loom));
    put("motion", clamp01(s.speed / 2.4));
    put("olf_food_l", clamp01(foodL + viewBoost * (s.foodBearing <= 0 ? 1 : 0.2)));
    put("olf_food_r", clamp01(foodR + viewBoost * (s.foodBearing >= 0 ? 1 : 0.2)));
    put("olf_food", clamp01(s.foodOdor * (0.3 + hunger) + viewBoost));
    put("olf_l", clamp01(foodL * 0.65 + waterL * 0.25));
    put("olf_r", clamp01(foodR * 0.65 + waterR * 0.25));
    put("pn", clamp01(s.foodOdor * (0.25 + hunger * 0.6)));
    put("mech_l", clamp01((s.wallContact ? 0.55 : 0) + (s.floorContact ? 0.12 : 0)));
    put("mech_r", clamp01((s.wallContact ? 0.55 : 0) + (s.floorContact ? 0.12 : 0)));
    put("mech", clamp01((s.wallContact ? 0.7 : 0) + (s.floorContact ? 0.18 : 0)));
    put("gus_sweet", s.foodContact ? clamp01(0.4 + hunger * 0.7) : 0);
    put("gus_bitter", 0);
    put("gus_water", s.waterContact ? clamp01(0.35 + thirst * 0.7) : clamp01(s.waterOdor * thirst * 0.45));
    put("thermo", 0.2);
    put("cx", 0.08);
    put("hunger_mod", clamp01(hunger));
    return out;
  }

  private decode(rates: Record<string, number>, now: number): MotorCommand {
    const walkPop = rate(rates, "dn_walk") + 0.42 * rate(rates, "dn_other") + 0.12 * rate(rates, "cx");
    const flightPop = rate(rates, "dn_flight") + 0.18 * rate(rates, "dn_other");
    const escape = rate(rates, "dn_escape");
    const feed = rate(rates, "mn_proboscis") + 0.55 * rate(rates, "gus_sweet") + 0.2 * rate(rates, "hunger_mod");
    const drink = rate(rates, "gus_water") + 0.2 * rate(rates, "mn_proboscis");
    const turn = Math.max(-1, Math.min(1, (rate(rates, "dn_r") - rate(rates, "dn_l")) * 8));
    const loom = rate(rates, "loom");
    const mech = rate(rates, "mech");
    const sense = this.lastSense;
    const foodClose = !!sense && sense.foodContact;
    const waterClose = !!sense && sense.waterContact;
    const wall = !!sense && sense.wallContact;

    let verb: MotorVerb = "stop";
    if (escape > 0.015 || (loom > 0.07 && flightPop > 0.03)) {
      verb = "takeoff";
    } else if (this.flying && flightPop > 0.035) {
      verb = "takeoff";
    } else if (this.flying && flightPop < 0.02 && walkPop > flightPop) {
      verb = "land";
    } else if (foodClose && feed > 0.03 && this.hunger > 0.12) {
      verb = "eat";
    } else if (waterClose && drink > 0.03 && this.thirst > 0.12) {
      verb = "drink";
    } else if (wall && mech > 0.05 && walkPop < 0.045 && !this.flying) {
      verb = "stick";
    } else if (walkPop > 0.012 || Math.abs(turn) > 0.08) {
      verb = Math.abs(turn) > 0.22 && walkPop < 0.03 ? "turn" : "walk";
    } else if (this.flying) {
      verb = "land";
    }

    if (verb === "takeoff" && now - this.lastTakeoff < TAKEOFF_LOCK_MS && !this.flying) {
      verb = walkPop > 0.01 ? "walk" : "stop";
    }
    if (verb === "land" && now - this.lastLand < LAND_LOCK_MS && this.flying) {
      verb = "takeoff";
    }
    if (now < this.command.lockedUntil && verb !== this.command.verb) {
      if (!(verb === "takeoff" && escape > 0.04)) verb = this.command.verb;
    }

    if (verb !== this.command.verb) {
      this.lastVerbAt = now;
      if (verb === "takeoff") this.lastTakeoff = now;
      if (verb === "land") this.lastLand = now;
    }

    return {
      verb,
      walk: clamp01(walkPop * 4.2),
      turn,
      flight: clamp01(flightPop * 5 + escape * 8),
      feed: clamp01(feed * 3.2),
      lockedUntil: this.lastVerbAt + VERB_LOCK_MS,
    };
  }
}
