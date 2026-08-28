import crypto from "node:crypto";
import { isHexString, normalizeHex } from "../shared/hex.js";

const SECRET_ENV_NAME = "SECRET_KEY_HEX";

let hydratePromise;

export async function hydrateWorkerSecrets() {
  const runningOnWorker = typeof caches !== "undefined";
  if (!runningOnWorker && process.env[SECRET_ENV_NAME]) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const { getCloudflareContext } = await import("@opennextjs/cloudflare");
        let context = getCloudflareContext();
        if (typeof context?.then === "function") context = await context;
        const env = context?.env;
        if (env?.SECRET_KEY_HEX) {
          process.env[SECRET_ENV_NAME] = env.SECRET_KEY_HEX;
        }
      } catch {
        // Local Node tests and `next build` have no Worker bindings.
      }
    })();
  }
  await hydratePromise;
}

export async function getSecretHex() {
  await hydrateWorkerSecrets();
  const raw = process.env[SECRET_ENV_NAME];
  if (!raw) {
    throw new Error("SECRET_KEY_HEX is required");
  }
  const normalized = normalizeHex(raw);
  if (!isHexString(normalized, 64)) {
    throw new Error("SECRET_KEY_HEX must be 64 hex characters");
  }
  return normalized;
}

export async function getCommitmentHash() {
  const secretHex = await getSecretHex();
  const secretBytes = Buffer.from(secretHex, "hex");
  return crypto.createHash("sha256").update(secretBytes).digest("hex");
}

export async function getChallengeId() {
  const hash = await getCommitmentHash();
  return hash.slice(0, 12).toUpperCase();
}

export async function guessMatchesSecret(guessHex) {
  const secretHex = await getSecretHex();
  const normalizedGuess = normalizeHex(guessHex);
  if (!isHexString(normalizedGuess, 64)) {
    return false;
  }
  const secretBuffer = Buffer.from(secretHex, "hex");
  const guessBuffer = Buffer.from(normalizedGuess, "hex");
  if (secretBuffer.length !== guessBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(secretBuffer, guessBuffer);
}
