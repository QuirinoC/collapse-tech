import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Load apps/balatro-jev/.env into process.env without overriding existing vars. */
export function loadDotEnv(envPath?: string): void {
  const path =
    envPath ??
    join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* .env optional */
  }
}

loadDotEnv();

const env = (key: string, fallback?: string) => process.env[key] ?? fallback;

function pinJevModelId(): string {
  const raw = env("JEV_MODEL_ID", "jev-1.13.0")!;
  // Aliases move. Pin a concrete version even if .env still says jev-latest.
  if (raw === "jev-latest" || raw.endsWith("-latest")) return "jev-1.13.0";
  return raw;
}

export type JevMode = "mock" | "live";

export function resolveMode(e: NodeJS.ProcessEnv = process.env): JevMode {
  const forced = e.BALATRO_JEV_MODE?.trim().toLowerCase();
  if (forced === "mock") return "mock";
  if (forced === "live") return "live";
  return e.TYPESAFE_API_KEY?.trim() ? "live" : "mock";
}

export const config = {
  jevApiKey: env("TYPESAFE_API_KEY", "") ?? "",
  jevModelId: pinJevModelId(),
  mode: resolveMode(),
  minActionConfidence: Number(env("MIN_ACTION_CONFIDENCE", "0.45")),
  jevTimeoutMs: Number(env("JEV_TIMEOUT_MS", "30000")),
  ipcDir: env("BALATRO_JEV_IPC_DIR", "") ?? "",
};
