import crypto from "node:crypto";
import { getPool } from "./db.js";
import { evaluateClaim } from "./claim.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";

let pgDisabled = false;

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

function markPgDisabled(error) {
  if (isConnectionError(error)) {
    pgDisabled = true;
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function fetchTotalsPg() {
  const pool = getPool();
  const result = await pool.query(
    `select
      coalesce(sum(attempts_total), 0) as attempts_total,
      coalesce(sum(attempts_auto), 0) as attempts_auto,
      coalesce(sum(attempts_manual), 0) as attempts_manual
     from telemetry_aggregates`
  );
  const row = result.rows[0] || {};
  return {
    total: toNumber(row.attempts_total),
    auto: toNumber(row.attempts_auto),
    manual: toNumber(row.attempts_manual),
  };
}

async function fetchTotalsSupabase() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("telemetry_totals")
    .select("attempts_total, attempts_auto, attempts_manual")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return {
    total: toNumber(data?.attempts_total),
    auto: toNumber(data?.attempts_auto),
    manual: toNumber(data?.attempts_manual),
  };
}

export async function fetchTotals() {
  if (isPgConfigured() && !pgDisabled) {
    try {
      return await fetchTotalsPg();
    } catch (error) {
      markPgDisabled(error);
      if (isSupabaseConfigured()) {
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
  const pool = getPool();
  await pool.query(
    `insert into telemetry_aggregates
      (client_id, session_id, started_at, ended_at, attempts_total, attempts_auto, attempts_manual, auto_enabled)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      payload.clientId,
      payload.sessionId,
      payload.startedAt,
      payload.endedAt,
      payload.attemptsTotal,
      payload.attemptsAuto,
      payload.attemptsManual,
      payload.autoEnabled,
    ]
  );
}

async function insertTelemetrySupabase(payload) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("telemetry_aggregates").insert({
    client_id: payload.clientId,
    session_id: payload.sessionId,
    started_at: payload.startedAt,
    ended_at: payload.endedAt,
    attempts_total: payload.attemptsTotal,
    attempts_auto: payload.attemptsAuto,
    attempts_manual: payload.attemptsManual,
    auto_enabled: payload.autoEnabled,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function insertTelemetry(payload) {
  if (isPgConfigured() && !pgDisabled) {
    try {
      await insertTelemetryPg(payload);
      return;
    } catch (error) {
      markPgDisabled(error);
      if (isSupabaseConfigured()) {
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

async function tryClaimPg({ guessHex, clientId, sessionId }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const existing = await client.query("select id from winners limit 1");
    const alreadyWon = existing.rows.length > 0;
    const status = evaluateClaim({ guessHex, alreadyWon });

    if (status === "already_won" || status === "nope") {
      await client.query("commit");
      return { status };
    }

    const claimToken = crypto.randomBytes(16).toString("hex");
    await client.query(
      "insert into winners (claim_token, client_id, session_id) values ($1, $2, $3)",
      [claimToken, clientId, sessionId]
    );
    await client.query("commit");
    return { status: "won", claimToken };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function tryClaimSupabase({ guessHex, clientId, sessionId }) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("winners")
    .select("id")
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const alreadyWon = Array.isArray(existing) && existing.length > 0;
  const status = evaluateClaim({ guessHex, alreadyWon });

  if (status === "already_won" || status === "nope") {
    return { status };
  }

  const claimToken = crypto.randomBytes(16).toString("hex");
  const { error: insertError } = await supabase.from("winners").insert({
    claim_token: claimToken,
    client_id: clientId,
    session_id: sessionId,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { status: "already_won" };
    }
    throw new Error(insertError.message);
  }

  return { status: "won", claimToken };
}

export async function tryClaim({ guessHex, clientId, sessionId }) {
  if (isPgConfigured() && !pgDisabled) {
    try {
      return await tryClaimPg({ guessHex, clientId, sessionId });
    } catch (error) {
      markPgDisabled(error);
      if (isSupabaseConfigured()) {
        return await tryClaimSupabase({ guessHex, clientId, sessionId });
      }
      throw error;
    }
  }

  if (isSupabaseConfigured()) {
    return await tryClaimSupabase({ guessHex, clientId, sessionId });
  }

  throw new Error("Database not configured");
}
