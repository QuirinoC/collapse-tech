/** Integer ticks, lots, and cash. No IEEE float in the money path. */

export type Px = bigint;
export type Lots = bigint;
export type Cash = bigint;
export type Usd = bigint;

export const USD_MICROS = 1_000_000n;

export function abs(n: bigint): bigint {
  return n < 0n ? -n : n;
}

export function clamp(n: bigint, lo: bigint, hi: bigint): bigint {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

/** Round n/d to nearest, ties away from zero. */
export function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("division by zero");
  const sign = n < 0n !== d < 0n ? -1n : 1n;
  const an = abs(n);
  const ad = abs(d);
  const q = an / ad;
  const r = an % ad;
  return sign * (r * 2n >= ad ? q + 1n : q);
}

/** Parse a decimal string ("0.02", "200") into integer units. */
export function parseDecimal(s: string, decimals: number): bigint {
  const t = s.trim();
  if (!t || t === "." || t === "-") throw new Error(`bad decimal ${s}`);
  const neg = t.startsWith("-");
  const raw = neg ? t.slice(1) : t;
  const [w, f = ""] = raw.split(".");
  if (!/^\d*$/.test(w) || !/^\d*$/.test(f) || (w === "" && f === "")) throw new Error(`bad decimal ${s}`);
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const whole = w === "" ? "0" : w;
  const n = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return neg ? -n : n;
}

export function formatUnits(n: bigint, decimals: number): string {
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Display-only. Never use the result for price, size, or cash. */
export function displayNumber(n: bigint, decimals: number): number {
  return Number(formatUnits(n, decimals));
}
