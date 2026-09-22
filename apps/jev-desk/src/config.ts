import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]!]) continue;
    process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env */
}

const env = (key: string, fallback?: string) => process.env[key] ?? fallback;

const decisionEveryBlocks = Number(env("DECISION_EVERY_BLOCKS", "27"));
const blockMs = 300;

function resolveBlocks() {
  const hoursRaw = env("HOURS", "");
  if (hoursRaw) {
    const hours = Number(hoursRaw);
    const blocks = Math.max(1, Math.round((hours * 3_600_000) / blockMs));
    return { blocks, hours };
  }
  const blocks = Number(env("BLOCKS", "200"));
  return { blocks, hours: (blocks * blockMs) / 3_600_000 };
}

function pinJevModelId() {
  const raw = env("JEV_MODEL_ID", "jev-1.13.0")!;
  // Aliases move. Holdouts pin jev-1.13.0 even if .env still says jev-latest.
  if (raw === "jev-latest" || raw.endsWith("-latest")) return "jev-1.13.0";
  return raw;
}

const { blocks, hours } = resolveBlocks();

const tapeRaw = env("TAPE", "live");
const tape = tapeRaw === "mock" || tapeRaw === "replay" || tapeRaw === "kuru" ? tapeRaw : "live";
const mode = env("MODE", "mm") === "range" ? "range" : "mm";

export const config = {
  rpcUrl: env("RPC_URL", "https://rpc.monad.xyz")!,
  market: env("MARKET", "0x065C9d28E428A0db40191a54d33d5b7c71a9C394")!,
  chainId: 143,
  model: (env("MODEL", "mock") === "jev" ? "jev" : "mock") as "mock" | "jev",
  mode: mode as "mm" | "range",
  compare: env("COMPARE", "1") === "1",
  tape,
  replayFixture: env("REPLAY_FIXTURE", "") ?? "",
  blocks,
  hours,
  decisionEveryBlocks,
  horizonBlocks: Number(env("HORIZON_BLOCKS", "100")),
  tradeSizeMon: Number(env("TRADE_SIZE_MON", "200")),
  maxPositionMon: Number(env("MAX_POSITION_MON", "1000")),
  quoteInsideTicks: Number(env("QUOTE_INSIDE_TICKS", "1")),
  inventorySkewTicks: Number(env("INVENTORY_SKEW_TICKS", "2")),
  bankrollUsd: Number(env("BANKROLL_USD", "100")),
  jevModelId: pinJevModelId(),
  jevApiKey: env("TYPESAFE_API_KEY", ""),
  jevUsdPerMTok: 0.042,
  gasUsdPerReplace: Number(env("GAS_USD_PER_REPLACE", "0.02")),
  gasUsdSource: (env("GAS_USD_SOURCE", "assumed-unknown-high") === "rpc-measured" ? "rpc-measured" : "assumed-unknown-high") as
    | "rpc-measured"
    | "assumed-unknown-high",
  gasUnitsPerReplace: Number(env("GAS_UNITS_PER_REPLACE", "810000")),
  replaceMinMs: Number(env("REPLACE_MIN_MS", "8000")),
  replaceMidTicks: Number(env("REPLACE_MID_TICKS", "2")),
  propMaintainBps: Number(env("PROP_MAINTAIN_BPS", "2000")),
  inclusionDelayBlocks: Number(env("INCLUSION_DELAY_BLOCKS", "2")),
  pollLagBlocks: Number(env("POLL_LAG_BLOCKS", "1")),
  adverseTicks: Number(env("ADVERSE_TICKS", "2")),
  staleBookMs: Number(env("STALE_BOOK_MS", "2000")),
  staleBookBlocks: Number(env("STALE_BOOK_BLOCKS", "8")),
  dailyLossUsd: Number(env("DAILY_LOSS_USD", "25")),
  deadManMs: Number(env("DEAD_MAN_MS", "5000")),
  headline: env("HEADLINE", "") ?? "",
  blockMs,
  blockBudgetMs: Number(env("BLOCK_BUDGET_MS", String(decisionEveryBlocks * blockMs))),
  pollMs: 150,
  markout1sBlocks: Math.max(1, Math.round(1000 / blockMs)),
  markout6sBlocks: Math.max(1, Math.round(6000 / blockMs)),
  gates: {
    // Choice/Score confidence floors. Skip is cheap (moderate); lean is expensive (higher).
    // Old MIN_CONFIDENCE=0 was the bug: confidence was logged and never gated.
    regimeMinConfidence: Number(env("REGIME_MIN_CONFIDENCE", env("REGIME_CONF_FLOOR", "0.6"))),
    leanMinConfidence: Number(env("LEAN_MIN_CONFIDENCE", env("LEAN_CONF_MIN", "0.85"))),
    // Noul has no separate confidence — these are probability thresholds.
    quoteOkMin: Number(env("QUOTE_OK_MIN", "0.65")),
    quoteOkUncertainBand: Number(env("QUOTE_OK_UNCERTAIN_BAND", "0.15")),
    toxicPull: Number(env("TOXIC_PULL", "0.55")),
    highConfSlice: Number(env("HIGH_CONF_SLICE", "0.85")),
    headlinePull: Number(env("HEADLINE_PULL", "0.7")),
  },
  range: {
    lookback: Number(env("RANGE_LOOKBACK", "40")),
    shortLookback: Number(env("RANGE_SHORT_LOOKBACK", "8")),
    minWidthTicks: Number(env("RANGE_MIN_WIDTH_TICKS", "4")),
    expandNumer: Number(env("RANGE_EXPAND_NUMER", "5")),
    expandDenom: Number(env("RANGE_EXPAND_DENOM", "2")),
    widthAtrNumer: Number(env("RANGE_WIDTH_ATR_NUMER", "16")),
    widthAtrDenom: Number(env("RANGE_WIDTH_ATR_DENOM", "1")),
    edgeNumer: Number(env("RANGE_EDGE_NUMER", "1")),
    edgeDenom: Number(env("RANGE_EDGE_DENOM", "5")),
    tpNumer: Number(env("RANGE_TP_NUMER", "2")),
    tpDenom: Number(env("RANGE_TP_DENOM", "5")),
    stopNumer: Number(env("RANGE_STOP_NUMER", "1")),
    stopDenom: Number(env("RANGE_STOP_DENOM", "4")),
    actMinConfidence: Number(env("RANGE_ACT_MIN_CONFIDENCE", "0.85")),
  },
};
