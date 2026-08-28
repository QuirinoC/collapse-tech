import crypto from "node:crypto";
import { evaluateClaim } from "./claim.js";
import { hydrateWorkerSecrets } from "./secret.js";

const SECRET_ENV_NAME = "SECRET_KEY_HEX";

let testD1Binding = null;

export function setD1Binding(binding) {
  testD1Binding = binding ?? null;
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
  providerError.cause = error;
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

function isUniqueConstraintError(error) {
  const message = [
    error?.message,
    error?.cause?.message,
    error?.cause?.cause?.message,
    error?.error,
  ]
    .filter(Boolean)
    .join(" ");
  const code = error?.code ?? error?.cause?.code;
  return code === "23505" || code === "SQLITE_CONSTRAINT" || /unique constraint failed/i.test(message);
}

async function resolveD1Binding() {
  if (testD1Binding) return testD1Binding;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    let context = getCloudflareContext();
    if (typeof context?.then === "function") context = await context;
    const env = context?.env;
    if (env?.SECRET_KEY_HEX) {
      process.env[SECRET_ENV_NAME] = env.SECRET_KEY_HEX;
    }
    return env?.DB ?? null;
  } catch {
    // Not running inside the OpenNext Cloudflare worker (e.g. local Node tests).
  }

  return null;
}

async function requireD1() {
  const binding = await resolveD1Binding();
  if (!binding) {
    throw toProviderError("d1", { code: "binding_missing" });
  }
  return binding;
}

async function d1All(sql, params = []) {
  const binding = await requireD1();
  try {
    const { results, success, error } = await binding
      .prepare(sql)
      .bind(...params)
      .all();
    if (!success) {
      throw toProviderError("d1", { message: error ?? "D1 query failed" });
    }
    return results || [];
  } catch (error) {
    if (error?.provider === "d1") throw error;
    throw toProviderError("d1", error);
  }
}

async function d1Run(sql, params = []) {
  const binding = await requireD1();
  try {
    const result = await binding.prepare(sql).bind(...params).run();
    if (result?.success === false) {
      throw toProviderError("d1", { message: result.error ?? "D1 write failed" });
    }
    return result;
  } catch (error) {
    if (error?.provider === "d1") throw error;
    throw toProviderError("d1", error);
  }
}

export async function fetchTotals() {
  const rows = await d1All(
    `SELECT attempts_total, attempts_auto, attempts_manual
     FROM telemetry_totals
     WHERE id = 1`
  );
  const row = rows[0] || {};
  return {
    total: toNumber(row.attempts_total),
    auto: toNumber(row.attempts_auto),
    manual: toNumber(row.attempts_manual),
  };
}

export async function insertTelemetry(payload) {
  await d1Run(
    `INSERT INTO telemetry_totals (id, attempts_total, attempts_auto, attempts_manual)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       attempts_total = telemetry_totals.attempts_total + excluded.attempts_total,
       attempts_auto = telemetry_totals.attempts_auto + excluded.attempts_auto,
       attempts_manual = telemetry_totals.attempts_manual + excluded.attempts_manual`,
    [payload.attemptsTotal, payload.attemptsAuto, payload.attemptsManual]
  );
}

export async function tryClaim({ guessHex }) {
  await hydrateWorkerSecrets();
  const status = await evaluateClaim({ guessHex, alreadyWon: false });
  if (status === "nope") {
    return { status };
  }

  const claimToken = crypto.randomBytes(16).toString("hex");
  try {
    await d1Run(
      `INSERT INTO winners (id, claim_token, winner_slot) VALUES (?, ?, 1)`,
      [crypto.randomUUID(), claimToken]
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "already_won" };
    }
    throw error;
  }

  return { status: "won", claimToken };
}
