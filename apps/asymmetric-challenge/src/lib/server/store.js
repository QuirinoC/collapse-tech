import crypto from "node:crypto";
import { createPool } from "./db.js";
import { evaluateClaim } from "./claim.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";

function isPgConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function isConnectionError(error) {
  const code = error?.code;
  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  const message = String(error?.message || "");
  return (
    message.includes("ENOTFOUND") ||
    message.includes("getaddrinfo") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT")
  );
}

export function getDatabaseErrorMetadata(error) {
  const explicitCode = error?.code;
  if (
    (typeof explicitCode === "string" || typeof explicitCode === "number") &&
    String(explicitCode).length <= 32
  ) {
    return { provider: error?.provider || "database", code: String(explicitCode) };
  }

  const errorCodeMatch = String(error?.message || "").match(
    /\berror code:\s*([a-z0-9_-]{1,32})\b/i
  );
  return {
    provider: error?.provider || "database",
    code: errorCodeMatch ? errorCodeMatch[1] : "unknown",
  };
}

function toProviderError(provider, error) {
  const providerError = new Error(`${provider} request failed`);
  providerError.provider = provider;
  if (error?.code !== undefined) {
    providerError.code = error.code;
  } else {
    const { code } = getDatabaseErrorMetadata(error);
    if (code !== "unknown") {
      providerError.code = code;
    }
  }
  return providerError;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function fetchTotalsPg() {
  return withPgPool(async (pool) => {
    const result = await pool.query(
      `select
        attempts_total,
        attempts_auto,
        attempts_manual
       from telemetry_totals`
    );
    const row = result.rows[0] || {};
    return {
      total: toNumber(row.attempts_total),
      auto: toNumber(row.attempts_auto),
      manual: toNumber(row.attempts_manual),
    };
  });
}

async function fetchTotalsSupabase() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("telemetry_totals")
    .select("attempts_total, attempts_auto, attempts_manual")
    .single();
  if (error) {
    throw toProviderError("supabase", error);
  }
  return {
    total: toNumber(data?.attempts_total),
    auto: toNumber(data?.attempts_auto),
    manual: toNumber(data?.attempts_manual),
  };
}

export async function fetchTotals() {
  if (isPgConfigured()) {
    try {
      return await fetchTotalsPg();
    } catch (error) {
      if (isConnectionError(error) && isSupabaseConfigured()) {
        return await fetchTotalsSupabase();
      }
      throw error;
    }
  }

  if (isSupabaseConfigured()) {
    return await fetchTotalsSupabase();
  }

  throw new Error("Database not configured");
}

async function insertTelemetryPg(payload) {
  await withPgPool((pool) =>
    pool.query(
      `insert into telemetry_totals
        (id, attempts_total, attempts_auto, attempts_manual)
       values (1, $1, $2, $3)
       on conflict (id) do update
       set attempts_total = telemetry_totals.attempts_total + excluded.attempts_total,
           attempts_auto = telemetry_totals.attempts_auto + excluded.attempts_auto,
           attempts_manual = telemetry_totals.attempts_manual + excluded.attempts_manual`,
      [
        payload.attemptsTotal,
        payload.attemptsAuto,
        payload.attemptsManual,
      ]
    )
  );
}

async function insertTelemetrySupabase(payload) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("record_telemetry", {
    in_attempts_total: payload.attemptsTotal,
    in_attempts_auto: payload.attemptsAuto,
    in_attempts_manual: payload.attemptsManual,
  });
  if (error) {
    throw toProviderError("supabase", error);
  }
}

export async function insertTelemetry(payload) {
  if (isPgConfigured()) {
    try {
      await insertTelemetryPg(payload);
      return;
    } catch (error) {
      if (isConnectionError(error) && isSupabaseConfigured()) {
        await insertTelemetrySupabase(payload);
        return;
      }
      throw error;
    }
  }

  if (isSupabaseConfigured()) {
    await insertTelemetrySupabase(payload);
    return;
  }

  throw new Error("Database not configured");
}

async function tryClaimPg({ guessHex }) {
  const status = evaluateClaim({ guessHex, alreadyWon: false });
  if (status === "nope") {
    return { status };
  }

  const claimToken = crypto.randomBytes(16).toString("hex");
  const result = await withPgPool((pool) =>
    pool.query(
      `insert into winners (claim_token, winner_slot)
       values ($1, 1)
       on conflict (winner_slot) do nothing
       returning claim_token`,
      [claimToken]
    )
  );

  if (result.rows.length === 0) {
    return { status: "already_won" };
  }

  return { status: "won", claimToken };
}

async function withPgPool(operation) {
  const pool = await createPool();
  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

async function tryClaimSupabase({ guessHex }) {
  const status = evaluateClaim({ guessHex, alreadyWon: false });
  if (status === "nope") {
    return { status };
  }

  const supabase = getSupabaseAdmin();
  const claimToken = crypto.randomBytes(16).toString("hex");
  const { error: insertError } = await supabase.from("winners").insert({
    claim_token: claimToken,
    winner_slot: 1,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { status: "already_won" };
    }
    throw toProviderError("supabase", insertError);
  }

  return { status: "won", claimToken };
}

export async function tryClaim({ guessHex }) {
  if (isPgConfigured()) {
    try {
      return await tryClaimPg({ guessHex });
    } catch (error) {
      if (isConnectionError(error) && isSupabaseConfigured()) {
        return await tryClaimSupabase({ guessHex });
      }
      throw error;
    }
  }

  if (isSupabaseConfigured()) {
    return await tryClaimSupabase({ guessHex });
  }

  throw new Error("Database not configured");
}
