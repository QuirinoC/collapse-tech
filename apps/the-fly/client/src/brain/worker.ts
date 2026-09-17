/// <reference lib="webworker" />

const WEIGHT_SCALE = 0.42;
const LEAK = 0.88;
const THRESHOLD = 1;
const REFRAC = 2;
const TONIC = 0.15;
const TARGET_HZ = 24;

interface Channel {
  name: string;
  idx: Uint32Array;
}

let N = 0;
let E = 0;
let V: Float32Array | null = null;
let refrac: Uint8Array | null = null;
let spiked: Uint32Array | null = null;
let spikeCount = 0;
let rowPtr: Uint32Array | null = null;
let col: Uint32Array | null = null;
let w: Float32Array | null = null;
let channels: Channel[] = [];
let sense: Float32Array | null = null;
let running = false;
let tickN = 0;
let lastTickAt = 0;
let hzEma = 0;
let tickMsEma = 0;
let timer = 0;

function fail(message: string): void {
  postMessage({ type: "error", message });
}

async function inflate(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buffer, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buffer;
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([buffer]).stream().pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

function parse(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "FLYC") throw new Error("bad connectome magic");
  const version = view.getUint16(4, true);
  if (version !== 1) throw new Error(`unsupported connectome version ${version}`);
  N = view.getUint32(8, true);
  E = view.getUint32(12, true);
  const nCh = view.getUint32(16, true);
  let off = 24;
  off += N * 2; // unused group ids
  off += N; // side
  off += (4 - (off % 4)) % 4;
  if (off % 4 === 0) {
    rowPtr = new Uint32Array(buffer, off, N + 1).slice();
    off += (N + 1) * 4;
    col = new Uint32Array(buffer, off, E).slice();
    off += E * 4;
  } else {
    rowPtr = new Uint32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      rowPtr[i] = view.getUint32(off, true);
      off += 4;
    }
    col = new Uint32Array(E);
    for (let i = 0; i < E; i++) {
      col[i] = view.getUint32(off, true);
      off += 4;
    }
  }
  const packed = off % 2 === 0 ? new Int16Array(buffer, off, E) : null;
  w = new Float32Array(E);
  if (packed) {
    for (let i = 0; i < E; i++) w[i] = (packed[i] / 32767) * WEIGHT_SCALE;
    off += E * 2;
  } else {
    for (let i = 0; i < E; i++) {
      w[i] = (view.getInt16(off, true) / 32767) * WEIGHT_SCALE;
      off += 2;
    }
  }

  channels = [];
  const bytes = new Uint8Array(buffer);
  for (let c = 0; c < nCh; c++) {
    const nlen = bytes[off];
    off += 1;
    const name = new TextDecoder().decode(bytes.subarray(off, off + nlen));
    off += nlen;
    const count = view.getUint32(off, true);
    off += 4;
    const idx = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      idx[i] = view.getUint32(off, true);
      off += 4;
    }
    channels.push({ name, idx });
  }

  V = new Float32Array(N);
  refrac = new Uint8Array(N);
  spiked = new Uint32Array(Math.min(N, 65536));
  sense = new Float32Array(channels.length);
  spikeCount = 0;
}

function channelRates(): Record<string, number> {
  const rates: Record<string, number> = {};
  if (!refrac) return rates;
  for (const ch of channels) {
    if (ch.idx.length === 0) {
      rates[ch.name] = 0;
      continue;
    }
    let hits = 0;
    for (let i = 0; i < ch.idx.length; i++) {
      const ni = ch.idx[i];
      if (refrac[ni] === REFRAC) hits++;
    }
    rates[ch.name] = hits / ch.idx.length;
  }
  return rates;
}

function inject(): void {
  if (!V || !refrac || !sense) return;
  for (let c = 0; c < channels.length; c++) {
    if (channels[c].name === "tonic") continue;
    const amp = sense[c];
    if (amp <= 1e-5) continue;
    const idx = channels[c].idx;
    for (let i = 0; i < idx.length; i++) {
      const ni = idx[i];
      if (refrac[ni] === 0) V[ni] += amp;
    }
  }
  const tonic = channels.find((ch) => ch.name === "tonic");
  if (tonic) {
    for (let i = 0; i < tonic.idx.length; i++) {
      const ni = tonic.idx[i];
      if (refrac[ni] === 0) V[ni] += TONIC;
    }
  }
}

function tick(): void {
  if (!V || !refrac || !rowPtr || !col || !w || !spiked) return;
  const t0 = performance.now();

  for (let i = 0; i < N; i++) {
    if (refrac[i] > 0) {
      refrac[i]--;
      V[i] = 0;
    } else {
      V[i] *= LEAK;
    }
  }

  inject();

  for (let s = 0; s < spikeCount; s++) {
    const pre = spiked[s];
    const a = rowPtr[pre];
    const b = rowPtr[pre + 1];
    for (let e = a; e < b; e++) V[col[e]] += w[e];
  }

  let nFire = 0;
  for (let i = 0; i < N; i++) {
    if (refrac[i] === 0 && V[i] >= THRESHOLD) {
      V[i] = 0;
      refrac[i] = REFRAC;
      if (nFire < spiked.length) spiked[nFire] = i;
      nFire++;
    }
  }
  spikeCount = Math.min(nFire, spiked.length);

  const now = performance.now();
  const dt = lastTickAt ? now - lastTickAt : 1000 / TARGET_HZ;
  lastTickAt = now;
  const instHz = dt > 1 ? 1000 / dt : TARGET_HZ;
  hzEma = hzEma ? hzEma * 0.85 + instHz * 0.15 : instHz;
  const ms = now - t0;
  tickMsEma = tickMsEma ? tickMsEma * 0.85 + ms * 0.15 : ms;
  tickN++;

  postMessage({
    type: "tick",
    t: now,
    hz: hzEma,
    tickMs: tickMsEma,
    spikes: nFire,
    rates: channelRates(),
    spark: N ? nFire / N : 0,
  });

  if (running) {
    const wait = Math.max(0, 1000 / TARGET_HZ - ms);
    timer = self.setTimeout(tick, wait) as unknown as number;
  }
}

self.onmessage = (event: MessageEvent) => {
  const msg = event.data as { type: string; buffer?: ArrayBuffer; intensities?: ArrayLike<number> };
  if (msg.type === "init" && msg.buffer) {
    inflate(msg.buffer)
      .then((raw) => {
        parse(raw);
        postMessage({ type: "ready", neurons: N, connections: E });
      })
      .catch((err: Error) => fail(err.message));
    return;
  }
  if (msg.type === "sense" && msg.intensities && sense) {
    const src = msg.intensities;
    const n = Math.min(sense.length, src.length);
    for (let i = 0; i < n; i++) sense[i] = src[i] ?? 0;
    return;
  }
  if (msg.type === "start") {
    if (N === 0) return fail("connectome not loaded");
    if (running) return;
    running = true;
    lastTickAt = 0;
    timer = self.setTimeout(tick, 0) as unknown as number;
    return;
  }
  if (msg.type === "stop") {
    running = false;
    if (timer) self.clearTimeout(timer);
  }
};
