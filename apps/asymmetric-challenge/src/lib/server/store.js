import crypto from "node:crypto";
import { evaluateClaim } from "./claim.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";

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
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  return fetchTotalsSupabase();
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
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  await insertTelemetrySupabase(payload);
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
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  return tryClaimSupabase({ guessHex });
}
